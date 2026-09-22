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
import { LessAppShell, useAuth, runtimeConfig } from "@betterbase/examples-shared";
import type { ReactNode } from "react";

/** Static card metadata, keyed by app id. */
const APP_META: Record<string, { name: string; description: string; icon: ReactNode }> = {
  tasks: {
    name: "Tasks",
    description: "Todo lists with offline-first sync",
    icon: <CheckSquare size={24} />,
  },
  notes: {
    name: "Notes",
    description: "Rich text notes with CRDT merging",
    icon: <FileText size={24} />,
  },
  photos: {
    name: "Photos",
    description: "Photo gallery with encrypted file sync",
    icon: <Image size={24} />,
  },
  board: {
    name: "Board",
    description: "Collaborative kanban board",
    icon: <Kanban size={24} />,
  },
  chat: {
    name: "Chat",
    description: "Real-time encrypted messaging",
    icon: <MessageCircle size={24} />,
  },
  passwords: {
    name: "Passwords",
    description: "Encrypted password vault",
    icon: <KeyRound size={24} />,
  },
};

/** Not built yet — always shown as "coming soon". */
const COMING_SOON = [
  {
    name: "AI Chat",
    description: "E2E encrypted AI conversations",
    icon: <Bot size={24} />,
  },
];

/** Dev environment: each app runs on its own port at `/`. */
const DEV_PORTS: Record<string, number> = {
  tasks: 5381,
  notes: 5382,
  photos: 5383,
  board: 5384,
  chat: 5385,
  passwords: 5387,
};

interface AppCardProps {
  name: string;
  description: string;
  icon: ReactNode;
  href?: string;
}

function AppCard({ name, description, icon, href }: AppCardProps) {
  const card = (
    <Card
      shadow="sm"
      padding="lg"
      radius="md"
      withBorder
      style={{
        opacity: href ? 1 : 0.5,
        cursor: href ? "pointer" : "not-allowed",
      }}
    >
      <Group mb="md">
        <ThemeIcon size={40} variant="light" radius="md">
          {icon}
        </ThemeIcon>
        <div>
          <Text fw={600} size="md">
            {name}
          </Text>
          {!href && (
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

  if (!href) return card;

  return (
    <Anchor href={href} underline="never" c="inherit">
      {card}
    </Anchor>
  );
}

/**
 * Enabled apps with links.
 *
 * Deployed (samples container): the entrypoint-generated config.js lists the
 * enabled apps; each is served same-origin at `/<app>/`.
 *
 * Dev: all apps on their fixed localhost ports.
 */
function appCards(): AppCardProps[] {
  const cfg = runtimeConfig();
  const sources: Array<[id: string, href: string]> = cfg
    ? Object.keys(cfg.apps)
        .filter((id) => id !== "launchpad")
        .map((id) => [id, new URL(`/${id}/`, window.location.origin).href])
    : Object.entries(DEV_PORTS).map(([id, port]) => [id, `http://localhost:${port}`]);

  const cards: AppCardProps[] = [];
  for (const [id, href] of sources) {
    const meta = APP_META[id];
    if (!meta) continue;
    cards.push({ ...meta, href });
  }
  return cards;
}

export default function App() {
  const { isAuthenticated, handle, login, logout } = useAuth();

  return (
    <LessAppShell
      appName="Betterbase"
      appIcon={<LayoutGrid size={22} color="var(--mantine-color-indigo-6)" />}
      authMode="auth"
      isAuthenticated={isAuthenticated}
      handle={handle}
      onLogin={login}
      onLogout={logout}
    >
      <SimpleGrid cols={{ base: 1, xs: 2, md: 3 }} spacing="lg" maw={900} mx="auto" mt="xl">
        {appCards().map((app) => (
          <AppCard key={app.name} {...app} />
        ))}
        {COMING_SOON.map((app) => (
          <AppCard key={app.name} {...app} />
        ))}
      </SimpleGrid>
    </LessAppShell>
  );
}
