// Never evaluate a user pattern on the renderer thread. Every page has a fresh,
// terminable worker and a bounded execution budget after its startup handshake.
export function matchGroupNames(
  pattern: string,
  names: string[],
  signal?: AbortSignal,
  ignoreCase = false,
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Regex search cancelled"));
      return;
    }
    if (typeof Worker === "undefined") {
      reject(new Error("Regex search requires worker support"));
      return;
    }
    const worker = new Worker(
      new URL("./group-regex.worker.ts", import.meta.url),
      { type: "module" },
    );
    let settled = false;
    const finish = (error?: string, matches?: number[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      worker.terminate();
      if (error) reject(new Error(error));
      else resolve((matches ?? []).map((index) => names[index]));
    };
    const cancel = () => finish("Regex search cancelled");
    let timer = setTimeout(
      () => finish("Regex worker did not start within 5 seconds"),
      5000,
    );
    signal?.addEventListener("abort", cancel, { once: true });
    worker.onerror = () => finish("Could not run regex search");
    worker.onmessage = ({
      data,
    }: MessageEvent<{
      ready?: boolean;
      error?: string;
      matches?: number[];
    }>) => {
      if (settled) return;
      if (data.ready) {
        clearTimeout(timer);
        timer = setTimeout(
          () => finish("Regex search exceeded 500 ms; simplify the pattern"),
          500,
        );
        worker.postMessage({
          pattern,
          names,
          ...(ignoreCase ? { ignoreCase: true } : {}),
        });
      } else finish(data.error, data.matches);
    };
  });
}
