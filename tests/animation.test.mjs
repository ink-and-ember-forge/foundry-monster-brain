import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { pendingAnimation, settleAnimations } from "../scripts/animation.mjs";

/** A promise we resolve by hand, to stand in for a token animation that is still running. */
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("finding a token's animation", () => {
  it("uses PF2e's `animation` promise when the token has one", () => {
    const p = Promise.resolve();
    expect(pendingAnimation({ animation: p })).toBe(p);
  });
  it("falls back to Foundry's animationContexts, by animation name then movement name", () => {
    const a = Promise.resolve();
    const m = Promise.resolve();
    const contexts = new Map([["move", { promise: m }]]);
    expect(pendingAnimation({ animation: null, animationContexts: contexts, animationName: "x", movementAnimationName: "move" })).toBe(m);
    contexts.set("x", { promise: a });
    expect(pendingAnimation({ animation: null, animationContexts: contexts, animationName: "x", movementAnimationName: "move" })).toBe(a);
  });
  it("is null for a token that is not moving, a missing token, or odd data that throws", () => {
    expect(pendingAnimation({ animation: null })).toBeNull();
    expect(pendingAnimation({})).toBeNull();
    expect(pendingAnimation(null)).toBeNull();
    expect(pendingAnimation({ get animation() { throw new Error("odd"); } })).toBeNull();
  });
});

describe("waiting for tokens to land", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("does not wait when nothing is moving", async () => {
    expect(await settleAnimations([{ animation: null }, null, {}])).toBe(0);
  });
  it("waits until the animation finishes, and says how many it waited for", async () => {
    const a = deferred();
    let done = false;
    const wait = settleAnimations([{ animation: a.promise }, { animation: null }]).then((n) => {
      done = true;
      return n;
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(done).toBe(false);
    a.resolve();
    expect(await wait).toBe(1);
  });
  it("waits for every moving token, not just the first", async () => {
    const a = deferred();
    const b = deferred();
    let done = false;
    const wait = settleAnimations([{ animation: a.promise }, { animation: b.promise }]).then(() => (done = true));
    a.resolve();
    await vi.advanceTimersByTimeAsync(10);
    expect(done).toBe(false);
    b.resolve();
    await wait;
    expect(done).toBe(true);
  });
  it("treats a failed animation as finished", async () => {
    const a = deferred();
    const wait = settleAnimations([{ animation: a.promise }]);
    a.reject(new Error("animation interrupted"));
    expect(await wait).toBe(1);
  });
  it("gives up after the timeout, so a stuck animation never leaves the strip empty", async () => {
    const stuck = deferred();
    const wait = settleAnimations([{ animation: stuck.promise }], { timeoutMs: 4000 });
    await vi.advanceTimersByTimeAsync(3999);
    let done = false;
    wait.then(() => (done = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(await wait).toBe(1);
  });
});
