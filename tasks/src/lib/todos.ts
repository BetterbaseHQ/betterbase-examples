/**
 * Todo mutations shared by the local and synced paths.
 *
 * Every mutation is a read-modify-write on the list's todos array, so they are
 * serialized per list (two rapid Enters otherwise interleave: both reads see
 * the same todos and the second patch drops the first todo).
 *
 * Each op reads the record and its CRDT base as one atomic pair and anchors
 * the patch to that base: a sync update that lands between the read and the
 * write merges with the array edit instead of being overwritten by the stale
 * full-array view (AUD-049).
 */

import { lists, type List, type TodoItem } from "@/lib/db";
import { reportError } from "@betterbase/examples-shared";

/** Structural slice of the database the todo ops need (local db or sync adapter). */
interface TodoDb {
  getWithBase(
    collection: typeof lists,
    id: string,
  ): Promise<{
    record: (List & { _spaceId?: string }) | null | undefined;
    base: Uint8Array | null;
  }>;
  patch(
    collection: typeof lists,
    patch: { id: string; todos: TodoItem[] },
    options?: { base?: Uint8Array },
  ): Promise<unknown>;
}

function createWriteMutex() {
  const chains = new Map<string, Promise<void>>();
  return function serialized(key: string, fn: () => Promise<void>): Promise<void> {
    const next = (chains.get(key) ?? Promise.resolve()).then(fn);
    // Don't let one failed op block future mutations
    chains.set(
      key,
      next.catch(() => {}),
    );
    return next;
  };
}

export function createTodoOps(db: TodoDb) {
  const serialized = createWriteMutex();

  const run = (listId: string, fn: () => Promise<void>) =>
    serialized(listId, fn).catch((err) => {
      reportError(err, "Couldn't save task");
    });

  return {
    addTodo(listId: string, text: string): Promise<void> {
      return run(listId, async () => {
        const { record: list, base } = await db.getWithBase(lists, listId);
        if (!list) return;
        await db.patch(
          lists,
          {
            id: listId,
            todos: [...list.todos, { id: crypto.randomUUID(), text, completed: false }],
          },
          base ? { base } : undefined,
        );
      });
    },

    toggleTodo(listId: string, todoId: string): Promise<void> {
      return run(listId, async () => {
        const { record: list, base } = await db.getWithBase(lists, listId);
        if (!list) return;
        await db.patch(
          lists,
          {
            id: listId,
            todos: list.todos.map((t) => (t.id === todoId ? { ...t, completed: !t.completed } : t)),
          },
          base ? { base } : undefined,
        );
      });
    },

    deleteTodo(listId: string, todoId: string): Promise<void> {
      return run(listId, async () => {
        const { record: list, base } = await db.getWithBase(lists, listId);
        if (!list) return;
        await db.patch(
          lists,
          {
            id: listId,
            todos: list.todos.filter((t) => t.id !== todoId),
          },
          base ? { base } : undefined,
        );
      });
    },
  };
}

export type TodoOps = ReturnType<typeof createTodoOps>;
