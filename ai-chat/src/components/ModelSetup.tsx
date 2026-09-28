import type { ReactNode } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Group,
  List,
  Progress,
  Radio,
  RadioGroup,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
} from "@mantine/core";
import { AlertCircle, Cpu, Download, ShieldCheck, Trash2, Zap } from "lucide-react";
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
  /** Ids whose weights are already in the browser cache. */
  cachedIds: ReadonlySet<string>;
  /** Delete one model's downloaded weights. */
  onClearCache: (model: ModelInfo) => void;
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
  cachedIds,
  onClearCache,
  warm,
  onLoad,
}: ModelSetupProps) {
  const selected = models.find((m) => m.id === selectedId) ?? models[0]!;
  const selectedCached = cachedIds.has(selected.id);
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

          <RadioGroup value={selected.id} onChange={(id) => onSelect(id)} aria-label="Model">
            <Stack gap={6}>
              {models.map((m) => (
                <Radio.Card
                  key={m.id}
                  value={m.id}
                  disabled={loading}
                  px={12}
                  py={8}
                  styles={{
                    card: {
                      "&[data-checked]": {
                        background: "var(--mantine-color-default-hover)",
                      },
                    },
                  }}
                >
                  <Group justify="space-between" wrap="nowrap" gap="xs">
                    <div style={{ minWidth: 0 }}>
                      <Group gap={6} wrap="nowrap">
                        <Text fz="sm" fw={600}>
                          {m.label}
                        </Text>
                        {cachedIds.has(m.id) && (
                          <Badge size="sm" variant="light">
                            Downloaded
                          </Badge>
                        )}
                      </Group>
                      <Text fz="xs" c="dimmed" truncate="end">
                        {m.blurb} · {m.approxSize}
                      </Text>
                    </div>
                    <Group gap={4} wrap="nowrap">
                      {cachedIds.has(m.id) && (
                        <Tooltip label="Delete downloaded weights">
                          <ActionIcon
                            variant="subtle"
                            color="gray"
                            size="sm"
                            aria-label={`Delete downloaded ${m.label}`}
                            disabled={loading}
                            onClick={(event) => {
                              // The card is a radio — without this, the same
                              // click would also select (and auto-load) the
                              // model whose cache we're deleting.
                              event.stopPropagation();
                              onClearCache(m);
                            }}
                          >
                            <Trash2 size={14} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                      <Radio.Indicator />
                    </Group>
                  </Group>
                </Radio.Card>
              ))}
            </Stack>
          </RadioGroup>

          <List size="sm" spacing="xs">
            <List.Item icon={<Zap size={14} />}>WebGPU-accelerated local inference</List.Item>
            <List.Item icon={<Download size={14} />}>
              {selectedCached
                ? "Already on your device — loads without downloading"
                : `First load downloads ${selected.approxSize} of weights, then stays on your device`}
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
              {error !== null
                ? "Retry download"
                : selectedCached
                  ? "Load model"
                  : `Download ${selected.approxSize} model`}
            </Button>
          )}
        </Stack>
      </Card>
    </CenteredPane>
  );
}
