import { describe, it, expect } from "vitest";
import { vi } from "vitest";
import { putPhotoFiles } from "./App";

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
