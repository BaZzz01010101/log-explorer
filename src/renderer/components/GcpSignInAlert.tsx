import { useEffect, useRef } from "react";
import { Alert, Button, Group, Text } from "@mantine/core";
import { GCP_SIGNED_IN_EVENT } from "../gcp-errors";
import { useGcpSignIn } from "../useGcpSignIn";

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
  const { signingIn, error, signIn, cancel } = useGcpSignIn();
  const retry = useRef(onRetry);
  retry.current = onRetry;
  useEffect(() => {
    const signedIn = () => retry.current();
    window.addEventListener(GCP_SIGNED_IN_EVENT, signedIn);
    return () => window.removeEventListener(GCP_SIGNED_IN_EVENT, signedIn);
  }, []);
  return (
    <Alert color="blue" title="Sign in to Google Cloud" m="xs">
      <Text size="xs">
        Your Google Cloud authorization has expired.{" "}
        {live ? "Live streaming resumes" : "The query runs again"} automatically
        after you sign in.
      </Text>
      <Group gap={6} mt="xs">
        <Button
          size="compact-xs"
          loading={signingIn}
          onClick={() => void signIn()}
        >
          Sign in
        </Button>
        {signingIn && (
          <Button
            size="compact-xs"
            variant="default"
            onClick={() => void cancel()}
          >
            Cancel
          </Button>
        )}
      </Group>
      {error && (
        <Text size="xs" c="red" mt={4} role="alert">
          {error}
        </Text>
      )}
    </Alert>
  );
}
