import { Alert, Button, Stack, Text } from "@mantine/core";
import { KeyRound, Trash2 } from "lucide-react";

interface RemovedSpaceNoticeProps {
  /** App vocabulary for what was shared — e.g. "conversation", "vault". */
  kindLabel: string;
  /** Display name of the removed space, when known. */
  name: string | null;
  /** App cleanup for the local plaintext copy. Omit to hide the action. */
  onDeleteLocalCopy?: () => void;
  /** True while deletion is running (drives the button spinner). */
  deleting?: boolean;
}

/**
 * Victim-side treatment for a shared space this user was removed from.
 *
 * Removal re-keys the space: every record is rewrapped under a fresh key
 * the removed device never receives. This notice replaces the workspace
 * content — the honest local-first story is that pre-removal data already
 * downloaded stays on the device until the user deletes it, but nothing
 * new can arrive or be written.
 */
export function RemovedSpaceNotice({
  kindLabel,
  name,
  onDeleteLocalCopy,
  deleting,
}: RemovedSpaceNoticeProps) {
  return (
    <Alert
      icon={<KeyRound size={18} />}
      color="red"
      variant="light"
      data-testid="removed-space-notice"
    >
      <Stack gap="xs">
        <div>
          <Text size="sm" fw={600}>
            You no longer have access to this {kindLabel}
          </Text>
          <Text size="xs" c="dimmed">
            {name ? `"${name}" was` : "It was"} re-keyed when you were removed — new content is
            encrypted with keys this device doesn't have, so it can't arrive here anymore.
          </Text>
        </div>
        {onDeleteLocalCopy && (
          <>
            <Text size="xs" c="dimmed">
              What existed before removal stays on this device until you delete it.
            </Text>
            <Button
              size="xs"
              color="red"
              variant="light"
              leftSection={<Trash2 size={14} />}
              loading={deleting}
              onClick={onDeleteLocalCopy}
              data-testid="delete-local-copy"
            >
              Delete local copy
            </Button>
          </>
        )}
      </Stack>
    </Alert>
  );
}
