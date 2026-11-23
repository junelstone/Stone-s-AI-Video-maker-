// Free voice-over made inside the browser with Piper (open-source text to speech).
// The voice is turned into real audio, so it is recorded into the downloaded video.
// The first use of a voice downloads it once (about 60 MB); it is then kept on the device.

const LIB_URL = 'https://cdn.jsdelivr.net/npm/@mintplex-labs/piper-tts-web@1.0.5/dist/piper-tts-web.js';

// The voices offered in the app. id = Piper voice name.
export const VOICEOVERS = [
  { id: 'fr_FR-siwis-medium', lang: 'fr', gender: 'female', label: 'Siwis' },
  { id: 'fr_FR-tom-medium', lang: 'fr', gender: 'male', label: 'Tom' },
  { id: 'en_US-hfc_female-medium', lang: 'en', gender: 'female', label: 'Hannah' },
  { id: 'en_US-ryan-medium', lang: 'en', gender: 'male', label: 'Ryan' },
];

export const voiceById = (id) => VOICEOVERS.find((v) => v.id === id);

// Best voice for a language and (optional) gender.
export function defaultVoice(lang, gender) {
  const pool = VOICEOVERS.filter((v) => v.lang === lang);
  const list = pool.length ? pool : VOICEOVERS.filter((v) => v.lang === 'en');
  return (gender && list.find((v) => v.gender === gender)) || list[0];
}

export function voiceSupported() {
  return typeof WebAssembly === 'object' && !!navigator.storage?.getDirectory;
}

let libPromise = null;
let loadedVoice = null;
// Kept so a test can swap in a fake engine.
export const engine = { load: () => (libPromise ||= import(LIB_URL)) };

// Which voices are already on this device (no download needed).
export async function storedVoices() {
  try {
    const lib = await engine.load();
    return await lib.stored();
  } catch {
    return [];
  }
}

/**
 * Speak a text and return it as audio.
 * @returns {Promise<{ wav: ArrayBuffer }>}
 * onProgress(stage, fraction): stage is 'download' (first use only) or 'speak'.
 */
export async function speak(text, voiceId, onProgress = () => {}) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) throw new Error('No text to read');
  const lib = await engine.load();
  // The library keeps one session; it does not reload the model when the voice changes.
  if (loadedVoice !== voiceId && lib.TtsSession) lib.TtsSession._instance = null;
  loadedVoice = voiceId;
  const progress = (p) => {
    if (!p || !p.total) return;
    const f = Math.min(1, p.loaded / p.total);
    if (p.url === lib.INFERENCE_PROGRESS_URL) onProgress('speak', f);
    else if (p.url && p.url.endsWith('.onnx')) onProgress('download', f);
  };
  try {
    const blob = await lib.predict({ text: clean, voiceId }, progress);
    return { wav: await blob.arrayBuffer() };
  } catch (e) {
    // Start fresh next time (a failed download must not stick).
    if (lib.TtsSession) lib.TtsSession._instance = null;
    loadedVoice = null;
    throw e;
  }
}
