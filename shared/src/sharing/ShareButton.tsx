import { useState } from "react";
import { Button, Modal, TextInput, Stack, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { Share2 } from "lucide-react";

interface ShareButtonProps {
  onShare: (handle: string) => Promise<void>;
}

export function ShareButton({ onShare }: ShareButtonProps) {
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
      setError(err instanceof Error ? err.message : "Share failed");
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

      <Modal opened={opened} onClose={handleClose} title="Share list" size="sm">
        <Stack gap="sm">
          <TextInput
            placeholder="user@domain"
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
