// Video engines. The demo engine runs in the browser for free.
// Pro engines are listed so they can be switched on later: each one will call a
// server function (for example a Netlify Function) that keeps the API key secret.
import { renderVideo, isSupported } from './engine/renderer.js';

export const PROVIDERS = [
  {
    id: 'demo',
    name: 'Stone Demo Engine',
    desc: 'Animated videos made right in your browser. Free, fast and private.',
    tag: 'Active',
    available: true,
    modes: ['text', 'image', 'avatar'],
    generate: (job, io) => renderVideo(job, io),
  },
  { id: 'fal', name: 'fal.ai (Kling, Veo, Luma)', desc: 'Photo-real AI video from text or images.', tag: 'Coming soon', available: false },
  { id: 'replicate', name: 'Replicate (Wan, LTX, Hunyuan)', desc: 'Open-source video models, pay per second.', tag: 'Coming soon', available: false },
  { id: 'runway', name: 'Runway Gen-4', desc: 'Cinematic image to video.', tag: 'Coming soon', available: false },
  { id: 'heygen', name: 'HeyGen / D-ID avatars', desc: 'Realistic talking avatars with real voices.', tag: 'Coming soon', available: false },
];

export function getProvider(id) {
  return PROVIDERS.find((p) => p.id === id && p.available) || PROVIDERS[0];
}

export { isSupported };
