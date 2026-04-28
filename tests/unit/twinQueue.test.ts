import { describe, it, expect, vi } from "vitest";
import { TwinQueue } from "../../src/services/twinQueue";

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("TwinQueue", () => {
  it("runs each unique path exactly once", async () => {
    const seen: string[] = [];
    const q = new TwinQueue(async (p) => {
      seen.push(p);
    });
    q.enqueue("a");
    q.enqueue("b");
    q.enqueue("a"); // dedup
    q.enqueue("a"); // dedup
    await q.idle();
    expect(seen.sort()).toEqual(["a", "b"]);
  });

  it("processes many paths, all of them, with bounded concurrency", async () => {
    const concurrency = 4;
    let active = 0;
    let peak = 0;
    const completed: string[] = [];
    const q = new TwinQueue(async (p) => {
      active += 1;
      peak = Math.max(peak, active);
      await tick();
      completed.push(p);
      active -= 1;
    }, concurrency);

    const paths = Array.from({ length: 20 }, (_, i) => `f${i}`);
    for (const p of paths) q.enqueue(p);
    await q.idle();

    expect(completed.length).toBe(20);
    expect(new Set(completed).size).toBe(20);
    expect(peak).toBeLessThanOrEqual(concurrency);
  });

  it("re-allows a path after it has finished (in case of rename re-add)", async () => {
    let runs = 0;
    const q = new TwinQueue(async () => {
      runs += 1;
    });
    q.enqueue("a");
    await q.idle();
    q.enqueue("a");
    await q.idle();
    expect(runs).toBe(2);
  });

  it("isolates errors so other paths still process", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const completed: string[] = [];
    const q = new TwinQueue(async (p) => {
      if (p === "boom") throw new Error("nope");
      completed.push(p);
    });
    q.enqueue("a");
    q.enqueue("boom");
    q.enqueue("b");
    await q.idle();
    expect(completed.sort()).toEqual(["a", "b"]);
    errSpy.mockRestore();
  });

  it("idle() resolves immediately when nothing is in flight", async () => {
    const q = new TwinQueue(async () => undefined);
    await expect(q.idle()).resolves.toBeUndefined();
  });

  it("tombstones a path that fails so it isn't re-run on future enqueues", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let runs = 0;
    const q = new TwinQueue(async () => {
      runs += 1;
      throw new Error("boom");
    });

    q.enqueue("a");
    await q.idle();
    expect(runs).toBe(1);
    expect(q.tombstoned("a")).toBe(true);

    q.enqueue("a"); // no-op now
    await q.idle();
    expect(runs).toBe(1);
    errSpy.mockRestore();
  });

  it("tombstoned() returns false for unknown paths", () => {
    const q = new TwinQueue(async () => undefined);
    expect(q.tombstoned("never-seen")).toBe(false);
  });

  it("markFailed(path) tombstones without the worker having to throw", async () => {
    let runs = 0;
    const q = new TwinQueue(async () => {
      runs += 1;
    });
    q.markFailed("a");
    expect(q.tombstoned("a")).toBe(true);
    q.enqueue("a");
    await q.idle();
    expect(runs).toBe(0);
  });

  it("clearTombstone(path) lets a previously-failed path be retried", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let runs = 0;
    let shouldFail = true;
    const q = new TwinQueue(async () => {
      runs += 1;
      if (shouldFail) throw new Error("boom");
    });

    q.enqueue("a");
    await q.idle();
    expect(runs).toBe(1);

    shouldFail = false;
    q.clearTombstone("a");
    q.enqueue("a");
    await q.idle();
    expect(runs).toBe(2);
    expect(q.tombstoned("a")).toBe(false);
    errSpy.mockRestore();
  });
});
