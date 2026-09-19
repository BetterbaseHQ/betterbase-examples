import { useState, useCallback } from "react";
import {
  Stack,
  TextInput,
  Textarea,
  Select,
  Button,
  Group,
  Text,
  Paper,
  Slider,
  Switch,
  ActionIcon,
  Tooltip,
} from "@mantine/core";
import { RefreshCw, Copy, Check, Eye, EyeOff } from "lucide-react";
import { copySecret } from "@/lib/clipboard";
import type { Entry } from "@/lib/db";

const CATEGORIES = [
  { value: "login", label: "Login" },
  { value: "card", label: "Card" },
  { value: "note", label: "Secure Note" },
  { value: "identity", label: "Identity" },
];

interface EntryFormProps {
  entry?: Entry;
  category?: string;
  onSave: (data: Omit<Entry, "id" | "createdAt" | "updatedAt">) => void | Promise<void>;
  onCancel: () => void;
}

export function EntryForm({ entry, category, onSave, onCancel }: EntryFormProps) {
  const [site, setSite] = useState(entry?.site ?? "");
  const [url, setUrl] = useState(entry?.url ?? "");
  const [username, setUsername] = useState(entry?.username ?? "");
  const [password, setPassword] = useState(entry?.password ?? "");
  const [notes, setNotes] = useState(entry?.notes ?? "");
  const [cat, setCat] = useState(entry?.category ?? category ?? "login");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!site.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        site: site.trim(),
        url: url.trim(),
        username: username.trim(),
        password,
        notes,
        category: cat,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack gap="md">
      <Text fw={600} size="xl">
        {entry ? "Edit Password" : "New Password"}
      </Text>

      <Paper p="md" withBorder>
        <Stack gap="md">
          <Select label="Category" data={CATEGORIES} value={cat} onChange={(v) => v && setCat(v)} />
          <TextInput
            label="Site"
            placeholder="GitHub"
            value={site}
            onChange={(e) => setSite(e.currentTarget.value)}
            required
          />
          <TextInput
            label="URL"
            placeholder="https://github.com"
            value={url}
            onChange={(e) => setUrl(e.currentTarget.value)}
          />
          <TextInput
            label="Username"
            placeholder="user@example.com"
            value={username}
            onChange={(e) => setUsername(e.currentTarget.value)}
            autoComplete="off"
          />
          <TextInput
            label="Password"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            type={showPassword ? "text" : "password"}
            // Keep browser password managers (non-E2EE, often cloud-synced)
            // from offering to save or autofill vault secrets.
            autoComplete="new-password"
            rightSection={
              <ActionIcon
                variant="subtle"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </ActionIcon>
            }
          />
          <PasswordGenerator onUse={setPassword} />
          <Textarea
            label="Notes"
            placeholder="Additional details..."
            value={notes}
            onChange={(e) => setNotes(e.currentTarget.value)}
            minRows={3}
            autosize
          />
        </Stack>
      </Paper>

      {error && (
        <Text size="sm" c="red">
          {error}
        </Text>
      )}

      <Group>
        <Button onClick={handleSubmit} disabled={!site.trim()} loading={saving}>
          {entry ? "Save" : "Create"}
        </Button>
        <Button variant="subtle" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </Group>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Password generator
// ---------------------------------------------------------------------------

/** Uniform index via rejection sampling (modulo of 2^32 would bias tail classes). */
function randomIndex(len: number): number {
  const limit = Math.floor(0x100000000 / len) * len;
  const buf = new Uint32Array(1);
  let n: number;
  do {
    crypto.getRandomValues(buf);
    n = buf[0]!;
  } while (n >= limit);
  return n % len;
}

export interface GeneratorOptions {
  lowercase: boolean;
  uppercase: boolean;
  numbers: boolean;
  symbols: boolean;
}

export function generatePassword(length: number, options: GeneratorOptions): string {
  const groups: string[] = [];
  if (options.lowercase) groups.push("abcdefghijklmnopqrstuvwxyz");
  if (options.uppercase) groups.push("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
  if (options.numbers) groups.push("0123456789");
  if (options.symbols) groups.push("!@#$%^&*()_+-=[]{}|;:,.<>?");
  if (groups.length === 0) groups.push("abcdefghijklmnopqrstuvwxyz", "0123456789");

  // Document the size floor: the one-char-per-class guarantee already
  // guarantees at least groups.length chars; the max() makes that explicit
  const targetLength = Math.max(length, groups.length);
  const all = groups.join("");

  // Guarantee at least one char from every selected class, then shuffle so the
  // guaranteed positions aren't predictable.
  const chars: string[] = groups.map((g) => g[randomIndex(g.length)]!);
  while (chars.length < targetLength) chars.push(all[randomIndex(all.length)]!);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join("");
}

function SecretCopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await copySecret(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard access denied — nothing to do
    }
  };
  return (
    <Tooltip label={copied ? "Copied" : "Copy"} withArrow>
      <ActionIcon
        variant="subtle"
        size="sm"
        color={copied ? "teal" : "gray"}
        aria-label="Copy to clipboard"
        onClick={handleCopy}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </ActionIcon>
    </Tooltip>
  );
}

function PasswordGenerator({ onUse }: { onUse: (password: string) => void }) {
  const [length, setLength] = useState(20);
  const [options, setOptions] = useState<GeneratorOptions>({
    lowercase: true,
    uppercase: true,
    numbers: true,
    symbols: true,
  });
  const [generated, setGenerated] = useState(() =>
    generatePassword(20, {
      lowercase: true,
      uppercase: true,
      numbers: true,
      symbols: true,
    }),
  );

  const regenerate = useCallback(() => {
    setGenerated(generatePassword(length, options));
  }, [length, options]);

  const handleLengthChange = useCallback(
    (v: number) => {
      setLength(v);
      setGenerated(generatePassword(v, options));
    },
    [options],
  );

  const toggleOption = useCallback(
    (key: keyof GeneratorOptions) => {
      const next = { ...options, [key]: !options[key] };
      setOptions(next);
      setGenerated(generatePassword(length, next));
    },
    [options, length],
  );

  return (
    <Paper p="sm" withBorder bg="var(--mantine-color-gray-0)">
      <Stack gap="sm">
        <Text size="xs" fw={600} c="dimmed" tt="uppercase">
          Password Generator
        </Text>

        <Group gap="xs" wrap="nowrap">
          <Text
            size="sm"
            ff="monospace"
            aria-label="Generated password"
            style={{ flex: 1, wordBreak: "break-all" }}
          >
            {generated}
          </Text>
          <ActionIcon
            variant="subtle"
            size="sm"
            aria-label="Regenerate password"
            onClick={regenerate}
          >
            <RefreshCw size={14} />
          </ActionIcon>
          <SecretCopyButton value={generated} />
        </Group>

        <Group gap="xs" align="center">
          <Text size="xs" w={50}>
            {length} chars
          </Text>
          <Slider
            value={length}
            onChange={handleLengthChange}
            min={8}
            max={64}
            style={{ flex: 1 }}
            size="sm"
            aria-label="Password length"
          />
        </Group>

        <Group gap="md">
          <Switch
            size="xs"
            label="a-z"
            checked={options.lowercase}
            onChange={() => toggleOption("lowercase")}
          />
          <Switch
            size="xs"
            label="A-Z"
            checked={options.uppercase}
            onChange={() => toggleOption("uppercase")}
          />
          <Switch
            size="xs"
            label="0-9"
            checked={options.numbers}
            onChange={() => toggleOption("numbers")}
          />
          <Switch
            size="xs"
            label="!@#"
            checked={options.symbols}
            onChange={() => toggleOption("symbols")}
          />
        </Group>

        <Button variant="light" size="xs" onClick={() => onUse(generated)} fullWidth>
          Use this password
        </Button>
      </Stack>
    </Paper>
  );
}
