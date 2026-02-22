import { useId } from "react";
import { Tooltip, Group, Stack, Text } from "@mantine/core";
import { usePeers } from "@betterbase/sdk/sync/react";
import { peerGradient } from "./peerColor.js";

interface PresenceAvatarsProps {
  spaceId: string | undefined;
  max?: number;
  size?: number;
}

export function PresenceAvatars({ spaceId, max = 4, size = 22 }: PresenceAvatarsProps) {
  const uid = useId();
  const peers = usePeers<{ handle?: string }>(spaceId);

  if (!spaceId || peers.length === 0) return null;

  const visible = peers.slice(0, max);
  const overflow = peers.slice(max);

  return (
    <Group gap={4} align="center">
      {visible.map((p) => {
        const [from, to] = peerGradient(p.peer);
        const gradId = `pg-${uid.replace(/:/g, "")}-${p.peer}`;
        const label = p.data?.handle ?? "Anonymous";
        return (
          <Tooltip key={p.peer} label={label}>
            <span style={{ display: "inline-flex", lineHeight: 0 }}>
              <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor={from} />
                    <stop offset="100%" stopColor={to} />
                  </linearGradient>
                </defs>
                <circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${gradId})`} />
              </svg>
            </span>
          </Tooltip>
        );
      })}
      {overflow.length > 0 && (
        <Tooltip
          label={
            <Stack gap={2}>
              {overflow.map((p) => (
                <Text key={p.peer} size="xs">
                  {p.data?.handle ?? "Anonymous"}
                </Text>
              ))}
            </Stack>
          }
          multiline
        >
          <Text size="xs" c="dimmed" style={{ cursor: "default" }}>
            +{overflow.length}
          </Text>
        </Tooltip>
      )}
    </Group>
  );
}
