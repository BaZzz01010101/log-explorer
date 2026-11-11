export function gcpErrorMessage(failure: unknown): string {
  const message =
    failure instanceof Error ? failure.message : "Google Cloud request failed.";
  return message.replace(
    /^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/i,
    "",
  );
}
