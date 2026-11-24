import { Button } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconDownload } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { Tooltip } from "./AppTooltip";

/** Shown while a newer local build waits for the app to close. */
export function UpdateButton() {
  const [version, setVersion] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  useEffect(() => {
    let current = true;
    const unsubscribe = window.explorer?.onPendingUpdate?.((next) => {
      current = false;
      setVersion(next);
    });
    void window.explorer?.pendingUpdate?.().then((next) => {
      if (current) setVersion(next);
    });
    return () => {
      current = false;
      unsubscribe?.();
    };
  }, []);
  if (!version) return null;
  const install = async () => {
    setInstalling(true);
    try {
      await window.explorer.installUpdate();
    } catch (error) {
      notifications.show({
        color: "red",
        title: "Update failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
    // Still open: the close was cancelled or the build is gone.
    setInstalling(false);
  };
  return (
    <Tooltip label={`Restart to update to ${version}`}>
      <Button
        className="app-update"
        size="compact-sm"
        color="teal"
        leftSection={<IconDownload size={14} />}
        loading={installing}
        onClick={() => void install()}
      >
        Update
      </Button>
    </Tooltip>
  );
}
