import { useEffect, useRef } from 'react';
import { useSiteSettings } from '../context/SiteSettingsContext';

type EffectType = 'none' | 'diya' | 'petals' | 'rangoli' | 'holi';

// ─────────────────────────────────────────────────────────────────────────────
// Diya Glow
// Warm amber/saffron/vermillion orbs that drift slowly and flicker like diyas.
// ─────────────────────────────────────────────────────────────────────────────
function runDiya(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): () => void {
  const COLORS = ['#FF6B00', '#FF9500', '#FF3D00', '#FFB300', '#FF7043', '#FFCC02'];
  const orbs = Array.from({ length: 8 }, (_, i) => ({
    cx: Math.random() * canvas.width,
    cy: Math.random() * canvas.height,
    r: 90 + Math.random() * 130,
    color: COLORS[i % COLORS.length],
    phase: Math.random() * Math.PI * 2,
    driftSpeed: 0.00018 + Math.random() * 0.00015,
    driftAmp: 55 + Math.random() * 90,
    flickerPhase: Math.random() * Math.PI * 2,
    flickerSpeed: 0.04 + Math.random() * 0.06,
  }));

  let t = 0;
  let frame = 0;
  let raf: number;

  function draw() {
    raf = requestAnimationFrame(draw);
    if (++frame % 2 !== 0) return; // 30 fps is plenty for ambient glow
    t += 32;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const o of orbs) {
      const flicker = 0.82 + 0.18 * Math.sin(t * o.flickerSpeed + o.flickerPhase);
      const x = o.cx + Math.sin(t * o.driftSpeed + o.phase) * o.driftAmp;
      const y = o.cy + Math.cos(t * o.driftSpeed * 0.65 + o.phase) * o.driftAmp * 0.55;
      const r = o.r * flicker;

      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0,   o.color + '30'); // ~19 % at hot-spot
      g.addColorStop(0.4, o.color + '18'); // ~9 %
      g.addColorStop(1,   o.color + '00');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  draw();
  return () => cancelAnimationFrame(raf);
}

// ─────────────────────────────────────────────────────────────────────────────
// Marigold Petals
// Orange and gold elliptical petals tumble and drift downward.
// ─────────────────────────────────────────────────────────────────────────────
function runPetals(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): () => void {
  const COLORS = ['#FF8C00', '#FFA500', '#FFD700', '#FF6300', '#FFBB00', '#FFC84A', '#FF5722'];

  const petals = Array.from({ length: 55 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height - canvas.height,
    w: 3.5 + Math.random() * 4,
    h: 7 + Math.random() * 9,
    speed: 0.55 + Math.random() * 0.95,
    angle: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 0.055,
    sway: 0.35 + Math.random() * 0.55,
    swayFreq: 0.008 + Math.random() * 0.012,
    swayOff: Math.random() * Math.PI * 2,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    alpha: 0.48 + Math.random() * 0.38,
  }));

  let t = 0;
  let raf: number;

  function draw() {
    raf = requestAnimationFrame(draw);
    t++;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const p of petals) {
      p.y += p.speed;
      p.x += Math.sin(t * p.swayFreq + p.swayOff) * p.sway;
      p.angle += p.rotSpeed;
      if (p.y > canvas.height + 16) {
        p.y = -16;
        p.x = Math.random() * canvas.width;
      }

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, p.w, p.h, 0, 0, Math.PI * 2);
      ctx.fill();
      // Highlight vein down the centre
      ctx.globalAlpha = p.alpha * 0.4;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(0, -p.h + 1);
      ctx.lineTo(0, p.h - 1);
      ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
  draw();
  return () => cancelAnimationFrame(raf);
}

// ─────────────────────────────────────────────────────────────────────────────
// Rangoli Sparkles
// Multi-coloured 6-pointed stars that pulse in and out like twinkling lights.
// ─────────────────────────────────────────────────────────────────────────────
function runRangoli(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): () => void {
  const PALETTE = [
    '#FF1493', '#FF6B00', '#FFD700', '#00CED1',
    '#9400D3', '#FF4500', '#00C853', '#FF69B4',
    '#E040FB', '#FF8F00', '#00BFA5', '#F50057',
  ];

  function makeStar() {
    return {
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      size: 0,
      maxSize: 2.2 + Math.random() * 4.8,
      growing: true,
      growSpeed: 0.04 + Math.random() * 0.09,
      color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
      wait: Math.floor(Math.random() * 120),
    };
  }

  const stars = Array.from({ length: 70 }, makeStar);

  // Draw a 6-pointed star (two overlapping equilateral triangles)
  function drawStar6(x: number, y: number, r: number) {
    const inner = r * 0.42;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const ia = a + Math.PI / 6;
      const ox = x + Math.cos(a) * r;
      const oy = y + Math.sin(a) * r;
      const ix = x + Math.cos(ia) * inner;
      const iy = y + Math.sin(ia) * inner;
      if (i === 0) ctx.moveTo(ox, oy); else ctx.lineTo(ox, oy);
      ctx.lineTo(ix, iy);
    }
    ctx.closePath();
    ctx.fill();
  }

  let raf: number;
  let frame = 0;

  function draw() {
    raf = requestAnimationFrame(draw);
    if (++frame % 2 !== 0) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const s of stars) {
      if (s.wait > 0) { s.wait--; continue; }
      if (s.growing) {
        s.size = Math.min(s.size + s.growSpeed, s.maxSize);
        if (s.size >= s.maxSize) s.growing = false;
      } else {
        s.size = Math.max(s.size - s.growSpeed, 0);
        if (s.size <= 0) { Object.assign(s, makeStar()); continue; }
      }
      ctx.globalAlpha = (s.size / s.maxSize) * 0.85;
      ctx.fillStyle = s.color;
      drawStar6(s.x, s.y, s.size);

      // Small soft glow behind each sparkle
      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.size * 2.2);
      g.addColorStop(0, s.color + '40');
      g.addColorStop(1, s.color + '00');
      ctx.globalAlpha = (s.size / s.maxSize) * 0.35;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  draw();
  return () => cancelAnimationFrame(raf);
}

// ─────────────────────────────────────────────────────────────────────────────
// Holi Colors
// Soft powder-puff clouds in all Holi colours float upward.
// ─────────────────────────────────────────────────────────────────────────────
function runHoli(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): () => void {
  const PALETTE = [
    '#FF1493', '#FF6B35', '#FFD700', '#00CED1',
    '#9400D3', '#7FFF00', '#FF69B4', '#1E90FF',
    '#FF4500', '#E040FB', '#00BFA5', '#FF8F00',
  ];

  const blobs = Array.from({ length: 28 }, () => ({
    x: Math.random() * canvas.width,
    y: canvas.height + Math.random() * canvas.height,
    r: 22 + Math.random() * 52,
    vy: 0.22 + Math.random() * 0.45,
    vx: (Math.random() - 0.5) * 0.28,
    color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
    alpha: 0.10 + Math.random() * 0.12,
    // secondary "puff" offset for a more organic cloud shape
    ox: (Math.random() - 0.5) * 22,
    oy: (Math.random() - 0.5) * 22,
    or: 0.55 + Math.random() * 0.35,
  }));

  let raf: number;
  let frame = 0;

  function draw() {
    raf = requestAnimationFrame(draw);
    if (++frame % 2 !== 0) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const b of blobs) {
      b.y -= b.vy;
      b.x += b.vx;
      if (b.y < -b.r * 3) {
        b.y = canvas.height + b.r;
        b.x = Math.random() * canvas.width;
        b.color = PALETTE[Math.floor(Math.random() * PALETTE.length)];
      }

      // Main puff
      const g1 = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
      g1.addColorStop(0,   b.color + 'DD');
      g1.addColorStop(0.5, b.color + '88');
      g1.addColorStop(1,   b.color + '00');
      ctx.globalAlpha = b.alpha;
      ctx.fillStyle = g1;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();

      // Secondary puff — makes it feel like drifting powder
      const x2 = b.x + b.ox, y2 = b.y + b.oy, r2 = b.r * b.or;
      const g2 = ctx.createRadialGradient(x2, y2, 0, x2, y2, r2);
      g2.addColorStop(0,   b.color + 'BB');
      g2.addColorStop(1,   b.color + '00');
      ctx.globalAlpha = b.alpha * 0.7;
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.arc(x2, y2, r2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  draw();
  return () => cancelAnimationFrame(raf);
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
const RUNNERS: Record<string, (c: HTMLCanvasElement, ctx: CanvasRenderingContext2D) => () => void> = {
  diya:    runDiya,
  petals:  runPetals,
  rangoli: runRangoli,
  holi:    runHoli,
};

export function BackgroundEffect() {
  const { background_effect } = useSiteSettings();
  const effect = (background_effect ?? 'none') as EffectType;
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (effect === 'none') return;
    const runner = RUNNERS[effect];
    if (!runner) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    function resize() {
      if (!canvas) return;
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    const cancel = runner(canvas, ctx);
    return () => {
      window.removeEventListener('resize', resize);
      cancel();
    };
  }, [effect]);

  if (effect === 'none') return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 1,
        width: '100%',
        height: '100%',
      }}
    />
  );
}
