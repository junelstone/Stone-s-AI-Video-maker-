// Visual styles for the demo engine. Each style draws a moving background,
// a "hero" visual, animated captions and a finishing overlay.
import { clamp, lerp, easeOutCubic, easeOutBack, envelope, fitFont, roundRect } from './util.js';

const TAU = Math.PI * 2;

function makeGrain(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 22;
  }
  g.putImageData(img, 0, 0);
  return c;
}

function vignette(ctx, W, H, strength = 0.65) {
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function emojiAt(ctx, emoji, x, y, size, alpha = 1, rot = 0, sx = 1) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(sx, 1);
  ctx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, 0, 0);
  ctx.restore();
}

// Reveal words one at a time; returns how many words are visible.
function wordsVisible(text, localT, speed) {
  const n = text.split(' ').length;
  return clamp(Math.floor(localT * speed) + 1, 1, n);
}

/* ---------------- Cinematic ---------------- */
const cinematic = {
  name: 'Cinematic',
  font: '"Playfair Display", Georgia, serif',
  init(W, H, rng) {
    const dust = Array.from({ length: 70 }, () => ({ x: rng() * W, y: rng() * H, r: 0.6 + rng() * 2.2, s: 4 + rng() * 14, p: rng() * TAU }));
    const orbs = Array.from({ length: 4 }, () => ({ x: rng(), y: rng(), r: 0.35 + rng() * 0.4, p: rng() * TAU }));
    return { dust, orbs, grain: makeGrain() };
  },
  background(ctx, t, st, W, H, scene) {
    const hue = (scene.hue + 200) % 360;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, `hsl(${hue}, 45%, 9%)`);
    g.addColorStop(0.6, `hsl(${(hue + 30) % 360}, 40%, 14%)`);
    g.addColorStop(1, `hsl(28, 55%, 18%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    for (const o of st.orbs) {
      const x = (o.x + Math.sin(t * 0.15 + o.p) * 0.12) * W;
      const y = (o.y + Math.cos(t * 0.12 + o.p) * 0.1) * H;
      const r = o.r * Math.max(W, H);
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, `hsla(${(o.p * 57 + 20) % 60 + 15}, 90%, 55%, 0.22)`);
      rg.addColorStop(1, 'hsla(0,0%,0%,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, W, H);
    }
    // Light rays
    ctx.save();
    ctx.translate(W * 0.8, -H * 0.1);
    for (let i = 0; i < 5; i++) {
      ctx.rotate(0.12 + Math.sin(t * 0.3 + i) * 0.01);
      ctx.fillStyle = `rgba(255,220,170,${0.025 + 0.015 * Math.sin(t + i)})`;
      ctx.fillRect(-20, 0, 40 + i * 12, H * 1.6);
    }
    ctx.restore();
    for (const d of st.dust) {
      const y = (d.y - t * d.s) % H;
      const yy = y < 0 ? y + H : y;
      ctx.fillStyle = `rgba(255,230,200,${0.25 + 0.25 * Math.sin(t * 2 + d.p)})`;
      ctx.beginPath();
      ctx.arc(d.x + Math.sin(t + d.p) * 10, yy, d.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  },
  hero(ctx, scene, local, W, H) {
    const a = envelope(local, scene.dur, 0.7, 0.5);
    const z = 1 + local * 0.05;
    const size = Math.min(W, H) * 0.3 * z;
    const cx = W / 2 + Math.sin(local * 0.4) * W * 0.02;
    const cy = H * (W > H ? 0.38 : 0.36);
    ctx.save();
    ctx.shadowColor = 'rgba(255,190,120,0.8)';
    ctx.shadowBlur = 60;
    emojiAt(ctx, scene.emojis[0], cx, cy, size, a * 0.95);
    ctx.restore();
    scene.emojis.slice(1).forEach((e, i) => {
      const side = i === 0 ? -1 : 1;
      emojiAt(ctx, e, cx + side * W * 0.28, cy + H * 0.05 + Math.sin(local + i) * 8, size * 0.38, a * 0.6);
    });
  },
  text(ctx, scene, local, W, H) {
    const a = envelope(local, scene.dur, 0.8, 0.5);
    const maxW = W * 0.82;
    const boxH = H * (W > H ? 0.26 : 0.22);
    const { size, lines } = fitFont(ctx, scene.text, this.font, '600 italic', maxW, boxH, Math.round(Math.min(W, H) * 0.085));
    const y0 = H * (W > H ? 0.68 : 0.66);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const spread = lerp(0.12, 0, easeOutCubic(local / 1.6));
    lines.forEach((l, i) => {
      const la = clamp(a * (local * 1.4 - i * 0.25));
      ctx.save();
      ctx.globalAlpha = la;
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 20;
      ctx.fillStyle = '#fff6ea';
      ctx.translate(W / 2, y0 + i * size * 1.2 + (1 - la) * 14);
      ctx.scale(1 + spread, 1);
      ctx.fillText(l, 0, 0);
      ctx.restore();
    });
  },
  overlay(ctx, t, st, W, H) {
    vignette(ctx, W, H, 0.7);
    // Film grain
    ctx.save();
    ctx.globalAlpha = 0.9;
    const ox = Math.floor(Math.random() * 256), oy = Math.floor(Math.random() * 256);
    ctx.translate(-ox, -oy);
    ctx.fillStyle = ctx.createPattern(st.grain, 'repeat');
    ctx.fillRect(ox, oy, W, H);
    ctx.restore();
    // Letterbox
    const bar = W > H ? H * 0.09 : H * 0.06;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, bar);
    ctx.fillRect(0, H - bar, W, bar);
  },
  grade(ctx, W, H) {
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, 'rgba(0,140,160,0.55)');
    g.addColorStop(1, 'rgba(255,140,40,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  },
};

/* ---------------- Anime ---------------- */
const anime = {
  name: 'Anime',
  font: '"Baloo 2", "Arial Rounded MT Bold", sans-serif',
  init(W, H, rng) {
    const petals = Array.from({ length: 46 }, () => ({ x: rng() * W, y: rng() * H, s: 40 + rng() * 90, r: 6 + rng() * 9, p: rng() * TAU, w: 0.5 + rng() * 1.5 }));
    const clouds = Array.from({ length: 6 }, () => ({ x: rng() * W, y: rng() * H * 0.45, s: 8 + rng() * 20, k: 0.6 + rng() * 0.9 }));
    const lines = Array.from({ length: 60 }, () => ({ a: rng() * TAU, l: 0.2 + rng() * 0.5, w: 1 + rng() * 4 }));
    return { petals, clouds, lines };
  },
  background(ctx, t, st, W, H, scene) {
    const h = scene.hue;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, `hsl(${(h + 190) % 360}, 85%, 62%)`);
    g.addColorStop(0.55, `hsl(${(h + 300) % 360}, 90%, 80%)`);
    g.addColorStop(1, `hsl(${(h + 20) % 360}, 95%, 86%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // Big sun
    const sx = W * 0.75, sy = H * 0.22, sr = Math.min(W, H) * 0.16;
    const sg = ctx.createRadialGradient(sx, sy, sr * 0.2, sx, sy, sr * 2.4);
    sg.addColorStop(0, 'rgba(255,255,240,1)');
    sg.addColorStop(0.35, 'rgba(255,240,200,0.6)');
    sg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, W, H);
    for (const c of st.clouds) {
      const x = ((c.x + t * c.s) % (W + 400)) - 200;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      const r = 46 * c.k;
      ctx.arc(x, c.y, r, 0, TAU);
      ctx.arc(x + r, c.y - r * 0.4, r * 1.2, 0, TAU);
      ctx.arc(x + r * 2.2, c.y, r * 0.95, 0, TAU);
      ctx.rect(x, c.y, r * 2.2, r * 0.9);
      ctx.fill();
    }
    // Hills
    ctx.fillStyle = `hsla(${(h + 140) % 360}, 55%, 55%, 0.9)`;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 20) ctx.lineTo(x, H * 0.82 + Math.sin(x * 0.006 + 1) * H * 0.04);
    ctx.lineTo(W, H);
    ctx.fill();
  },
  hero(ctx, scene, local, W, H) {
    const a = envelope(local, scene.dur, 0.3, 0.3);
    const pop = easeOutBack(local / 0.6);
    const size = Math.min(W, H) * 0.32 * pop;
    const cy = H * 0.37 + Math.sin(local * 4) * 10;
    // Speed lines burst at scene start
    const burst = clamp(1 - local / 0.9);
    if (burst > 0) {
      ctx.save();
      ctx.translate(W / 2, cy);
      ctx.strokeStyle = `rgba(255,255,255,${0.8 * burst})`;
      for (let i = 0; i < 28; i++) {
        const ang = (i / 28) * TAU;
        const r0 = Math.min(W, H) * (0.25 + 0.3 * (1 - burst));
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(Math.cos(ang) * r0, Math.sin(ang) * r0);
        ctx.lineTo(Math.cos(ang) * r0 * 1.8, Math.sin(ang) * r0 * 1.8);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.save();
    ctx.shadowColor = 'rgba(255,255,255,0.9)';
    ctx.shadowBlur = 30;
    emojiAt(ctx, scene.emojis[0], W / 2, cy, size, a, Math.sin(local * 3) * 0.08);
    ctx.restore();
    scene.emojis.slice(1).forEach((e, i) => {
      const ang = local * 1.4 + i * Math.PI;
      emojiAt(ctx, e, W / 2 + Math.cos(ang) * W * 0.3, cy + Math.sin(ang) * H * 0.06, size * 0.4, a);
    });
  },
  text(ctx, scene, local, W, H) {
    const a = envelope(local, scene.dur, 0.2, 0.3);
    const maxW = W * 0.86;
    const boxH = H * (W > H ? 0.3 : 0.24);
    const { size, lines } = fitFont(ctx, scene.text, this.font, 800, maxW, boxH, Math.round(Math.min(W, H) * 0.1));
    const y0 = H * (W > H ? 0.64 : 0.62);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.lineJoin = 'round';
    lines.forEach((l, i) => {
      const k = easeOutBack(clamp((local - i * 0.12) / 0.45));
      ctx.save();
      ctx.globalAlpha = a * clamp(k);
      ctx.translate(W / 2, y0 + i * size * 1.12);
      ctx.scale(k, k);
      ctx.rotate(Math.sin(local * 2 + i) * 0.015);
      ctx.lineWidth = size * 0.22;
      ctx.strokeStyle = '#2b1055';
      ctx.strokeText(l, 0, 0);
      ctx.fillStyle = i % 2 ? '#fff176' : '#ffffff';
      ctx.fillText(l, 0, 0);
      ctx.restore();
    });
  },
  overlay(ctx, t, st, W, H) {
    for (const p of st.petals) {
      const y = (p.y + t * p.s) % (H + 40) - 20;
      const x = p.x + Math.sin(t * p.w + p.p) * 40;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(t * p.w + p.p);
      ctx.scale(1, Math.abs(Math.sin(t * 2 + p.p)) * 0.7 + 0.3);
      ctx.fillStyle = 'rgba(255,170,205,0.9)';
      ctx.beginPath();
      ctx.ellipse(0, 0, p.r, p.r * 0.6, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    vignette(ctx, W, H, 0.18);
  },
  grade(ctx, W, H) {
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = 'rgba(255,120,200,0.35)';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  },
};

/* ---------------- 3D / synthwave ---------------- */
const CUBE = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
const CUBE_EDGES = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
const CUBE_FACES = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [0, 3, 7, 4]];

function project([x, y, z], rx, ry, scale, cx, cy) {
  let cy1 = Math.cos(ry), sy1 = Math.sin(ry);
  let x1 = x * cy1 - z * sy1, z1 = x * sy1 + z * cy1;
  let cx1 = Math.cos(rx), sx1 = Math.sin(rx);
  let y1 = y * cx1 - z1 * sx1, z2 = y * sx1 + z1 * cx1;
  const p = 4 / (4 + z2);
  return [cx + x1 * scale * p, cy + y1 * scale * p, z2];
}

const threeD = {
  name: '3D',
  font: 'Orbitron, "Arial Black", sans-serif',
  init(W, H, rng) {
    const stars = Array.from({ length: 120 }, () => ({ x: rng() * W, y: rng() * H * 0.6, r: rng() * 1.6, p: rng() * TAU }));
    return { stars };
  },
  background(ctx, t, st, W, H, scene) {
    const h = scene.hue;
    const horizon = H * 0.6;
    const g = ctx.createLinearGradient(0, 0, 0, horizon);
    g.addColorStop(0, '#07021a');
    g.addColorStop(1, `hsl(${(h % 60) + 280}, 70%, 28%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    for (const s of st.stars) {
      ctx.fillStyle = `rgba(255,255,255,${0.4 + 0.6 * Math.abs(Math.sin(t + s.p))})`;
      ctx.fillRect(s.x, s.y, s.r * 2, s.r * 2);
    }
    // Striped sun
    const sr = Math.min(W, H) * 0.24;
    const sx = W / 2, sy = horizon - sr * 0.35;
    ctx.save();
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, TAU);
    ctx.clip();
    const sg = ctx.createLinearGradient(0, sy - sr, 0, sy + sr);
    sg.addColorStop(0, '#ffe76a');
    sg.addColorStop(1, '#ff2fa0');
    ctx.fillStyle = sg;
    ctx.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
    ctx.fillStyle = '#1a0636';
    for (let i = 0; i < 7; i++) {
      const yy = sy + sr * (0.1 + i * 0.14) + ((t * 18) % (sr * 0.14));
      ctx.fillRect(sx - sr, yy, sr * 2, 3 + i * 1.6);
    }
    ctx.restore();
    // Floor
    const fg = ctx.createLinearGradient(0, horizon, 0, H);
    fg.addColorStop(0, '#1a0636');
    fg.addColorStop(1, '#05010f');
    ctx.fillStyle = fg;
    ctx.fillRect(0, horizon, W, H - horizon);
    ctx.strokeStyle = 'rgba(255, 60, 220, 0.75)';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#ff3cdc';
    ctx.shadowBlur = 12;
    for (let i = -14; i <= 14; i++) {
      ctx.beginPath();
      ctx.moveTo(W / 2 + i * 12, horizon);
      ctx.lineTo(W / 2 + i * W * 0.16, H);
      ctx.stroke();
    }
    const off = (t * 0.6) % 1;
    for (let i = 0; i < 14; i++) {
      const z = (i + off) / 14;
      const y = horizon + Math.pow(z, 2.2) * (H - horizon);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  },
  hero(ctx, scene, local, W, H) {
    const a = envelope(local, scene.dur, 0.5, 0.4);
    const t = local + scene.start;
    const cx = W / 2, cy = H * 0.33;
    const s = Math.min(W, H) * 0.14 * easeOutCubic(local / 0.8);
    const rx = t * 0.7, ry = t * 0.9;
    const pts = CUBE.map((p) => project(p, rx, ry, s, cx + Math.sin(t) * 20, cy + Math.cos(t * 1.3) * 12));
    ctx.save();
    ctx.globalAlpha = a;
    const faces = CUBE_FACES.map((f) => ({ f, z: f.reduce((acc, i) => acc + pts[i][2], 0) / 4 })).sort((x, y) => y.z - x.z);
    faces.forEach(({ f }, k) => {
      ctx.beginPath();
      f.forEach((i, j) => (j ? ctx.lineTo(pts[i][0], pts[i][1]) : ctx.moveTo(pts[i][0], pts[i][1])));
      ctx.closePath();
      ctx.fillStyle = `hsla(${190 + k * 22}, 90%, ${35 + k * 6}%, 0.35)`;
      ctx.fill();
    });
    ctx.strokeStyle = '#7df9ff';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#22d3ee';
    ctx.shadowBlur = 20;
    for (const [i, j] of CUBE_EDGES) {
      ctx.beginPath();
      ctx.moveTo(pts[i][0], pts[i][1]);
      ctx.lineTo(pts[j][0], pts[j][1]);
      ctx.stroke();
    }
    ctx.restore();
    // Emoji orbiting with fake Y rotation
    scene.emojis.forEach((e, i) => {
      const ang = t * 1.2 + (i * TAU) / scene.emojis.length;
      const depth = Math.sin(ang);
      emojiAt(ctx, e, cx + Math.cos(ang) * s * 2.3, cy + depth * s * 0.4, s * (0.9 + depth * 0.25), a * (0.6 + 0.4 * (depth + 1) / 2), 0, Math.cos(t * 2 + i));
    });
  },
  text(ctx, scene, local, W, H) {
    const a = envelope(local, scene.dur, 0.4, 0.4);
    const maxW = W * 0.84;
    const boxH = H * (W > H ? 0.24 : 0.2);
    const { size, lines } = fitFont(ctx, scene.text.toUpperCase(), this.font, 800, maxW, boxH, Math.round(Math.min(W, H) * 0.075));
    const y0 = H * (W > H ? 0.67 : 0.66);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    lines.forEach((l, i) => {
      const k = easeOutCubic(clamp((local - i * 0.15) / 0.6));
      const y = y0 + i * size * 1.2;
      ctx.save();
      ctx.globalAlpha = a * k;
      ctx.translate(W / 2, y);
      ctx.transform(1, 0, -0.12 * (1 - k), 1, 0, 0);
      // Extruded depth
      for (let d = 8; d > 0; d--) {
        ctx.fillStyle = `rgba(${80 + d * 10}, 10, ${120 + d * 12}, 1)`;
        ctx.fillText(l, d * 0.8, d * 1.1);
      }
      const cg = ctx.createLinearGradient(0, 0, 0, size);
      cg.addColorStop(0, '#ffffff');
      cg.addColorStop(0.5, '#9ef6ff');
      cg.addColorStop(0.52, '#ff7be5');
      cg.addColorStop(1, '#ffd36e');
      ctx.fillStyle = cg;
      ctx.fillText(l, 0, 0);
      ctx.restore();
    });
  },
  overlay(ctx, t, st, W, H) {
    // Scanlines
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
    vignette(ctx, W, H, 0.5);
  },
  grade(ctx, W, H) {
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(120,40,255,0.6)');
    g.addColorStop(1, 'rgba(255,40,160,0.6)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  },
};

/* ---------------- Explainer ---------------- */
const PASTELS = ['#fde68a', '#a7f3d0', '#bfdbfe', '#fbcfe8', '#ddd6fe', '#fed7aa'];
const explainer = {
  name: 'Explainer',
  font: 'Inter, system-ui, sans-serif',
  init(W, H, rng) {
    const shapes = Array.from({ length: 14 }, () => ({ x: rng() * W, y: rng() * H, s: 20 + rng() * 70, k: Math.floor(rng() * 3), p: rng() * TAU, c: PASTELS[Math.floor(rng() * PASTELS.length)] }));
    return { shapes };
  },
  background(ctx, t, st, W, H, scene, info) {
    ctx.fillStyle = PASTELS[info.index % PASTELS.length];
    ctx.fillRect(0, 0, W, H);
    // Dot grid
    ctx.fillStyle = 'rgba(30,30,60,0.08)';
    const step = Math.round(Math.min(W, H) / 22);
    for (let y = (t * 10) % step; y < H; y += step) for (let x = 0; x < W; x += step) ctx.fillRect(x, y, 3, 3);
    for (const s of st.shapes) {
      ctx.save();
      ctx.translate(s.x + Math.sin(t * 0.6 + s.p) * 30, s.y + Math.cos(t * 0.5 + s.p) * 30);
      ctx.rotate(t * 0.3 + s.p);
      ctx.fillStyle = s.c;
      ctx.strokeStyle = 'rgba(30,30,60,0.18)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      if (s.k === 0) ctx.arc(0, 0, s.s / 2, 0, TAU);
      else if (s.k === 1) ctx.rect(-s.s / 2, -s.s / 2, s.s, s.s);
      else { ctx.moveTo(0, -s.s / 2); ctx.lineTo(s.s / 2, s.s / 2); ctx.lineTo(-s.s / 2, s.s / 2); ctx.closePath(); }
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    // Wipe transition at scene start
    const w = clamp(1 - info.local / 0.45);
    if (w > 0) {
      ctx.fillStyle = PASTELS[(info.index + 3) % PASTELS.length];
      ctx.fillRect(W * (1 - w), 0, W * w, H);
    }
  },
  hero(ctx, scene, local, W, H) {
    const a = envelope(local, scene.dur, 0.35, 0.3);
    const k = easeOutBack(clamp((local - 0.2) / 0.5));
    const r = Math.min(W, H) * 0.17;
    const cx = W / 2, cy = H * (W > H ? 0.34 : 0.33);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(cx, cy);
    ctx.scale(k, k);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(30,30,60,0.25)';
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 12;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#1e1b4b';
    ctx.beginPath();
    ctx.arc(0, 0, r + 14, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(local / scene.dur));
    ctx.stroke();
    ctx.restore();
    emojiAt(ctx, scene.emojis[0], cx, cy + Math.sin(local * 3) * 4, r * 1.15 * k, a);
    scene.emojis.slice(1).forEach((e, i) => {
      const kk = easeOutBack(clamp((local - 0.5 - i * 0.2) / 0.5));
      emojiAt(ctx, e, cx + (i ? 1 : -1) * r * 1.9, cy + r * 0.6, r * 0.6 * kk, a);
    });
  },
  text(ctx, scene, local, W, H, info) {
    const a = envelope(local, scene.dur, 0.3, 0.3);
    const maxW = W * 0.8;
    const boxH = H * (W > H ? 0.26 : 0.22);
    const { size, lines } = fitFont(ctx, scene.text, this.font, 800, maxW, boxH, Math.round(Math.min(W, H) * 0.08));
    const y0 = H * (W > H ? 0.6 : 0.6);
    const pad = size * 0.6;
    const cardW = Math.min(W * 0.9, Math.max(...lines.map((l) => ctx.measureText(l).width)) + pad * 2);
    const cardH = lines.length * size * 1.2 + pad * 1.6;
    const slide = easeOutCubic(clamp((local - 0.1) / 0.5));
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(0, (1 - slide) * 60);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(30,30,60,0.2)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 10;
    roundRect(ctx, (W - cardW) / 2, y0 - pad * 0.8, cardW, cardH, 24);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    // Word-by-word reveal
    const shown = wordsVisible(scene.text, local - 0.3, 4.5);
    let count = 0;
    lines.forEach((l, i) => {
      const lw = ctx.measureText(l).width;
      let x = (W - lw) / 2;
      const y = y0 + i * size * 1.2;
      for (const word of l.split(' ')) {
        count++;
        ctx.fillStyle = count <= shown ? '#1e1b4b' : 'rgba(30,27,75,0.12)';
        ctx.fillText(word, x, y);
        x += ctx.measureText(word + ' ').width;
      }
    });
    ctx.restore();
    // Scene dots
    const n = info.count;
    const dot = 10, gap = 14;
    const dx0 = W / 2 - ((n - 1) * (dot + gap)) / 2;
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = i === info.index ? '#1e1b4b' : 'rgba(30,27,75,0.25)';
      ctx.beginPath();
      ctx.arc(dx0 + i * (dot + gap), H * 0.93, i === info.index ? dot * 0.7 : dot * 0.45, 0, TAU);
      ctx.fill();
    }
  },
  overlay() {},
  grade(ctx, W, H) {
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  },
};

export const STYLES = { cinematic, anime, '3d': threeD, explainer };
export { emojiAt, vignette };
