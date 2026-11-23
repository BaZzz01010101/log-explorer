import { useRef, useState } from "react";
import {
  cancelGoogleCloudSignIn,
  gcpErrorMessage,
  isGcpSignInCancelled,
  signInToGoogleCloud,
} from "./gcp-errors";

/**
 * Google Cloud sign-in state with cancel. A cancelled attempt never reports
 * an error or clears a newer attempt.
 */
export function useGcpSignIn(afterSignIn?: () => Promise<void> | void) {
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState("");
  const attempt = useRef(0);
  const after = useRef(afterSignIn);
  after.current = afterSignIn;
  const signIn = async () => {
    const id = ++attempt.current;
    setSigningIn(true);
    setError("");
    try {
      await signInToGoogleCloud();
      if (id === attempt.current) await after.current?.();
    } catch (failure) {
      const message = gcpErrorMessage(failure);
      if (id === attempt.current && !isGcpSignInCancelled(message))
        setError(message);
    } finally {
      if (id === attempt.current) setSigningIn(false);
    }
  };
  const cancel = async () => {
    attempt.current++;
    setSigningIn(false);
    setError("");
    try {
      await cancelGoogleCloudSignIn();
    } catch (failure) {
      setError(gcpErrorMessage(failure));
    }
  };
  return { signingIn, error, signIn, cancel };
}
