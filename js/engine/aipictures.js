// Free AI pictures for each scene, from the Pollinations image service (no account needed).
// The pictures are then animated by the demo engine like a photo slideshow.
import { planScenes, makeRng, hashString, ASPECTS } from './util.js';

const STYLE_WORDS = {
  cinematic: 'cinematic film still, dramatic warm lighting, shallow depth of field, highly detailed',
  anime: 'anime style illustration, vibrant colors, clean line art, detailed background',
  '3d': '3D render, soft studio lighting, colorful, smooth materials, high detail',
  explainer: 'flat vector illustration, clean shapes, bright friendly colors, simple background',
};

const TIMEOUT_MS = 45000;
// Without a key the service allows 1 picture every 45 seconds per visitor (HTTP 402 otherwise),
// so a free video gets one AI picture, animated differently in each scene.
const MAX_PICTURES = 1;
const MAX_WAIT_S = 20; // wait this long at most when the service says "retry after N s"
const RETRIES = 1;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export function pictureUrl(text, style, aspect, seed) {
  const { w, h } = ASPECTS[aspect] || ASPECTS['9:16'];
  const prompt = `${text}. ${STYLE_WORDS[style] || STYLE_WORDS.cinematic}, no text, no words, no watermark`;
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${w}&height=${h}&nologo=true&seed=${seed}`;
}

async function fetchPicture(url, signal) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchOnce(url, signal);
    } catch (e) {
      if (signal?.aborted || attempt >= RETRIES || !e.retryAfter || e.retryAfter > MAX_WAIT_S) throw e;
      await wait(e.retryAfter * 1000 + 500);
    }
  }
}

async function fetchOnce(url, signal) {
  const ctrl = new AbortController();
  const stop = () => ctrl.abort();
  signal?.addEventListener('abort', stop);
  const timer = setTimeout(stop, TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, mode: 'cors' });
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      const body = await res.text().catch(() => '');
      const m = body.match(/retry after (\d+)\s*s/i);
      if (m) err.retryAfter = +m[1];
      else if (res.status === 429 || res.status >= 500) err.retryAfter = 5;
      throw err;
    }
    const blob = await res.blob();
    if (!blob.type.startsWith('image/')) throw new Error('Not an image');
    return await createImageBitmap(blob);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', stop);
  }
}

/**
 * AI pictures for the scenes of the prompt (one per scene, sharing pictures when there are fewer).
 * Throws if no picture at all could be made.
 */
export async function scenePictures({ prompt, style, aspect, duration }, { onProgress = () => {}, signal } = {}) {
  const scenes = planScenes(prompt, duration, makeRng(1));
  const base = hashString(prompt + style) % 100000;
  const n = Math.min(MAX_PICTURES, scenes.length);
  // With more scenes than pictures, each picture covers a run of neighbouring scenes.
  const owner = scenes.map((_, i) => Math.floor((i * n) / scenes.length));
  const pics = new Array(n).fill(null);
  for (let k = 0; k < n; k++) {
    const text = scenes.filter((_, i) => owner[i] === k).map((sc) => sc.text).join(' ');
    try {
      pics[k] = await fetchPicture(pictureUrl(text.slice(0, 300), style, aspect, base + k), signal);
    } catch (e) {
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
      console.warn('AI picture failed for part', k, e);
    }
    onProgress((k + 1) / n);
  }
  const ok = pics.filter(Boolean);
  if (!ok.length) throw new Error('AI pictures are not available right now');
  return scenes.map((_, i) => pics[owner[i]] || ok[i % ok.length]);
}
