import { useState } from "react";
import { Button, Group, Modal, Stack, Text, TextInput } from "@mantine/core";
import { reportError } from "../notify.js";

interface CreateFirstItemProps {
  /** What gets created ("list", "board") — drives modal labels and copy. */
  noun: string;
  /** Trigger label; defaults to "Create your first <noun>". */
  buttonLabel?: string;
  /** Context shown above the input (e.g. a board's default columns). */
  helperText?: string;
  /**
   * Receives the trimmed name. Return a promise to get failure handling:
   * the modal stays open with the typed name preserved; rejections are
   * reported here. Void-returning callbacks must self-report errors.
   */
  onCreate: (name: string) => void | Promise<unknown>;
}

/**
 * Empty-state first-run CTA: a button that opens a name-it-and-create-it
 * modal. The created item is ordinary user data from the moment of
 * creation — nothing is prefilled, so every name is chosen (see
 * docs/scaffold-data-design.md).
 *
 * Edge case, accepted: if a peer's first item arrives over sync while the
 * modal is open, the hosting empty state unmounts this component and the
 * modal closes with it.
 */
export function CreateFirstItem({ noun, buttonLabel, helperText, onCreate }: CreateFirstItemProps) {
  const [opened, setOpened] = useState(false);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const trimmed = name.trim();
  const capitalized = noun.charAt(0).toUpperCase() + noun.slice(1);

  const submit = async () => {
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      await onCreate(trimmed);
      setOpened(false);
      setName("");
    } catch (err) {
      // Keep the modal open with the typed name — the failure is loud,
      // the user's work isn't discarded.
      reportError(err, `Couldn't create ${noun}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button size="compact-sm" onClick={() => setOpened(true)}>
        {buttonLabel ?? `Create your first ${noun}`}
      </Button>
      <Modal
        opened={opened}
        onClose={() => {
          if (!submitting) setOpened(false);
        }}
        title={`Create your first ${noun}`}
        centered
        closeOnClickOutside={!submitting}
        closeOnEscape={!submitting}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
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
              data-autofocus
              disabled={submitting}
              label={`${capitalized} name`}
              placeholder={`My first ${noun}`}
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
            />
            <Group justify="flex-end">
              <Button
                variant="subtle"
                color="gray"
                disabled={submitting}
                onClick={() => setOpened(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!trimmed || submitting} loading={submitting}>
                Create
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </>
  );
}
