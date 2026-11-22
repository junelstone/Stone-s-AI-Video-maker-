// The in-browser demo engine: draws animated scenes on a canvas and records them
// with MediaRecorder (plus an optional generated soundtrack).
import { ASPECTS, makeRng, hashString, planScenes, sceneAt, clamp, easeInOutSine, drawCover, roundRect, fitFont } from './util.js';
import { STYLES, vignette } from './styles.js';
import { AVATARS, drawAvatar, visemeFor } from './avatar.js';
import { Soundtrack } from './music.js';

const FPS = 30;

export function pickMimeType() {
  const options = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  if (typeof MediaRecorder === 'undefined') return null;
  return options.find((m) => MediaRecorder.isTypeSupported(m)) || '';
}

export function isSupported() {
  const c = document.createElement('canvas');
  return typeof MediaRecorder !== 'undefined' && typeof c.captureStream === 'function';
}

async function loadFonts(style) {
  if (!document.fonts) return;
  const fam = STYLES[style].font;
  try {
    await Promise.all([
      document.fonts.load(`800 48px ${fam}`),
      document.fonts.load(`600 italic 48px ${fam}`),
      document.fonts.load('800 48px Inter'),
    ]);
  } catch { /* fonts are optional */ }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Estimate when each word is spoken, used for captions and lip sync.
function wordTimeline(script, rate = 1) {
  const words = script.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  let t = 0.6;
  let charPos = 0;
  const src = script.replace(/\s+/g, ' ').trim();
  return words.map((w) => {
    const idx = src.indexOf(w, charPos);
    charPos = idx + w.length;
    const dur = (0.16 + w.replace(/[^a-z0-9]/gi, '').length * 0.058) / rate;
    const item = { word: w, start: t, dur, char: idx };
    t += dur + (/[.!?]$/.test(w) ? 0.35 : /[,;:]$/.test(w) ? 0.18 : 0.04) / rate;
    return item;
  });
}

/**
 * Render a video.
 * @param {object} job { mode, prompt, style, aspect, duration, music, images: ImageBitmap[], avatar, voice }
 * @param {object} io  { canvas, onProgress(p), onStage(name, label), signal }
 */
export async function renderVideo(job, io) {
  const { canvas, onProgress = () => {}, onStage = () => {}, signal } = io;
  const { w: W, h: H } = ASPECTS[job.aspect] || ASPECTS['9:16'];
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const style = STYLES[job.style] || STYLES.cinematic;
  const rng = makeRng(hashString(job.prompt + job.style + job.mode));
  const st = style.init(W, H, rng);

  onStage('plan', job.mode === 'avatar' ? 'Preparing your presenter…' : 'Writing scenes…');
  await loadFonts(job.style);

  let duration = job.duration;
  let scenes, words, av, speech;
  if (job.mode === 'avatar') {
    av = AVATARS[job.avatar] || AVATARS.nova;
    words = wordTimeline(job.prompt || 'Hello! Welcome to my channel.');
    const last = words[words.length - 1];
    duration = Math.min(90, last.start + last.dur + 1.2);
  }
  scenes = planScenes(job.prompt || 'Your story starts here', duration, rng);
  if (job.mode === 'image' && job.images?.length) {
    // One visual beat per photo, captions run on their own timeline.
    const per = duration / job.images.length;
    job._imageBeats = job.images.map((img, i) => ({ img, start: i * per, dur: per, motion: Math.floor(rng() * 4) }));
  }

  // Simulated thinking time so the steps feel natural, but short.
  for (let i = 0; i <= 10; i++) {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    onProgress(i * 0.006);
    await wait(55);
  }

  // Draw the first frame before recording begins.
  const state = { mouth: 0, round: 0, blink: 0, wordIdx: -1, speechStart: 0, speechEnded: false, boundary: false, boundaryAt: 0 };
  const frame = (t, end = duration) => drawFrame(ctx, { W, H, t, duration: end, job, style, st, scenes, words, av, state });
  frame(0);

  onStage('render', 'Animating your video…');
  const mime = pickMimeType();
  const stream = canvas.captureStream(FPS);
  let music = null;
  if (job.music) {
    try {
      music = new Soundtrack();
      await music.start(job.style, duration, { volume: job.mode === 'avatar' ? 0.22 : 0.5 });
      stream.addTrack(music.track);
    } catch (e) {
      console.warn('Music disabled', e);
      music = null;
    }
  }

  const recorder = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: 6_000_000 });
  const chunks = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise((res) => (recorder.onstop = res));

  // Speech for the avatar (plays live in the preview).
  if (job.mode === 'avatar' && 'speechSynthesis' in window) {
    speechSynthesis.cancel();
    speech = new SpeechSynthesisUtterance(job.prompt);
    if (job.voice) speech.voice = job.voice;
    speech.pitch = av.pitch;
    speech.rate = 1;
    speech.onstart = () => { state.speechStart = performance.now(); };
    speech.onboundary = (e) => {
      if (e.name && e.name !== 'word') return;
      state.boundary = true;
      state.boundaryAt = performance.now();
      const i = words.findIndex((w) => w.char >= e.charIndex - 1);
      if (i >= 0) state.wordIdx = i;
    };
    speech.onend = () => {
      if (!state.speechStart) { state.speechFailed = true; return; }
      state.speechEnded = true;
      state.speechEndAt = performance.now();
    };
    speech.onerror = (e) => {
      if (state.speechStart && e.error === 'interrupted') return;
      state.speechFailed = true;
    };
  }

  let thumb = null;
  recorder.start(250);
  const t0 = performance.now();
  if (speech) setTimeout(() => speechSynthesis.speak(speech), 500);

  await new Promise((resolve, reject) => {
    let raf;
    const tick = () => {
      if (signal?.aborted) {
        cancelAnimationFrame(raf);
        reject(new DOMException('Cancelled', 'AbortError'));
        return;
      }
      const t = (performance.now() - t0) / 1000;
      // The avatar keeps going while the voice is still talking.
      const live = speech && !state.speechFailed;
      const talking = live && !state.speechEnded && (state.speechStart || t < 3) && t < 90;
      let end = duration;
      if (talking) end = Math.max(duration, t + 0.1);
      else if (live && state.speechEnded) end = Math.max(2, (state.speechEndAt - t0) / 1000 + 0.9);
      frame(Math.min(t, end), talking ? Infinity : end);
      onProgress(0.06 + 0.9 * Math.min(0.99, clamp(t / Math.max(duration, end))));
      if (!thumb && t > Math.min(end * 0.4, 3)) thumb = snapshot(canvas);
      if (t >= end) return resolve();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }).finally(() => {
    if (speech && signal?.aborted) speechSynthesis.cancel();
  });

  onStage('encode', 'Finishing up…');
  recorder.stop();
  await stopped;
  stream.getTracks().forEach((tr) => tr.stop());
  music?.stop();
  onProgress(1);

  const type = (mime || 'video/webm').split(';')[0];
  const blob = new Blob(chunks, { type });
  return { blob, mime: type, ext: type.includes('mp4') ? 'mp4' : 'webm', thumb: thumb || snapshot(canvas), duration: Math.round((performance.now() - t0) / 100) / 10, width: W, height: H };
}

function snapshot(canvas) {
  const c = document.createElement('canvas');
  const scale = 360 / Math.max(canvas.width, canvas.height);
  c.width = Math.round(canvas.width * scale);
  c.height = Math.round(canvas.height * scale);
  c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.75);
}

function drawFrame(ctx, f) {
  const { W, H, t, duration, job, style, st } = f;
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  if (job.mode === 'image' && job._imageBeats) drawImageMode(ctx, f);
  else if (job.mode === 'avatar') drawAvatarMode(ctx, f);
  else drawTextMode(ctx, f);

  // Global fade from / to black.
  const fade = 1 - clamp(Math.min(t / 0.5, (duration - t) / 0.6));
  if (fade > 0) {
    ctx.fillStyle = `rgba(0,0,0,${fade})`;
    ctx.fillRect(0, 0, W, H);
  }
  // Small brand mark
  ctx.globalAlpha = 0.55;
  ctx.font = `700 ${Math.round(Math.min(W, H) * 0.024)}px Inter, sans-serif`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = job.style === 'explainer' ? '#1e1b4b' : '#ffffff';
  const bar = job.style === 'cinematic' ? (W > H ? H * 0.09 : H * 0.06) : 0;
  ctx.fillText("Stone's AI Video", W - 18, H - 14 - bar);
  ctx.restore();
}

function drawTextMode(ctx, f) {
  const { W, H, t, style, st, scenes } = f;
  const info = sceneAt(scenes, t);
  info.count = scenes.length;
  const { scene, local } = info;
  style.background(ctx, t, st, W, H, scene, info);
  style.hero(ctx, scene, local, W, H, info);
  style.text(ctx, scene, local, W, H, info);
  style.overlay(ctx, t, st, W, H);
}

function kenBurns(ctx, beat, local, W, H, x = 0, y = 0, w = W, h = H) {
  const p = easeInOutSine(local / beat.dur);
  const m = beat.motion;
  const scale = m % 2 === 0 ? 1.05 + 0.15 * p : 1.2 - 0.15 * p;
  const panX = m < 2 ? -0.6 + 1.2 * p : 0.6 - 1.2 * p;
  const panY = m === 1 || m === 2 ? 0.4 - 0.8 * p : -0.3 + 0.6 * p;
  drawCover(ctx, beat.img, x, y, w, h, scale, panX, panY);
}

function drawImageMode(ctx, f) {
  const { W, H, t, job, style, st, scenes } = f;
  const beats = job._imageBeats;
  let i = beats.findIndex((b) => t < b.start + b.dur);
  if (i < 0) i = beats.length - 1;
  const beat = beats[i];
  const local = t - beat.start;
  const prev = i > 0 ? beats[i - 1] : null;
  const xfade = prev ? clamp(local / 0.7) : 1;
  const info = sceneAt(scenes, t);
  info.count = scenes.length;

  const paint = (b, l, alpha) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    if (job.style === '3d') {
      // Blurred backdrop + floating tilted card for depth.
      ctx.filter = 'blur(22px) brightness(0.6)';
      drawCover(ctx, b.img, -40, -40, W + 80, H + 80, 1.1);
      ctx.filter = 'none';
      const cw = W * 0.8, ch = H * 0.62;
      ctx.translate(W / 2, H * 0.42);
      const rot = Math.sin((b.start + l) * 0.9) * 0.35;
      ctx.scale(Math.cos(rot) * 0.15 + 0.85, 1);
      ctx.rotate(Math.sin((b.start + l) * 0.6) * 0.03);
      ctx.shadowColor = 'rgba(34,211,238,0.7)';
      ctx.shadowBlur = 50;
      roundRect(ctx, -cw / 2, -ch / 2, cw, ch, 26);
      ctx.fillStyle = '#000';
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.clip();
      kenBurns(ctx, b, l, W, H, -cw / 2, -ch / 2, cw, ch);
    } else if (job.style === 'explainer') {
      style.background(ctx, t, st, W, H, info.scene, { ...info, local: 99 });
      const cw = W * 0.84, ch = H * 0.5;
      const x = (W - cw) / 2, y = H * 0.09;
      ctx.shadowColor = 'rgba(30,30,60,0.3)';
      ctx.shadowBlur = 30;
      ctx.shadowOffsetY = 12;
      ctx.fillStyle = '#fff';
      roundRect(ctx, x - 10, y - 10, cw + 20, ch + 20, 28);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      roundRect(ctx, x, y, cw, ch, 20);
      ctx.clip();
      kenBurns(ctx, b, l, W, H, x, y, cw, ch);
    } else {
      if (job.style === 'anime') ctx.filter = 'saturate(1.5) contrast(1.08) brightness(1.05)';
      kenBurns(ctx, b, l, W, H);
      ctx.filter = 'none';
    }
    ctx.restore();
  };

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  if (prev && xfade < 1) paint(prev, t - prev.start, 1);
  paint(beat, local, xfade);
  if (job.style !== 'explainer') style.grade(ctx, W, H);
  if (job.style === 'cinematic' || job.style === '3d') {
    const g = ctx.createLinearGradient(0, H * 0.5, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.65)');
    ctx.fillStyle = g;
    ctx.fillRect(0, H * 0.5, W, H * 0.5);
  }
  if (job.prompt.trim()) style.text(ctx, info.scene, info.local, W, H, info);
  style.overlay(ctx, t, st, W, H);
}

function drawAvatarMode(ctx, f) {
  const { W, H, t, style, st, words, av, state, job } = f;
  const scene = { hue: hashString(job.avatar || 'nova') % 360, start: 0, dur: 999, emojis: ['✨'], text: '' };
  style.background(ctx, t, st, W, H, scene, { index: 1, local: 99, count: 1 });

  // Which word are we on?
  let idx = -1, wordT = 0, wordDur = 0.3;
  if (state.boundary && !state.speechEnded) {
    idx = state.wordIdx;
    wordT = (performance.now() - state.boundaryAt) / 1000;
    wordDur = words[idx]?.dur || 0.3;
  } else if (!state.speechEnded || !state.boundary) {
    for (let i = 0; i < words.length; i++) if (t >= words[i].start && t < words[i].start + words[i].dur + 0.05) { idx = i; break; }
    if (idx >= 0) { wordT = t - words[idx].start; wordDur = words[idx].dur; }
  }
  if (state.speechEnded) idx = -1;
  let target = { open: 0, round: 0 };
  if (idx >= 0 && wordT < wordDur * 1.1) {
    const letters = words[idx].word.replace(/[^a-z]/gi, '') || 'a';
    const li = Math.min(letters.length - 1, Math.floor((wordT / wordDur) * letters.length));
    target = visemeFor(letters[li]);
    target.open *= 0.8 + 0.2 * Math.sin(t * 30);
  }
  state.mouth += (target.open - state.mouth) * 0.45;
  state.round += (target.round - state.round) * 0.3;
  const blinkPhase = (t + 0.3) % 3.7;
  state.blink = blinkPhase < 0.14 ? Math.sin((blinkPhase / 0.14) * Math.PI) : 0;

  const wide = W > H;
  const size = wide ? H * 0.2 : Math.min(W, H * 0.62) * 0.36;
  const cy = H * (wide ? 0.34 : 0.4);
  // Soft spotlight behind the presenter
  const g = ctx.createRadialGradient(W / 2, cy, size * 0.2, W / 2, cy, size * 2.2);
  g.addColorStop(0, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const bob = Math.sin(t * 1.6) * size * 0.02 + state.mouth * size * 0.015;
  drawAvatar(ctx, W / 2, cy + bob, size, av, { mouth: state.mouth, round: state.round, blink: state.blink, t, tilt: Math.sin(t * 0.8) * 0.04 });

  // Name tag
  const tagY = cy + size * 1.25;
  ctx.font = `800 ${Math.round(size * 0.16)}px Inter, sans-serif`;
  const label = av.name;
  const tw = ctx.measureText(label).width + size * 0.3;
  ctx.fillStyle = 'rgba(15,15,30,0.85)';
  roundRect(ctx, W / 2 - tw / 2, tagY, tw, size * 0.26, size * 0.13);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, W / 2, tagY + size * 0.13);

  // Captions: a window of words around the current one, current word highlighted.
  const activeIdx = idx >= 0 ? idx : words.findIndex((w) => w.start > t) - 1;
  if (activeIdx >= 0 || t < (words[0]?.start ?? 0)) {
    const ci = Math.max(0, activeIdx);
    const chunk = 6;
    const startW = Math.floor(ci / chunk) * chunk;
    const line = words.slice(startW, startW + chunk);
    const text = line.map((w) => w.word).join(' ');
    const boxW = W * 0.88;
    const { size: fs, lines } = fitFont(ctx, text, 'Inter, sans-serif', 800, boxW - 40, H * (wide ? 0.11 : 0.14), Math.round(Math.min(W, H) * 0.06));
    const lineH = fs * 1.25;
    const boxH = lines.length * lineH + fs * 0.8;
    const by = H * (wide ? 0.83 : 0.8) - boxH / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    roundRect(ctx, (W - boxW) / 2, by, boxW, boxH, 18);
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    let wi = startW;
    lines.forEach((l, li) => {
      let x = (W - ctx.measureText(l).width) / 2;
      const y = by + fs * 0.4 + li * lineH;
      for (const word of l.split(' ')) {
        const on = wi === idx;
        ctx.fillStyle = on ? '#fde047' : wi < ci || (idx < 0 && state.speechEnded) ? '#ffffff' : 'rgba(255,255,255,0.75)';
        ctx.fillText(word, x, y);
        x += ctx.measureText(word + ' ').width;
        wi++;
      }
    });
  }
  style.overlay(ctx, t, st, W, H);
  if (job.style !== 'explainer') vignette(ctx, W, H, 0.15);
}
