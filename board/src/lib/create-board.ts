/**
 * Shared board creation — one implementation for the anonymous and synced
 * paths. Column ids are random UUIDs, minted at creation: only one path
 * ever creates a given board, so there is nothing to converge.
 */
import type { Database } from "betterbase/db";
import { boards, columns } from "@/lib/db";

const DEFAULT_COLUMN_NAMES = ["To Do", "In Progress", "Done"];

/** Structural: accepts both the raw Database and the sync adapter. */
type BoardDb = Pick<Database, "put">;

export async function createBoardIn(
  db: BoardDb,
  name: string,
): Promise<{ id: string; name: string }> {
  const board = await db.put(boards, { name });
  for (let i = 0; i < DEFAULT_COLUMN_NAMES.length; i++) {
    await db.put(columns, {
      boardId: board.id,
      name: DEFAULT_COLUMN_NAMES[i]!,
      sortOrder: i + 1,
    });
  }
  return board;
}
