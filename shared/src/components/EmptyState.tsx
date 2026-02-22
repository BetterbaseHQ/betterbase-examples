import type { ReactNode } from "react";
import { Stack, Text, ThemeIcon } from "@mantine/core";

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <Stack align="center" justify="center" gap="md" py="xl" mih={300}>
      <ThemeIcon size={64} variant="light" radius="xl" color="gray">
        {icon}
      </ThemeIcon>
      <Text fw={500} size="lg" ta="center">
        {title}
      </Text>
      {description && (
        <Text size="sm" c="dimmed" ta="center" maw={320}>
          {description}
        </Text>
      )}
      {action}
    </Stack>
  );
}
