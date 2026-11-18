/**
 * Wait for tokens to finish moving before measuring them.
 *
 * Found in live play: the GM dragged a monster 20 ft to stand next to a PC, the module recorded the Stride, then
 * planned another Stride "because Lyra is 20 ft away", while the tokens were visibly adjacent. Recording the move
 * (a Combat flag write) and re-evaluating takes a few milliseconds, but a dragged token animates for a second or so,
 * and until it lands a placeable's `bounds` (which PF2e's `distanceTo` measures) is still the old, or an in-between,
 * position. Nothing re-checked once the token arrived, so the stale plan stayed on screen.
 *
 * PF2e itself does the same dance: its token has `animation`, a promise for the animation in progress (or null)
 * (canvas/token/object.ts:96-106), it suppresses the distance readout while that is set, and it awaits it before
 * using positions (clown-car.ts:46, object.ts:414 and 539). This waits on that promise, falling back to Foundry's
 * own `animationContexts` the way PF2e's getter does, so it also works for a token that is not a PF2e token.
 */

/** The promise for the animation in progress on a token placeable, or null. Never throws. */
export function pendingAnimation(token) {
  if (!token) return null;
  try {
    return (
      token.animation ??
      token.animationContexts?.get(token.animationName)?.promise ??
      token.animationContexts?.get(token.movementAnimationName)?.promise ??
      null
    );
  } catch {
    return null;
  }
}

/**
 * Resolve once every given token has stopped animating, or after `timeoutMs`, whichever is first: a stuck
 * animation must never leave the strip empty. A failed animation counts as finished.
 * @returns {Promise<number>} how many animations were waited for (0 means nothing was moving)
 */
export async function settleAnimations(tokens, { timeoutMs = 4000 } = {}) {
  const pending = [...tokens].map(pendingAnimation).filter(Boolean);
  if (pending.length === 0) return 0;
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(resolve, timeoutMs);
  });
  try {
    await Promise.race([Promise.allSettled(pending), timeout]);
  } finally {
    clearTimeout(timer);
  }
  return pending.length;
}
