import { useState } from "react";
import { Paper, Group, Text, ActionIcon, Stack } from "@mantine/core";
import { Mail, Check, X } from "lucide-react";
import type { SpaceRecord, SpaceFields } from "betterbase/sync";

interface InvitationBannerProps {
  invitations: readonly (SpaceRecord & SpaceFields)[];
  onAccept: (record: SpaceRecord & SpaceFields) => Promise<void>;
  onDecline: (record: SpaceRecord & SpaceFields) => Promise<void>;
}

export function InvitationBanner({ invitations, onAccept, onDecline }: InvitationBannerProps) {
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handle = async (
    record: SpaceRecord & SpaceFields,
    action: (r: SpaceRecord & SpaceFields) => Promise<void>,
  ) => {
    setBusy((b) => ({ ...b, [record.id]: true }));
    setErrors((e) => ({ ...e, [record.id]: "" }));
    try {
      await action(record);
    } catch (err) {
      setErrors((e) => ({
        ...e,
        [record.id]: err instanceof Error ? err.message : "Action failed",
      }));
    } finally {
      setBusy((b) => ({ ...b, [record.id]: false }));
    }
  };

  return (
    <Paper
      px="md"
      py="xs"
      radius={0}
      style={{
        background: "var(--mantine-color-blue-0)",
        borderBottom: "1px solid var(--mantine-color-blue-2)",
      }}
    >
      <Stack gap={4}>
        {invitations.map((inv) => (
          <Stack key={inv.id} gap={2}>
            <Group justify="space-between" wrap="nowrap">
              <Group gap="xs" wrap="nowrap">
                <Mail size={14} color="var(--mantine-color-blue-6)" />
                <Text size="sm">
                  <Text span fw={600}>
                    {inv.name}
                  </Text>{" "}
                  {inv.invitedBy ? (
                    <>
                      from{" "}
                      <Text span fw={500}>
                        {inv.invitedBy}
                      </Text>
                    </>
                  ) : null}
                </Text>
              </Group>
              <Group gap={4} wrap="nowrap">
                <ActionIcon
                  size="sm"
                  variant="light"
                  color="green"
                  loading={busy[inv.id]}
                  onClick={() => handle(inv, onAccept)}
                  title="Accept"
                >
                  <Check size={14} />
                </ActionIcon>
                <ActionIcon
                  size="sm"
                  variant="light"
                  color="red"
                  loading={busy[inv.id]}
                  onClick={() => handle(inv, onDecline)}
                  title="Decline"
                >
                  <X size={14} />
                </ActionIcon>
              </Group>
            </Group>
            {errors[inv.id] && (
              <Text size="xs" c="red">
                {errors[inv.id]}
              </Text>
            )}
          </Stack>
        ))}
      </Stack>
    </Paper>
  );
}
