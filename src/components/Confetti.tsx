import { useMemo, type CSSProperties } from "react";

const COLORS = [
  "var(--primary)",
  "var(--accent)",
  "var(--pr)",
  "var(--secondary)",
  "oklch(0.62 0.19 250)",
];

interface Piece {
  id: number;
  left: number;
  color: string;
  width: number;
  height: number;
  duration: number;
  delay: number;
  drift: number;
  rotate: number;
}

function makePieces(count: number): Piece[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    color: COLORS[i % COLORS.length],
    width: 5 + Math.random() * 5,
    height: 9 + Math.random() * 7,
    duration: 2.2 + Math.random() * 1.4,
    delay: Math.random() * 0.35,
    drift: (Math.random() - 0.5) * 180,
    rotate: 360 + Math.random() * 720,
  }));
}

// A one-shot confetti burst, fixed over the whole viewport. Pieces animate
// via the `confetti-fall` keyframe defined in styles.css.
export function Confetti({ count = 90 }: { count?: number }) {
  const pieces = useMemo(() => makePieces(count), [count]);

  return (
    <div className="pointer-events-none fixed inset-0 z-[200] overflow-hidden">
      {pieces.map((piece) => (
        <span
          key={piece.id}
          className="absolute top-[-8vh] rounded-[1px]"
          style={
            {
              left: `${piece.left}%`,
              width: piece.width,
              height: piece.height,
              backgroundColor: piece.color,
              animation: `confetti-fall ${piece.duration}s ${piece.delay}s cubic-bezier(0.15,0.6,0.4,1) forwards`,
              "--confetti-drift": `${piece.drift}px`,
              "--confetti-rotate": `${piece.rotate}deg`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
