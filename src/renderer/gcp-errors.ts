export function gcpErrorMessage(failure: unknown): string {
  const message =
    failure instanceof Error ? failure.message : "Google Cloud request failed.";
  return message.replace(
    /^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/i,
    "",
  );
}

export function isGcpAuthorizationError(message: string): boolean {
  return /could not obtain a google cloud access token|google cloud credentials expired|UNAUTHENTICATED|invalid authentication credentials/i.test(
    message,
  );
}

/** Announced after a successful Google Cloud sign-in from anywhere in the app. */
export const GCP_SIGNED_IN_EVENT = "explorer:gcp-signed-in";

/** True for the error of a sign-in the user cancelled. */
export function isGcpSignInCancelled(message: string): boolean {
  return /^Google sign-in was cancelled\.$/.test(message);
}

/** Cancels a running sign-in so a new one can start. */
export function cancelGoogleCloudSignIn(): Promise<void> {
  return window.explorer.gcpCancelSignIn();
}

/** Signs in through the Google Cloud CLI, then lets waiting views retry. */
export async function signInToGoogleCloud(): Promise<void> {
  await window.explorer.gcpSignIn();
  window.dispatchEvent(new Event(GCP_SIGNED_IN_EVENT));
}
