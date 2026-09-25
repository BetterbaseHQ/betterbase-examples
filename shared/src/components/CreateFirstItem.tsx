import { useState } from "react";
import { Button, Modal, Stack, Text, TextInput } from "@mantine/core";

interface CreateFirstItemProps {
  /** What gets created ("list", "board") — drives modal labels and copy. */
  noun: string;
  /** Trigger label; defaults to "Create your first <noun>". */
  buttonLabel?: string;
  /** Context shown above the input (e.g. a board's default columns). */
  helperText?: string;
  /** Receives the trimmed name. Errors are the caller's to report. */
  onCreate: (name: string) => void;
}

/**
 * Empty-state first-run CTA: a button that opens a name-it-and-create-it
 * modal. The created item is ordinary user data from the moment of
 * creation — nothing is prefilled, so every name is chosen (see
 * docs/scaffold-data-design.md).
 */
export function CreateFirstItem({ noun, buttonLabel, helperText, onCreate }: CreateFirstItemProps) {
  const [opened, setOpened] = useState(false);
  const [name, setName] = useState("");
  const trimmed = name.trim();
  const capitalized = noun.charAt(0).toUpperCase() + noun.slice(1);

  const submit = () => {
    if (!trimmed) return;
    setOpened(false);
    setName("");
    onCreate(trimmed);
  };

  return (
    <>
      <Button size="compact-sm" onClick={() => setOpened(true)}>
        {buttonLabel ?? `Create your first ${noun}`}
      </Button>
      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title={`Create your first ${noun}`}
        centered
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Stack gap="md">
            {helperText && (
              <Text size="sm" c="dimmed">
                {helperText}
              </Text>
            )}
            <TextInput
              autoFocus
              label={`${capitalized} name`}
              placeholder={`My first ${noun}`}
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
            />
            <Button type="submit" disabled={!trimmed}>
              Create
            </Button>
          </Stack>
        </form>
      </Modal>
    </>
  );
}
