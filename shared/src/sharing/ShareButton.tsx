import { useState } from "react";
import { Button, Modal, Stack, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { Share2 } from "lucide-react";
import { HandleInput, humanizeShareError } from "./HandleInput.js";

interface ShareButtonProps {
  onShare: (handle: string) => Promise<void>;
  /** Modal title naming the shared thing, e.g. "Share list" / "Share album". */
  title?: string;
}

export function ShareButton({ onShare, title = "Share" }: ShareButtonProps) {
  const [opened, { open, close }] = useDisclosure(false);
  const [handle, setHandle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleShare = async () => {
    const h = handle.trim();
    if (!h) return;
    setLoading(true);
    setError("");
    try {
      await onShare(h);
      setHandle("");
      close();
    } catch (err) {
      setError(humanizeShareError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setHandle("");
    setError("");
    close();
  };

  return (
    <>
      <Button size="xs" variant="light" leftSection={<Share2 size={14} />} onClick={open}>
        Share
      </Button>

      <Modal opened={opened} onClose={handleClose} title={title} size="sm">
        <Stack gap="sm">
          <HandleInput
            label="User handle"
            value={handle}
            onChange={(e) => setHandle(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleShare();
            }}
            autoFocus
          />
          {error && (
            <Text size="sm" c="red">
              {error}
            </Text>
          )}
          <Button loading={loading} disabled={!handle.trim()} onClick={handleShare} fullWidth>
            Share
          </Button>
        </Stack>
      </Modal>
    </>
  );
}
