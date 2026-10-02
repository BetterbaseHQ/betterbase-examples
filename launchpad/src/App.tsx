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
    description: "To-do lists you can share",
    icon: <CheckSquare size={24} />,
  },
  notes: {
    name: "Notes",
    description: "A simple home for your notes",
    icon: <FileText size={24} />,
  },
  photos: {
    name: "Photos",
    description: "All your photos in one place",
    icon: <Image size={24} />,
  },
  board: {
    name: "Board",
    description: "Plan projects on a shared board",
    icon: <Kanban size={24} />,
  },
  messenger: {
    name: "Messenger",
    description: "Simple, private messaging",
    icon: <MessageCircle size={24} />,
  },
  passwords: {
    name: "Passwords",
    description: "A safe home for your passwords",
    icon: <KeyRound size={24} />,
  },
  "ai-chat": {
    name: "AI Chat",
    description: "Chat with a private AI assistant",
    icon: <Bot size={24} />,
  },
};

/** Legacy dev environment: each app runs on its own port at `/`. Not used
 * on the Caddy dev origin (examples.betterbase.localhost), where apps live
 * path-based on one origin exactly as in prod. */
const DEV_PORTS: Record<string, number> = {
  tasks: 5381,
  notes: 5382,
  photos: 5383,
  board: 5384,
  messenger: 5385,
  "ai-chat": 5386,
  passwords: 5387,
};

interface AppCardProps {
  name: string;
  description: string;
  icon: ReactNode;
  href: string;
}

function AppCard({ name, description, icon, href }: AppCardProps) {
  return (
    <Anchor href={href} underline="never" c="inherit">
      <Card shadow="sm" padding="lg" radius="md" withBorder>
        <Group mb="md">
          <ThemeIcon size={40} variant="light" radius="md">
            {icon}
          </ThemeIcon>
          <Text fw={600} size="md">
            {name}
          </Text>
        </Group>
        <Text size="sm" c="dimmed">
          {description}
        </Text>
      </Card>
    </Anchor>
  );
}

/** App ids shown when no runtime config exists (unified-origin dev),
 * served same-origin at `/<app>/`. Kept in sync with the apps enabled in
 * docker-compose.dev.yml. Legacy dev (per-port) uses DEV_PORTS below. */
const DEV_APPS = [
  "tasks",
  "notes",
  "photos",
  "board",
  "messenger",
  "passwords",
  "ai-chat",
] as const;

function appCards(): AppCardProps[] {
  const cfg = runtimeConfig();
  const onUnifiedOrigin =
    window.location.hostname === "examples.betterbase.localhost";
  const ids = cfg
    ? Object.keys(cfg.apps).filter((id) => id !== "launchpad")
    : onUnifiedOrigin
      ? [...DEV_APPS]
      : Object.keys(DEV_PORTS);
  const sources: Array<[id: string, href: string]> = ids.map((id) => [
    id,
    onUnifiedOrigin || cfg
      ? new URL(`/${id}/`, window.location.origin).href
      : `http://localhost:${DEV_PORTS[id]}`,
  ]);

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
      </SimpleGrid>
    </LessAppShell>
  );
}
