import { LESS_HEADER_HEIGHT } from "@betterbase/examples-shared";

/**
 * Content height of `LessAppShell` — the viewport minus its fixed header
 * (the height is exported by the shell so this stays in sync with it).
 * Shared by the pre-chat screens and the chat panel so they fill the shell
 * consistently.
 */
export const WORKSPACE_HEIGHT = `calc(100vh - ${LESS_HEADER_HEIGHT}px)`;
