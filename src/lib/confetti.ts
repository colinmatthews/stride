/**
 * Dependency-free canvas confetti. Spawns a short-lived full-screen overlay,
 * animates a burst of paper particles in the Stride palette, then cleans itself
 * up. Safe to call from anywhere in the browser; respects reduced-motion.
 */

type ConfettiOptions = {
  /** Viewport-pixel origin of the burst. Defaults to upper-centre of screen. */
  origin?: { x: number; y: number };
  particleCount?: number;
  /** Cone width in degrees for the upward launch. */
  spread?: number;
  colors?: string[];
};

// Signal orange, PR green, warm yellow, deep ink — the app's accent tokens.
const BRAND_COLORS = ["#f06f24", "#46c272", "#f2c94c", "#39332e", "#f9a03f"];

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  size: number;
  color: string;
  shape: "rect" | "circle";
  life: number;
  ttl: number;
};

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function fireConfetti(options: ConfettiOptions = {}): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  // Honour the user's motion preference — the toast still communicates the unlock.
  if (prefersReducedMotion()) return;

  const { particleCount = 130, spread = 80, colors = BRAND_COLORS } = options;
  const origin = options.origin ?? {
    x: window.innerWidth / 2,
    y: window.innerHeight * 0.28,
  };

  const canvas = document.createElement("canvas");
  canvas.style.cssText =
    "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999";
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  document.body.appendChild(canvas);

  const particles: Particle[] = [];
  for (let i = 0; i < particleCount; i += 1) {
    const angle = ((-90 + (Math.random() - 0.5) * spread) * Math.PI) / 180;
    const speed = 6 + Math.random() * 9;
    particles.push({
      x: origin.x,
      y: origin.y,
      vx: Math.cos(angle) * speed + (Math.random() - 0.5) * 2,
      vy: Math.sin(angle) * speed,
      rot: Math.random() * Math.PI,
      vrot: (Math.random() - 0.5) * 0.35,
      size: 6 + Math.random() * 7,
      color: colors[i % colors.length],
      shape: Math.random() > 0.5 ? "rect" : "circle",
      life: 0,
      ttl: 90 + Math.random() * 45,
    });
  }

  const gravity = 0.3;
  const drag = 0.995;
  let raf = 0;

  const frame = () => {
    ctx.clearRect(0, 0, w, h);
    let alive = false;
    for (const p of particles) {
      p.life += 1;
      if (p.life > p.ttl) continue;
      alive = true;
      p.vx *= drag;
      p.vy = p.vy * drag + gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vrot;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - p.life / p.ttl);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.shape === "rect") {
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    if (alive) {
      raf = requestAnimationFrame(frame);
    } else {
      cancelAnimationFrame(raf);
      canvas.remove();
    }
  };

  raf = requestAnimationFrame(frame);
}
