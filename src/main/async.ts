export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted)
    throw Object.assign(new Error("Operation cancelled"), {
      name: "AbortError",
    });
}

export function delay(ms: number, signal: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(
        Object.assign(new Error("Operation cancelled"), { name: "AbortError" }),
      );
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

export function withAbort<T>(
  operation: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener("abort", abort);
      reject(
        Object.assign(new Error("Operation cancelled"), { name: "AbortError" }),
      );
    };
    signal.addEventListener("abort", abort, { once: true });
    operation.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
    if (signal.aborted) abort();
  });
}

export class Semaphore {
  private active = 0;
  private waiters: Array<{
    signal: AbortSignal;
    resolve: (release: () => void) => void;
    reject: (error: Error) => void;
    abort: () => void;
  }> = [];
  constructor(private readonly capacity: number) {}
  async acquire(signal: AbortSignal): Promise<() => void> {
    throwIfAborted(signal);
    if (this.active < this.capacity) {
      this.active++;
      return this.release;
    }
    return new Promise((resolve, reject) => {
      const waiter = {
        signal,
        resolve,
        reject,
        abort: () => {
          const index = this.waiters.indexOf(waiter);
          if (index >= 0) this.waiters.splice(index, 1);
          reject(
            Object.assign(new Error("Operation cancelled"), {
              name: "AbortError",
            }),
          );
        },
      };
      this.waiters.push(waiter);
      signal.addEventListener("abort", waiter.abort, { once: true });
    });
  }
  private release = () => {
    const next = this.waiters.shift();
    if (next) {
      next.signal.removeEventListener("abort", next.abort);
      next.resolve(this.release);
    } else this.active--;
  };
}
