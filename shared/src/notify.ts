import { notifications } from "@mantine/notifications";

/**
 * Surface a failed async operation as a toast. Use for fire-and-forget
 * mutations (db writes, share flows) so failures are never silent.
 */
export function reportError(err: unknown, title = "Something went wrong"): void {
  const message = err instanceof Error ? err.message : String(err);
  notifications.show({
    title,
    message,
    color: "red",
    autoClose: 6000,
  });
}
