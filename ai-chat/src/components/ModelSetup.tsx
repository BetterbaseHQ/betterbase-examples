import type { ReactNode } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  Group,
  List,
  Progress,
  Radio,
  Stack,
  Text,
  ThemeIcon,
  UnstyledButton,
} from "@mantine/core";
import { AlertCircle, Cpu, Download, ShieldCheck, Zap } from "lucide-react";
import { EmptyState } from "@betterbase/examples-shared";
import type { ModelInfo } from "@/lib/model";
import { WORKSPACE_HEIGHT } from "@/lib/layout";

interface ModelSetupProps {
  models: readonly ModelInfo[];
  /** The model the user last picked. */
  selectedId: string;
  onSelect: (id: string) => void;
  loading: boolean;
  /** Download progress, 0..1. */
  progress: number;
  error: string | null;
  /** Warm load: weights are cached, this is just session setup. */
  warm: boolean;
  onLoad: () => void;
}

/** Full-height centering used by every pre-chat screen. */
export function CenteredPane({ children }: { children: ReactNode }) {
  return (
    <Box
      style={{
        height: WORKSPACE_HEIGHT,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      {children}
    </Box>
  );
}

/** Shown when the browser can't run the model at all — no degraded mode. */
export function WebGpuRequired() {
  return (
    <CenteredPane>
      <EmptyState
        icon={<Cpu size={32} />}
        title="WebGPU required"
        description="This app runs the model on your device, which needs WebGPU. Try the latest Chrome, Edge or Safari with hardware acceleration enabled."
      />
    </CenteredPane>
  );
}

/** First-run screen: pick a model, explain the download, then load it. */
export function ModelSetup({
  models,
  selectedId,
  onSelect,
  loading,
  progress,
  error,
  warm,
  onLoad,
}: ModelSetupProps) {
  const selected = models.find((m) => m.id === selectedId) ?? models[0]!;
  const percent = Math.round(progress * 100);

  return (
    <CenteredPane>
      <Card withBorder radius="md" padding="xl" w="100%" maw={520}>
        <Stack gap="md">
          <Group wrap="nowrap">
            <ThemeIcon size="lg" variant="light">
              <Cpu size={20} />
            </ThemeIcon>
            <div>
              <Text fw={600}>Choose a model</Text>
              <Text size="xs" c="dimmed">
                Each runs entirely on your device — nothing leaves the browser, and you can switch
                anytime.
              </Text>
            </div>
          </Group>

          <Stack gap={6}>
            {models.map((m) => (
              <UnstyledButton
                key={m.id}
                onClick={() => onSelect(m.id)}
                disabled={loading}
                aria-pressed={m.id === selected.id}
                px={12}
                py={8}
                style={{
                  borderRadius: "var(--mantine-radius-sm)",
                  border: `1px solid ${
                    m.id === selected.id
                      ? "var(--mantine-color-indigo-6)"
                      : "var(--mantine-color-default-border)"
                  }`,
                  background:
                    m.id === selected.id ? "var(--mantine-color-default-hover)" : undefined,
                }}
              >
                <Group justify="space-between" wrap="nowrap" gap="xs">
                  <div style={{ minWidth: 0 }}>
                    <Text fz="sm" fw={600}>
                      {m.label}
                    </Text>
                    <Text fz="xs" c="dimmed" truncate="end">
                      {m.blurb} · {m.approxSize}
                    </Text>
                  </div>
                  <Radio checked={m.id === selected.id} readOnly tabIndex={-1} />
                </Group>
              </UnstyledButton>
            ))}
          </Stack>

          <List size="sm" spacing="xs">
            <List.Item icon={<Zap size={14} />}>WebGPU-accelerated local inference</List.Item>
            <List.Item icon={<Download size={14} />}>
              First load downloads {selected.approxSize} of weights, then stays cached
            </List.Item>
            <List.Item icon={<ShieldCheck size={14} />}>
              No account and no server required
            </List.Item>
          </List>

          {error !== null && (
            <Alert color="red" icon={<AlertCircle size={16} />} title="Couldn't load the model">
              {error}
            </Alert>
          )}

          {loading ? (
            <Stack gap={6}>
              <Progress value={percent} animated aria-label="Model download progress" />
              <Text size="xs" c="dimmed">
                {warm ? "Loading model…" : `Downloading model weights… ${percent}%`}
              </Text>
            </Stack>
          ) : (
            <Button onClick={onLoad} leftSection={<Download size={16} />}>
              {error !== null ? "Retry download" : `Download ${selected.approxSize} model`}
            </Button>
          )}
        </Stack>
      </Card>
    </CenteredPane>
  );
}
