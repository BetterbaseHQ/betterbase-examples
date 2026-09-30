import { TextInput, Text } from "@mantine/core";
import type { TextInputProps } from "@mantine/core";
import { useAuth } from "betterbase/auth/react";

/**
 * Handle input for sharing UIs.
 *
 * The SDK resolves short handles by appending the current user's domain, so
 * same-server users can be entered by name alone — this input makes that
 * visible: while the typed value has no "@", a dimmed `@domain` suffix shows
 * the handle the server will actually resolve. Typing a full `user@domain`
 * (for a federated future) hides the suffix.
 *
 * The suffix owns `rightSection`, so callers can't set it. `placeholder`
 * stays caller-overridable.
 *
 * Shares the session's handle via `useAuth` — render only inside an
 * authenticated tree (all sharing UIs already are).
 */
export function HandleInput(props: Omit<TextInputProps, "rightSection" | "rightSectionWidth">) {
  const { value, ...rest } = props;
  const { handle } = useAuth();

  const domain = handle?.includes("@") ? handle.slice(handle.lastIndexOf("@") + 1) : null;
  const showSuffix = domain !== null && !String(value ?? "").includes("@");

  return (
    <TextInput
      placeholder="alice"
      {...rest}
      value={value}
      rightSection={
        showSuffix ? (
          <Text size={props.size ?? "sm"} c="dimmed" pr={4}>
            @{domain}
          </Text>
        ) : undefined
      }
    />
  );
}

/**
 * Humanize sharing failures for display next to the handle input.
 *
 * Maps the SDK's lookup errors to user-facing copy (the raw messages leak
 * client IDs and record IDs); anything else passes through unchanged so
 * genuine network errors stay visible.
 */
export function humanizeShareError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  // InvitationClient RecipientNotFoundError: "Recipient key not found: <handle>/<clientId>"
  const recipient = msg.match(/Recipient key not found: (\S+)\/\S+/);
  if (recipient) return `No user ${recipient[1]} found on this server`;
  // shareTree pre-check: User "<handle>" not found
  const precheck = msg.match(/User "(.+)" not found/);
  if (precheck) return `No user ${precheck[1]} found on this server`;
  // shareTree mid-operation failures carry record IDs — keep those internal
  if (msg.startsWith("shareTree:")) return "Sharing failed — please try again";
  return msg;
}
