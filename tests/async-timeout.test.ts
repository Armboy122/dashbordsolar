import { describe, expect, it, vi } from "vitest";
import { TimeoutError, withTimeout } from "../src/lib/async-timeout";

describe("async timeout helper", () => {
  it("returns the operation result when it finishes in time", async () => {
    await expect(withTimeout(Promise.resolve("ok"), 50, "timed out")).resolves.toBe("ok");
  });

  it("rejects with a timeout error when the operation stalls", async () => {
    vi.useFakeTimers();

    try {
      const stalled = withTimeout(new Promise<string>(() => {}), 25, "timed out");
      const assertion = expect(stalled).rejects.toBeInstanceOf(TimeoutError);
      await vi.advanceTimersByTimeAsync(25);
      await assertion;
      await expect(stalled).rejects.toMatchObject({ message: "timed out" });
    } finally {
      vi.useRealTimers();
    }
  });
});
