import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { resetSyncMocks } from "@betterbase/examples-shared/test";

afterEach(() => {
  cleanup();
  resetSyncMocks();
});
