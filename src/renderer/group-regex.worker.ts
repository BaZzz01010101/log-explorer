self.onmessage = ({
  data,
}: MessageEvent<{ pattern: string; names: string[] }>) => {
  try {
    const expression = new RegExp(data.pattern);
    const matches = data.names.flatMap((name, index) =>
      expression.test(name) ? [index] : [],
    );
    self.postMessage({ matches });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
self.postMessage({ ready: true });
export {};
