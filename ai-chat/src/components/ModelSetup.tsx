import type { ReactNode } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  Group,
  List,
  Progress,
  Stack,
  Text,
  ThemeIcon,
} from "@mantine/core";
import { AlertCircle, Cpu, Download, ShieldCheck, Zap } from "lucide-react";
import { EmptyState } from "@betterbase/examples-shared";
import { MODEL_APPROX_LABEL, MODEL_LABEL } from "@/lib/model";
import { WORKSPACE_HEIGHT } from "@/lib/layout";

interface ModelSetupProps {
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

/** First-run screen: explains the download, then loads the model. */
export function ModelSetup({ loading, progress, error, warm, onLoad }: ModelSetupProps) {
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
              <Text fw={600}>{MODEL_LABEL}</Text>
              <Text size="xs" c="dimmed">
                Runs entirely on your device — nothing leaves the browser.
              </Text>
            </div>
          </Group>

          <List size="sm" spacing="xs">
            <List.Item icon={<Zap size={14} />}>WebGPU-accelerated local inference</List.Item>
            <List.Item icon={<Download size={14} />}>
              First load downloads {MODEL_APPROX_LABEL} of weights, then stays cached
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
              {error !== null ? "Retry download" : `Download ${MODEL_APPROX_LABEL} model`}
            </Button>
          )}
        </Stack>
      </Card>
    </CenteredPane>
  );
}
