import { useEffect, useRef, useState } from "react";
import { Alert, Button, Text } from "@mantine/core";
import {
  GCP_SIGNED_IN_EVENT,
  gcpErrorMessage,
  signInToGoogleCloud,
} from "../gcp-errors";

/**
 * Replaces a failed view's Retry when Google Cloud authorization expired.
 * Any successful sign-in (here, in another view or in the Google Cloud
 * explorer) reruns the view automatically.
 */
export function GcpSignInAlert({
  live,
  onRetry,
}: {
  live: boolean;
  onRetry(): void;
}) {
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState("");
  const retry = useRef(onRetry);
  retry.current = onRetry;
  useEffect(() => {
    const signedIn = () => retry.current();
    window.addEventListener(GCP_SIGNED_IN_EVENT, signedIn);
    return () => window.removeEventListener(GCP_SIGNED_IN_EVENT, signedIn);
  }, []);
  const signIn = async () => {
    setSigningIn(true);
    setError("");
    try {
      await signInToGoogleCloud();
    } catch (failure) {
      setError(gcpErrorMessage(failure));
    } finally {
      setSigningIn(false);
    }
  };
  return (
    <Alert color="blue" title="Sign in to Google Cloud" m="xs">
      <Text size="xs">
        Your Google Cloud authorization has expired.{" "}
        {live ? "Live streaming resumes" : "The query runs again"} automatically
        after you sign in.
      </Text>
      <Button
        mt="xs"
        size="compact-xs"
        loading={signingIn}
        onClick={() => void signIn()}
      >
        Sign in
      </Button>
      {signingIn && (
        <Text size="xs" c="dimmed" mt={4}>
          Complete sign-in in your browser…
        </Text>
      )}
      {error && (
        <Text size="xs" c="red" mt={4} role="alert">
          {error}
        </Text>
      )}
    </Alert>
  );
}
