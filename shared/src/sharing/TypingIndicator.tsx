import { Text } from "@mantine/core";

interface TypingIndicatorProps {
  typingPeers: string[];
}

export function TypingIndicator({ typingPeers }: TypingIndicatorProps) {
  let message = "\u00A0"; // non-breaking space reserves height when empty
  if (typingPeers.length === 1) {
    message = `${typingPeers[0]} is typing...`;
  } else if (typingPeers.length === 2) {
    message = `${typingPeers[0]} and ${typingPeers[1]} are typing...`;
  } else if (typingPeers.length > 2) {
    message = `${typingPeers.length} people are typing...`;
  }

  return (
    <Text size="xs" c="dimmed" style={{ minHeight: 20, lineHeight: "20px" }}>
      {message}
    </Text>
  );
}
