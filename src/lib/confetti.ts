/**
 * Confetti physics, kept separate from the React component so the burst can be
 * tested without a browser, a canvas, or a live clock.
 */

export const CONFETTI_DURATION_MS = 2600;
export const CONFETTI_PIECE_COUNT = 90;

/** Signal orange, warm yellow, PR green, ink — the same palette as the app chrome. */
export const CONFETTI_COLORS = ["#f2643c", "#e0a92e", "#3ab566", "#2b2724"] as const;

const GRAVITY = 420;
/** Pieces start above the fold so they fall into frame rather than popping in. */
const SPAWN_CEILING = 0.3;

export type ConfettiPiece = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  rot: number;
  vr: number;
  color: string;
};

/** `random` is injectable so tests can pin the spread deterministically. */
export function createPieces(
  width: number,
  height: number,
  count: number = CONFETTI_PIECE_COUNT,
  random: () => number = Math.random,
): ConfettiPiece[] {
  return Array.from({ length: count }, () => ({
    x: width * (0.2 + random() * 0.6),
    y: -20 - random() * height * SPAWN_CEILING,
    vx: (random() - 0.5) * 220,
    vy: 120 + random() * 220,
    w: 5 + random() * 6,
    h: 8 + random() * 8,
    rot: random() * Math.PI,
    vr: (random() - 0.5) * 9,
    color: CONFETTI_COLORS[Math.floor(random() * CONFETTI_COLORS.length)],
  }));
}

/** Advances every piece by `dt` seconds under gravity. Mutates in place. */
export function advancePieces(pieces: ConfettiPiece[], dt: number) {
  for (const piece of pieces) {
    piece.vy += GRAVITY * dt;
    piece.x += piece.vx * dt;
    piece.y += piece.vy * dt;
    piece.rot += piece.vr * dt;
  }
}

/** Full opacity for the first 60% of the burst, then a linear fade to nothing. */
export function fadeAt(elapsed: number, duration: number = CONFETTI_DURATION_MS) {
  const fadeStart = duration * 0.6;
  return Math.max(0, Math.min(1, 1 - Math.max(0, elapsed - fadeStart) / (duration - fadeStart)));
}

/** The minimum canvas surface the burst needs — lets tests use a plain stub. */
export type ConfettiSurface = {
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(angle: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  // Matches the canvas signature so a real 2D context satisfies this directly.
  fillStyle: string | CanvasGradient | CanvasPattern;
};

export function drawPieces(ctx: ConfettiSurface, pieces: ConfettiPiece[]) {
  for (const piece of pieces) {
    ctx.save();
    ctx.translate(piece.x, piece.y);
    ctx.rotate(piece.rot);
    ctx.fillStyle = piece.color;
    ctx.fillRect(-piece.w / 2, -piece.h / 2, piece.w, piece.h);
    ctx.restore();
  }
}
