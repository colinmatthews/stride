import { describe, expect, it } from "vitest";
import {
  CONFETTI_COLORS,
  CONFETTI_DURATION_MS,
  advancePieces,
  createPieces,
  drawPieces,
  fadeAt,
  type ConfettiPiece,
  type ConfettiSurface,
} from "./confetti";

function stubSurface() {
  const calls = { save: 0, restore: 0, translate: 0, rotate: 0, fillRect: 0 };
  const fills: { w: number; h: number }[] = [];
  const surface: ConfettiSurface = {
    fillStyle: "",
    save: () => void calls.save++,
    restore: () => void calls.restore++,
    translate: () => void calls.translate++,
    rotate: () => void calls.rotate++,
    fillRect: (_x, _y, w, h) => {
      calls.fillRect++;
      fills.push({ w, h });
    },
  };
  return { surface, calls, fills };
}

const piece = (overrides: Partial<ConfettiPiece> = {}): ConfettiPiece => ({
  x: 100,
  y: 0,
  vx: 50,
  vy: 100,
  w: 8,
  h: 12,
  rot: 0,
  vr: 1,
  color: "#f2643c",
  ...overrides,
});

describe("createPieces", () => {
  it("spawns the requested number of pieces inside the viewport width", () => {
    const pieces = createPieces(1000, 800, 50);

    expect(pieces).toHaveLength(50);
    for (const p of pieces) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(1000);
    }
  });

  it("starts every piece above the fold so they fall into frame", () => {
    for (const p of createPieces(1000, 800, 40)) {
      expect(p.y).toBeLessThan(0);
    }
  });

  it("only uses palette colours", () => {
    for (const p of createPieces(1000, 800, 40)) {
      expect(CONFETTI_COLORS).toContain(p.color);
    }
  });

  it("is deterministic given a seeded random", () => {
    const seeded = () => 0.5;

    expect(createPieces(1000, 800, 3, seeded)).toEqual(createPieces(1000, 800, 3, seeded));
  });
});

describe("advancePieces", () => {
  it("accelerates downward under gravity", () => {
    const p = piece({ vy: 100 });
    advancePieces([p], 0.5);

    // 100 + 420 * 0.5
    expect(p.vy).toBe(310);
  });

  it("moves horizontally at constant velocity", () => {
    const p = piece({ x: 100, vx: 60 });
    advancePieces([p], 0.5);

    expect(p.x).toBe(130);
  });

  it("keeps rotating", () => {
    const p = piece({ rot: 0, vr: 2 });
    advancePieces([p], 0.25);

    expect(p.rot).toBe(0.5);
  });

  it("actually moves pieces off-screen over the life of the burst", () => {
    const pieces = createPieces(1000, 800, 20);
    const startYs = pieces.map((p) => p.y);

    for (let t = 0; t < CONFETTI_DURATION_MS; t += 16) {
      advancePieces(pieces, 0.016);
    }

    pieces.forEach((p, i) => expect(p.y).toBeGreaterThan(startYs[i]));
  });
});

describe("fadeAt", () => {
  it("is fully opaque at the start", () => {
    expect(fadeAt(0)).toBe(1);
  });

  it("is still opaque halfway through", () => {
    expect(fadeAt(CONFETTI_DURATION_MS * 0.5)).toBe(1);
  });

  it("has faded out completely by the end", () => {
    expect(fadeAt(CONFETTI_DURATION_MS)).toBe(0);
  });

  it("never goes negative past the end", () => {
    expect(fadeAt(CONFETTI_DURATION_MS * 10)).toBe(0);
  });

  it("decreases monotonically through the fade", () => {
    let previous = 1;
    for (let t = CONFETTI_DURATION_MS * 0.6; t <= CONFETTI_DURATION_MS; t += 100) {
      const value = fadeAt(t);
      expect(value).toBeLessThanOrEqual(previous);
      previous = value;
    }
  });
});

describe("drawPieces", () => {
  it("paints one rect per piece", () => {
    const { surface, calls } = stubSurface();
    drawPieces(surface, createPieces(1000, 800, 25));

    expect(calls.fillRect).toBe(25);
  });

  it("balances save/restore so canvas state doesn't leak", () => {
    const { surface, calls } = stubSurface();
    drawPieces(surface, createPieces(1000, 800, 25));

    expect(calls.save).toBe(25);
    expect(calls.restore).toBe(25);
  });

  it("draws each piece at its own size", () => {
    const { surface, fills } = stubSurface();
    drawPieces(surface, [piece({ w: 8, h: 12 })]);

    expect(fills).toEqual([{ w: 8, h: 12 }]);
  });

  it("draws nothing when the burst is empty", () => {
    const { surface, calls } = stubSurface();
    drawPieces(surface, []);

    expect(calls.fillRect).toBe(0);
  });
});
