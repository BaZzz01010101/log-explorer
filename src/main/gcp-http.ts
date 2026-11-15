import type { GcpIdentity } from "../shared/contracts";
import { delay, throwIfAborted } from "./aws-adapter";

export interface GoogleAuth {
  token(identity: GcpIdentity): Promise<string>;
  invalidateToken?(identity: GcpIdentity, expected?: string): void;
}
export interface GoogleFetchOptions {
  url: URL | string;
  method?: "GET" | "POST";
  body?: unknown;
  signal?: AbortSignal;
  timeout?: number;
  /** Runs before every attempt, e.g. the per-project request-rate gate. */
  beforeAttempt?: (signal: AbortSignal) => Promise<void>;
  /** Text for HTTP 403, which depends on what was requested. */
  forbidden?: string;
  /** Prefix for other HTTP failures. */
  failure?: string;
}

/**
 * The one Google HTTP client: refreshes the token once on 401, retries 429/503
 * with backoff, honours cancellation and maps failures to readable errors.
 */
export async function googleFetch<T>(
  auth: GoogleAuth,
  identity: GcpIdentity,
  options: GoogleFetchOptions,
  transport: typeof fetch = fetch,
): Promise<T> {
  const signal = options.signal ?? new AbortController().signal;
  throwIfAborted(signal);
  let token = await auth.token(identity);
  let refreshed = false,
    retries = 0,
    response: Response;
  for (;;) {
    throwIfAborted(signal);
    await options.beforeAttempt?.(signal);
    response = await transport(options.url, {
      method: options.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
        ...(identity.quotaProject
          ? { "X-Goog-User-Project": identity.quotaProject }
          : {}),
      },
      ...(options.body !== undefined
        ? { body: JSON.stringify(options.body) }
        : {}),
      signal: AbortSignal.any([
        signal,
        AbortSignal.timeout(options.timeout ?? 30000),
      ]),
      redirect: "error",
    });
    if (response.status === 401 && !refreshed && auth.invalidateToken) {
      refreshed = true;
      auth.invalidateToken(identity, token);
      token = await auth.token(identity);
      continue;
    }
    if ((response.status === 429 || response.status === 503) && retries < 3) {
      const retryAfter = Number(response.headers.get("retry-after"));
      await delay(
        Math.min(
          30000,
          Math.max(
            1000 * 2 ** retries,
            Number.isFinite(retryAfter) ? retryAfter * 1000 : 0,
          ),
        ),
        signal,
      );
      retries++;
      continue;
    }
    break;
  }
  if (response.status === 401)
    throw new Error("Google Cloud credentials expired. Sign in again and retry.");
  if (response.status === 403)
    throw new Error(
      options.forbidden ??
        "Google Cloud denied access. Check permissions and the selected account.",
    );
  if (!response.ok) {
    const details = (await response.json().catch(() => null)) as {
      error?: { message?: unknown };
    } | null;
    const message =
      typeof details?.error?.message === "string"
        ? details.error.message.slice(0, 500)
        : "";
    throw new Error(
      `${options.failure ?? "Google Cloud request failed"} (HTTP ${response.status})${message ? `: ${message}` : "."}`,
    );
  }
  return (await response.json()) as T;
}
