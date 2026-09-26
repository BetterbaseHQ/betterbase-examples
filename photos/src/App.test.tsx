import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { vi } from "vitest";
import { putPhotoFiles, usePhotoOps } from "@/lib/photo-ops";
import { renderWithProviders } from "@betterbase/examples-shared/test";
import { photos } from "@/lib/db";

// Deterministic file id for compensation assertions
const realRandomUUID = crypto.randomUUID.bind(crypto);
beforeAll(() => {
  vi.stubGlobal(
    "crypto",
    Object.defineProperty(Object.create(Object.getPrototypeOf(crypto)), "randomUUID", {
      value: () => "file-uuid-stub",
    }),
  );
  // keep the rest of crypto intact (getRandomValues etc. live on the proto)
});
afterAll(() => {
  vi.unstubAllGlobals();
  crypto.randomUUID = realRandomUUID;
});

function fakeFileStore() {
  const puts: Array<{ id: string; bytes: Uint8Array; recordId: string | undefined }> = [];
  return {
    puts,
    store: {
      put: vi.fn(async (id: string, bytes: Uint8Array, recordId: string | undefined) => {
        puts.push({ id, bytes, recordId });
      }),
    },
  };
}

/** Minimal image file good enough for the thumbnail code path. */
function tinyJpeg(): File {
  // 16x16 red JPEG — generateThumbnail decodes it for real in the browser
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ff0000";
  ctx.fillRect(0, 0, 16, 16);
  const dataUrl = canvas.toDataURL("image/jpeg");
  const bin = atob(dataUrl.split(",")[1]!);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], "tiny.jpg", { type: "image/jpeg" });
}

describe("photo import compensation (AUD-048)", () => {
  it("regression: byte persistence failure after record creation deletes the record and evicts partial cache", async () => {
    // A record whose bytes never persisted is an undeletable-looking
    // Unavailable tile; re-upload makes a NEW id, so the orphan never
    // completes. The import must compensate instead.
    const created: Array<Record<string, unknown>> = [];
    const add = vi.fn(async (data: Record<string, unknown>) => {
      const record = { id: "rec-1", ...data };
      created.push(record);
      return record;
    });
    const db = {
      delete: vi.fn(async () => {}),
      patch: vi.fn(async () => {}),
    };
    const evictions: string[] = [];
    const fileStore = {
      // Full-blob persistence fails (quota / unreadable file)
      put: vi.fn(async () => {
        throw new Error("QuotaExceededError");
      }),
      evict: vi.fn(async (fid: string) => {
        evictions.push(fid);
      }),
    };

    let ops: ReturnType<typeof usePhotoOps> | undefined;
    function Probe() {
      ops = usePhotoOps(db as never, fileStore as never, add as never);
      return null;
    }
    renderWithProviders(<Probe />);

    await expect(ops!.upload([tinyJpeg()], "album-1")).resolves.toBeUndefined();

    expect(created).toHaveLength(1);
    expect(db.delete).toHaveBeenCalledWith(photos, "rec-1");
    expect(evictions).toContain("file-uuid-stub");
  });
});

describe("putPhotoFiles", () => {
  it("stores the full blob and a generated thumbnail", async () => {
    const { store, puts } = fakeFileStore();
    const db = { get: vi.fn(async () => ({ id: "photo-1" })) };
    const thumbFileId = await putPhotoFiles(
      db as never,
      store as never,
      "photo-1",
      tinyJpeg(),
      "file-1",
    );
    expect(puts.map((p) => p.id)).toEqual(["file-1", thumbFileId]);
    expect(thumbFileId).toBeTruthy();
  });

  it("regression: skips the thumbnail quietly when the photo was deleted mid-upload", async () => {
    const { store, puts } = fakeFileStore();
    const db = { get: vi.fn(async () => undefined) }; // record gone
    const thumbFileId = await putPhotoFiles(
      db as never,
      store as never,
      "photo-1",
      tinyJpeg(),
      "file-1",
    );
    expect(thumbFileId).toBeUndefined();
    // Only the full blob was written — no orphaned thumbnail
    expect(puts.map((p) => p.id)).toEqual(["file-1"]);
  });
});
