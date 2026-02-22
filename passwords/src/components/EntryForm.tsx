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
  CopyButton,
  Tooltip,
} from "@mantine/core";
import { RefreshCw, Copy, Check } from "lucide-react";
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
  onSave: (data: Omit<Entry, "id" | "createdAt" | "updatedAt">) => void;
  onCancel: () => void;
}

export function EntryForm({ entry, category, onSave, onCancel }: EntryFormProps) {
  const [site, setSite] = useState(entry?.site ?? "");
  const [url, setUrl] = useState(entry?.url ?? "");
  const [username, setUsername] = useState(entry?.username ?? "");
  const [password, setPassword] = useState(entry?.password ?? "");
  const [notes, setNotes] = useState(entry?.notes ?? "");
  const [cat, setCat] = useState(entry?.category ?? category ?? "login");

  const handleSubmit = () => {
    if (!site.trim()) return;
    onSave({
      site: site.trim(),
      url: url.trim(),
      username: username.trim(),
      password,
      notes,
      category: cat,
    });
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
          />
          <TextInput
            label="Password"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
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

      <Group>
        <Button onClick={handleSubmit} disabled={!site.trim()}>
          {entry ? "Save" : "Create"}
        </Button>
        <Button variant="subtle" onClick={onCancel}>
          Cancel
        </Button>
      </Group>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Password generator
// ---------------------------------------------------------------------------

function generatePassword(length: number, options: GeneratorOptions): string {
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const digits = "0123456789";
  const symbols = "!@#$%^&*()_+-=[]{}|;:,.<>?";

  let chars = "";
  if (options.lowercase) chars += lower;
  if (options.uppercase) chars += upper;
  if (options.numbers) chars += digits;
  if (options.symbols) chars += symbols;
  if (!chars) chars = lower + upper + digits;

  const array = new Uint32Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (n) => chars[n % chars.length]).join("");
}

interface GeneratorOptions {
  lowercase: boolean;
  uppercase: boolean;
  numbers: boolean;
  symbols: boolean;
}

function PasswordGenerator({ onUse }: { onUse: (password: string) => void }) {
  const [length, setLength] = useState(20);
  const [options, setOptions] = useState<GeneratorOptions>({
    lowercase: true,
    uppercase: true,
    numbers: true,
    symbols: true,
  });
  const [generated, setGenerated] = useState(() => generatePassword(20, options));

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
          <Text size="sm" ff="monospace" style={{ flex: 1, wordBreak: "break-all" }}>
            {generated}
          </Text>
          <ActionIcon variant="subtle" size="sm" onClick={regenerate}>
            <RefreshCw size={14} />
          </ActionIcon>
          <CopyButton value={generated} timeout={1500}>
            {({ copied, copy }) => (
              <Tooltip label={copied ? "Copied" : "Copy"} withArrow>
                <ActionIcon
                  variant="subtle"
                  size="sm"
                  color={copied ? "teal" : "gray"}
                  onClick={copy}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </ActionIcon>
              </Tooltip>
            )}
          </CopyButton>
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
