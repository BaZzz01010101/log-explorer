export async function setAwsAccess(
  access: { setEnabled(enabled: boolean): void },
  enabled: boolean,
  shutdown: () => Promise<void>,
): Promise<void> {
  if (enabled) access.setEnabled(true);
  else {
    // Revoke and remember the choice before waiting for asynchronous cleanup.
    // Cleanup must still run if the preference cannot be written.
    try {
      access.setEnabled(false);
    } finally {
      await shutdown();
    }
  }
}
