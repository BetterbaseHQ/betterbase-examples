import { Stack, Paper, Text, Group } from "@mantine/core";
import { ShieldCheck } from "lucide-react";
import type { Message } from "@/lib/db";

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  senderDisplay: string;
  verified?: boolean;
}

function formatTime(epochMs: number): string {
  const date = new Date(epochMs);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;

  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isToday) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function MessageBubble({ message, isOwn, senderDisplay, verified }: MessageBubbleProps) {
  return (
    <Stack gap={2} align={isOwn ? "flex-end" : "flex-start"} px="md" py={2}>
      {!isOwn && (
        <Group gap={4} px={4}>
          <Text size="xs" c="dimmed">
            {senderDisplay}
          </Text>
          {verified && (
            <ShieldCheck size={12} color="var(--mantine-color-green-5)" style={{ opacity: 0.7 }} />
          )}
        </Group>
      )}
      <Group align="flex-end" gap="xs" wrap="nowrap">
        {isOwn && (
          <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
            {formatTime(message.sentAt)}
          </Text>
        )}
        <Paper
          px="sm"
          py={6}
          radius="md"
          style={{
            background: isOwn ? "var(--mantine-color-blue-6)" : "var(--mantine-color-gray-1)",
            maxWidth: "70%",
          }}
        >
          <Text size="sm" c={isOwn ? "white" : undefined} style={{ wordBreak: "break-word" }}>
            {message.text}
          </Text>
        </Paper>
        {!isOwn && (
          <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
            {formatTime(message.sentAt)}
          </Text>
        )}
      </Group>
    </Stack>
  );
}
