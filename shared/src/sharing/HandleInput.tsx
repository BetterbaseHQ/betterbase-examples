import { TextInput } from "@mantine/core";
import type { TextInputProps } from "@mantine/core";

const DEFAULT_DESCRIPTION = "Enter a username for this server, or a full username@domain.";

/**
 * Handle input for sharing UIs — one place owns the entry copy so every
 * app explains handles the same way.
 *
 * The SDK appends the current user's domain to bare usernames, so
 * same-server users can be entered by name alone; full handles also work
 * (the path for eventual cross-domain sharing).
 */
export function HandleInput(props: Omit<TextInputProps, "placeholder" | "description">) {
  return <TextInput placeholder="alice" description={DEFAULT_DESCRIPTION} {...props} />;
}

/**
 * Humanize sharing failures for display next to the handle input.
 *
 * Maps the SDK's lookup errors to user-facing copy (the raw messages leak
 * client IDs and record IDs); anything else passes through unchanged so
 * genuine network errors stay visible.
 */
export function humanizeShareError(err: unknown): string {
  // InvitationClient RecipientNotProvisionedError — the recipient exists
  // but has never connected this app (no keypair/mailbox to invite to).
  if (err instanceof Error && err.name === "RecipientNotProvisionedError") {
    const handle = (err as { handle?: string }).handle ?? "That user";
    return `${handle} hasn't connected this app yet — ask them to open it and sign in once, then share again`;
  }
  const msg = err instanceof Error ? err.message : String(err);
  // WS RPC rate limiting ("rate_limited: rate limit exceeded: ...")
  if (msg.startsWith("rate_limited:")) {
    return "You've shared a lot recently — wait a bit and try again";
  }
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
