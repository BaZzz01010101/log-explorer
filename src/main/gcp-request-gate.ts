import { delay, throwIfAborted } from "./aws-adapter";

export function createGcpRequestGate(limit = 48, windowMs = 60000) {
  const projects = new Map<string, number[]>();
  return async (project: string, signal: AbortSignal): Promise<void> => {
    for (;;) {
      throwIfAborted(signal);
      const now = Date.now();
      const times = (projects.get(project) ?? []).filter((time) => time > now - windowMs);
      if (times.length < limit) {
        times.push(now);
        projects.set(project, times);
        return;
      }
      projects.set(project, times);
      await delay(Math.max(1, times[0] + windowMs - now), signal);
    }
  };
}

export const waitForGcpRequest = createGcpRequestGate();
