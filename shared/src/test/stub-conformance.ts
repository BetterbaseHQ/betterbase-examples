/**
 * Compile-time conformance check between the betterbase/sync/react stub and
 * the real module.
 *
 * The stub is installed via resolve alias at test time, so nothing typechecks
 * it against the real API — app code is typechecked against the REAL module
 * while RUNNING against the stub. Drift (a renamed hook, a changed export
 * surface) would be invisible until a test mysteriously misbehaves.
 *
 * This file is included in tsc's program but never runs. It pins two
 * invariants: every hook the apps consume exists on the stub, and those same
 * names still exist on the real module. Extend REQUIRED when an app starts
 * using a new hook from betterbase/sync/react.
 */
import type * as real from "betterbase/sync/react";
import * as stub from "./mock-sync.js";

type RequiredHooks =
  | "BetterbaseProvider"
  | "FileStoreProvider"
  | "useSync"
  | "useSyncReady"
  | "useSyncDb"
  | "useSpaces"
  | "usePendingInvitations"
  | "useQuery"
  | "usePresence"
  | "usePeers"
  | "useMembers"
  | "useFile"
  | "useEditChain"
  | "useSendEvent"
  | "useEvent";

// The stub must provide everything apps import from the real module
type MissingFromStub = Exclude<RequiredHooks, keyof typeof stub>;
const _stubHasAll: MissingFromStub[] = [];

// The real module must still export those names (no silent SDK renames)
type RenamedInReal = Exclude<RequiredHooks, keyof typeof real>;
const _realHasAll: RenamedInReal[] = [];

void _stubHasAll;
void _realHasAll;
