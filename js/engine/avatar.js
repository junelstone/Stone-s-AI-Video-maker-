// Cartoon presenters for the talking avatar mode.
import { roundRect, clamp } from './util.js';

const TAU = Math.PI * 2;

export const AVATARS = {
  nova: { name: 'Nova', skin: '#f2c7a5', hair: '#7c3aed', hairStyle: 'long', shirt: '#ec4899', eye: '#3b2a5a', pitch: 1.1, gender: 'female' },
  leo: { name: 'Leo', skin: '#8d5a3b', hair: '#1c1917', hairStyle: 'short', shirt: '#2563eb', eye: '#1c1917', pitch: 0.95, beard: true, gender: 'male' },
  mia: { name: 'Mia', skin: '#f5d0b5', hair: '#f97316', hairStyle: 'bob', shirt: '#10b981', eye: '#14532d', pitch: 1.2, gender: 'female' },
  bolt: { name: 'Bolt', robot: true, skin: '#cbd5e1', hair: '#64748b', shirt: '#334155', eye: '#22d3ee', pitch: 0.7, gender: 'male' },
};

/**
 * Draw an avatar.
 * state: { mouth: 0..1 openness, round: 0..1 roundness, blink: 0..1, t: seconds, tilt }
 */
export function drawAvatar(ctx, cx, cy, size, av, state) {
  const s = size;
  const { mouth = 0, round = 0, blink = 0, t = 0, tilt = 0 } = state;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(tilt);

  // Shoulders / body
  ctx.fillStyle = av.shirt;
  ctx.beginPath();
  ctx.ellipse(0, s * 1.05, s * 0.95, s * 0.55, 0, Math.PI, 0);
  ctx.lineTo(s * 0.95, s * 4);
  ctx.lineTo(-s * 0.95, s * 4);
  ctx.closePath();
  ctx.fill();
  // Neck
  ctx.fillStyle = av.robot ? '#94a3b8' : shade(av.skin, -12);
  ctx.fillRect(-s * 0.16, s * 0.35, s * 0.32, s * 0.35);

  if (av.robot) {
    drawRobotHead(ctx, s, av, mouth, blink, t);
    ctx.restore();
    return;
  }

  // Back hair
  ctx.fillStyle = av.hair;
  if (av.hairStyle === 'long') {
    roundRect(ctx, -s * 0.58, -s * 0.45, s * 1.16, s * 1.25, s * 0.45);
    ctx.fill();
  } else if (av.hairStyle === 'bob') {
    roundRect(ctx, -s * 0.6, -s * 0.5, s * 1.2, s * 0.95, s * 0.4);
    ctx.fill();
  }

  // Head
  ctx.fillStyle = av.skin;
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.48, s * 0.56, 0, 0, TAU);
  ctx.fill();
  // Ears
  ctx.beginPath();
  ctx.ellipse(-s * 0.48, s * 0.02, s * 0.08, s * 0.12, 0, 0, TAU);
  ctx.ellipse(s * 0.48, s * 0.02, s * 0.08, s * 0.12, 0, 0, TAU);
  ctx.fill();

  // Front hair
  ctx.fillStyle = av.hair;
  ctx.beginPath();
  if (av.hairStyle === 'short') {
    ctx.ellipse(0, -s * 0.36, s * 0.5, s * 0.28, 0, Math.PI, 0);
    ctx.ellipse(s * 0.1, -s * 0.33, s * 0.42, s * 0.16, -0.2, 0, Math.PI);
  } else if (av.hairStyle === 'bob') {
    ctx.ellipse(0, -s * 0.32, s * 0.54, s * 0.32, 0, Math.PI, 0);
    ctx.rect(-s * 0.54, -s * 0.34, s * 1.08, s * 0.14);
  } else {
    ctx.ellipse(0, -s * 0.34, s * 0.52, s * 0.3, 0, Math.PI, 0);
    ctx.ellipse(-s * 0.18, -s * 0.3, s * 0.34, s * 0.18, 0.5, 0, Math.PI);
  }
  ctx.fill();

  if (av.beard) {
    ctx.fillStyle = shade(av.hair, 10);
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.ellipse(0, s * 0.33, s * 0.36, s * 0.24, 0, 0, Math.PI);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Cheeks
  ctx.fillStyle = 'rgba(255,110,130,0.25)';
  ctx.beginPath();
  ctx.ellipse(-s * 0.28, s * 0.16, s * 0.09, s * 0.05, 0, 0, TAU);
  ctx.ellipse(s * 0.28, s * 0.16, s * 0.09, s * 0.05, 0, 0, TAU);
  ctx.fill();

  // Eyes
  const look = Math.sin(t * 0.7) * s * 0.02;
  const eyeOpen = 1 - blink;
  for (const side of [-1, 1]) {
    const ex = side * s * 0.18, ey = -s * 0.02;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(ex, ey, s * 0.09, s * 0.1 * eyeOpen + 0.5, 0, 0, TAU);
    ctx.fill();
    if (eyeOpen > 0.2) {
      ctx.fillStyle = av.eye;
      ctx.beginPath();
      ctx.arc(ex + look, ey + s * 0.01, s * 0.055 * Math.min(1, eyeOpen * 1.3), 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(ex + look + s * 0.02, ey - s * 0.015, s * 0.016, 0, TAU);
      ctx.fill();
    }
    // Brows
    ctx.strokeStyle = shade(av.hair, -10);
    ctx.lineWidth = s * 0.03;
    ctx.lineCap = 'round';
    ctx.beginPath();
    const lift = mouth * s * 0.03;
    ctx.moveTo(ex - s * 0.08, ey - s * 0.15 - lift);
    ctx.quadraticCurveTo(ex, ey - s * 0.19 - lift, ex + s * 0.08, ey - s * 0.15 - lift);
    ctx.stroke();
  }

  // Nose
  ctx.strokeStyle = shade(av.skin, -25);
  ctx.lineWidth = s * 0.02;
  ctx.beginPath();
  ctx.moveTo(0, s * 0.06);
  ctx.quadraticCurveTo(s * 0.04, s * 0.13, -s * 0.01, s * 0.15);
  ctx.stroke();

  // Mouth
  drawMouth(ctx, 0, s * 0.28, s, mouth, round);
  ctx.restore();
}

function drawMouth(ctx, x, y, s, open, round) {
  const w = s * (0.17 - round * 0.06);
  const h = s * (0.015 + open * 0.13);
  if (open < 0.06) {
    ctx.strokeStyle = '#7f1d1d';
    ctx.lineWidth = s * 0.025;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - w, y);
    ctx.quadraticCurveTo(x, y + s * 0.05, x + w, y);
    ctx.stroke();
    return;
  }
  ctx.fillStyle = '#5b0f1a';
  ctx.beginPath();
  ctx.moveTo(x - w, y);
  ctx.quadraticCurveTo(x, y - h * 0.35, x + w, y);
  ctx.quadraticCurveTo(x, y + h * 1.6, x - w, y);
  ctx.fill();
  // Teeth and tongue
  ctx.save();
  ctx.clip();
  ctx.fillStyle = '#fff';
  ctx.fillRect(x - w, y - h, w * 2, h * 0.5);
  ctx.fillStyle = '#f472b6';
  ctx.beginPath();
  ctx.ellipse(x, y + h * 1.1, w * 0.6, h * 0.5, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawRobotHead(ctx, s, av, mouth, blink, t) {
  // Antenna
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = s * 0.04;
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.55);
  ctx.lineTo(0, -s * 0.78);
  ctx.stroke();
  ctx.fillStyle = `hsl(${(t * 120) % 360}, 90%, 60%)`;
  ctx.beginPath();
  ctx.arc(0, -s * 0.82, s * 0.07, 0, TAU);
  ctx.fill();
  // Head
  const g = ctx.createLinearGradient(0, -s * 0.55, 0, s * 0.5);
  g.addColorStop(0, '#e2e8f0');
  g.addColorStop(1, '#94a3b8');
  ctx.fillStyle = g;
  roundRect(ctx, -s * 0.52, -s * 0.55, s * 1.04, s * 1.0, s * 0.22);
  ctx.fill();
  // Face screen
  ctx.fillStyle = '#0f172a';
  roundRect(ctx, -s * 0.42, -s * 0.38, s * 0.84, s * 0.7, s * 0.14);
  ctx.fill();
  // Eyes
  ctx.fillStyle = av.eye;
  ctx.shadowColor = av.eye;
  ctx.shadowBlur = s * 0.12;
  const eh = Math.max(s * 0.015, s * 0.12 * (1 - blink));
  roundRect(ctx, -s * 0.27, -s * 0.15 - eh / 2, s * 0.16, eh, s * 0.04);
  ctx.fill();
  roundRect(ctx, s * 0.11, -s * 0.15 - eh / 2, s * 0.16, eh, s * 0.04);
  ctx.fill();
  // LED mouth equalizer
  const bars = 7;
  for (let i = 0; i < bars; i++) {
    const center = 1 - Math.abs(i - (bars - 1) / 2) / ((bars - 1) / 2);
    const hgt = s * (0.02 + mouth * 0.16 * (0.4 + 0.6 * center) * (0.7 + 0.3 * Math.sin(t * 25 + i * 1.7)));
    ctx.fillRect(-s * 0.25 + i * s * 0.075, s * 0.14 - hgt / 2, s * 0.05, hgt);
  }
  ctx.shadowBlur = 0;
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(((n >> 16) & 255) + amt, 0, 255);
  const g = clamp(((n >> 8) & 255) + amt, 0, 255);
  const b = clamp((n & 255) + amt, 0, 255);
  return `rgb(${r},${g},${b})`;
}

// Mouth openness for a letter, used for simple lip sync.
export function visemeFor(ch) {
  ch = (ch || '').toLowerCase();
  if ('aeiy'.includes(ch)) return { open: 0.85, round: 0 };
  if ('ouw'.includes(ch)) return { open: 0.6, round: 1 };
  if ('mbp'.includes(ch)) return { open: 0, round: 0 };
  if ('fv'.includes(ch)) return { open: 0.15, round: 0 };
  if (/[a-z]/.test(ch)) return { open: 0.35, round: 0.2 };
  return { open: 0, round: 0 };
}

// Small preview icon for the picker.
export function drawAvatarIcon(canvas, key) {
  const ctx = canvas.getContext('2d');
  const dpr = 2;
  canvas.width = canvas.height = 64 * dpr;
  ctx.scale(dpr, dpr);
  const g = ctx.createLinearGradient(0, 0, 64, 64);
  g.addColorStop(0, '#312e81');
  g.addColorStop(1, '#831843');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(32, 32, 32, 0, TAU);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(32, 32, 32, 0, TAU);
  ctx.clip();
  drawAvatar(ctx, 32, 30, 30, AVATARS[key], { mouth: 0.1, t: 0 });
  ctx.restore();
}
