import { SimpleGrid, Card, Text, Group, ThemeIcon, Anchor } from "@mantine/core";
import {
  LayoutGrid,
  CheckSquare,
  FileText,
  Image,
  Kanban,
  MessageCircle,
  Bot,
  KeyRound,
} from "lucide-react";
import { LessAppShell, useAuth } from "@betterbase/examples-shared";
import type { ReactNode } from "react";

const apps: {
  name: string;
  description: string;
  icon: ReactNode;
  port: number;
  ready: boolean;
}[] = [
  {
    name: "Tasks",
    description: "Todo lists with offline-first sync",
    icon: <CheckSquare size={24} />,
    port: 5381,
    ready: true,
  },
  {
    name: "Notes",
    description: "Rich text notes with CRDT merging",
    icon: <FileText size={24} />,
    port: 5382,
    ready: true,
  },
  {
    name: "Photos",
    description: "Photo gallery with encrypted file sync",
    icon: <Image size={24} />,
    port: 5383,
    ready: true,
  },
  {
    name: "Board",
    description: "Collaborative kanban board",
    icon: <Kanban size={24} />,
    port: 5384,
    ready: true,
  },
  {
    name: "Chat",
    description: "Real-time encrypted messaging",
    icon: <MessageCircle size={24} />,
    port: 5385,
    ready: true,
  },
  {
    name: "AI Chat",
    description: "E2E encrypted AI conversations",
    icon: <Bot size={24} />,
    port: 5386,
    ready: false,
  },
  {
    name: "Passwords",
    description: "Encrypted password vault",
    icon: <KeyRound size={24} />,
    port: 5387,
    ready: true,
  },
];

function AppCard({ name, description, icon, port, ready }: (typeof apps)[number]) {
  const card = (
    <Card
      shadow="sm"
      padding="lg"
      radius="md"
      withBorder
      style={{
        opacity: ready ? 1 : 0.5,
        cursor: ready ? "pointer" : "not-allowed",
      }}
    >
      <Group mb="md">
        <ThemeIcon size={40} variant="light" radius="md">
          {icon}
        </ThemeIcon>
        <div>
          <Text fw={600} size="md">
            Less {name}
          </Text>
          {!ready && (
            <Text size="xs" c="dimmed">
              Coming soon
            </Text>
          )}
        </div>
      </Group>
      <Text size="sm" c="dimmed">
        {description}
      </Text>
    </Card>
  );

  if (!ready) return card;

  return (
    <Anchor href={`http://localhost:${port}`} underline="never" c="inherit">
      {card}
    </Anchor>
  );
}

export default function App() {
  const { isAuthenticated, handle, login, logout } = useAuth();

  return (
    <LessAppShell
      appName="Less Platform"
      appIcon={<LayoutGrid size={22} color="var(--mantine-color-indigo-6)" />}
      isAuthenticated={isAuthenticated}
      handle={handle}
      onLogin={login}
      onLogout={logout}
    >
      <SimpleGrid cols={{ base: 1, xs: 2, md: 3 }} spacing="lg" maw={900} mx="auto" mt="xl">
        {apps.map((app) => (
          <AppCard key={app.name} {...app} />
        ))}
      </SimpleGrid>
    </LessAppShell>
  );
}
