/**
 * Shared board creation — one implementation for the anonymous and synced
 * paths. Deterministic ids when `id` is given so concurrent seeds of the
 * default board collapse (one board, three columns — not six). Column ids
 * are v5-derived UUIDs: the sync server rejects non-UUID record ids, which
 * is exactly how the pre-v5 `${id}-col-N` scheme silently broke column
 * syncing for every board created with a deterministic id.
 */
import { DEFAULTS_NAMESPACE, uuidV5 } from "@betterbase/examples-shared";
import type { Database } from "betterbase/db";
import { boards, columns } from "@/lib/db";

const DEFAULT_COLUMN_NAMES = ["To Do", "In Progress", "Done"];

/** Structural: accepts both the raw Database and the sync adapter. */
type BoardDb = Pick<Database, "put">;

export async function createBoardIn(
  db: BoardDb,
  name: string,
  id?: string,
): Promise<{ id: string; name: string }> {
  const board = await db.put(boards, { name }, id ? { id } : undefined);
  for (let i = 0; i < DEFAULT_COLUMN_NAMES.length; i++) {
    const columnId = id
      ? uuidV5(`${id}-col-${i + 1}`, DEFAULTS_NAMESPACE)
      : undefined;
    await db.put(
      columns,
      {
        boardId: board.id,
        name: DEFAULT_COLUMN_NAMES[i]!,
        sortOrder: i + 1,
      },
      columnId ? { id: columnId } : undefined,
    );
  }
  return board;
}
