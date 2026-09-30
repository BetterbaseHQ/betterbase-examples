import { describe, it, expect } from "vitest";
import { humanizeShareError } from "./HandleInput";
import { RecipientNotProvisionedError } from "betterbase/sync";

describe("humanizeShareError", () => {
  it("tells the user when the recipient has not connected this app", () => {
    const err = new RecipientNotProvisionedError("deploytest2@betterbase.dev", "client-1");
    expect(humanizeShareError(err)).toBe(
      "deploytest2@betterbase.dev hasn't connected this app yet — ask them to open it and sign in once, then share again",
    );
  });

  it("humanizes rate-limit rejections instead of leaking the raw RPC error", () => {
    const err = new Error("rate_limited: rate limit exceeded: max 30 membership appends per hour");
    expect(humanizeShareError(err)).toBe("You've shared a lot recently — wait a bit and try again");
  });

  it("still reports missing users", () => {
    expect(
      humanizeShareError(new Error("Recipient key not found: ghost@betterbase.dev/client-1")),
    ).toBe("No user ghost@betterbase.dev found on this server");
    expect(humanizeShareError(new Error('User "ghost" not found'))).toBe(
      "No user ghost found on this server",
    );
  });

  it("keeps mid-operation share failures internal", () => {
    expect(
      humanizeShareError(new Error("shareTree: moveToSpace failed for record 0123456789abcdef")),
    ).toBe("Sharing failed — please try again");
  });

  it("passes genuine network errors through unchanged", () => {
    expect(humanizeShareError(new Error("fetch failed"))).toBe("fetch failed");
  });
});
