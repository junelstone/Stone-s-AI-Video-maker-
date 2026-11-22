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
const PARALLEL = 3;

export function pictureUrl(text, style, aspect, seed) {
  const { w, h } = ASPECTS[aspect] || ASPECTS['9:16'];
  const prompt = `${text}. ${STYLE_WORDS[style] || STYLE_WORDS.cinematic}, no text, no words, no watermark`;
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${w}&height=${h}&nologo=true&seed=${seed}`;
}

async function fetchPicture(url, signal) {
  const ctrl = new AbortController();
  const stop = () => ctrl.abort();
  signal?.addEventListener('abort', stop);
  const timer = setTimeout(stop, TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, mode: 'cors' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    if (!blob.type.startsWith('image/')) throw new Error('Not an image');
    return await createImageBitmap(blob);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', stop);
  }
}

/**
 * One picture per scene of the prompt. Returns ImageBitmaps (failed scenes reuse a neighbour).
 * Throws if no picture at all could be made.
 */
export async function scenePictures({ prompt, style, aspect, duration }, { onProgress = () => {}, signal } = {}) {
  const scenes = planScenes(prompt, duration, makeRng(1));
  const base = hashString(prompt + style) % 100000;
  const out = new Array(scenes.length).fill(null);
  let done = 0;
  let next = 0;
  const worker = async () => {
    while (next < scenes.length) {
      const i = next++;
      try {
        out[i] = await fetchPicture(pictureUrl(scenes[i].text, style, aspect, base + i), signal);
      } catch (e) {
        if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
        console.warn('AI picture failed for scene', i, e);
      }
      onProgress(++done / scenes.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, scenes.length) }, worker));
  const ok = out.filter(Boolean);
  if (!ok.length) throw new Error('AI pictures are not available right now');
  return out.map((b, i) => b || ok[i % ok.length]);
}
