// Small helpers shared by the demo video engine.

export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Deterministic random generator so the same prompt gives the same look.
export function makeRng(seed) {
  let a = seed >>> 0 || 1;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t), 3);
export const easeInOutSine = (t) => -(Math.cos(Math.PI * clamp(t)) - 1) / 2;
export const easeOutBack = (t) => {
  t = clamp(t);
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

// Fade in during the first `fin` seconds and out during the last `fout`.
export function envelope(t, dur, fin = 0.45, fout = 0.4) {
  return clamp(Math.min(t / fin, (dur - t) / fout));
}

export const ASPECTS = {
  '9:16': { w: 720, h: 1280, label: 'TikTok / Reels' },
  '16:9': { w: 1280, h: 720, label: 'YouTube' },
  '1:1': { w: 1080, h: 1080, label: 'Instagram square' },
  '4:5': { w: 864, h: 1080, label: 'Instagram post' },
};

const EMOJI_WORDS = [
  [['ocean', 'sea', 'wave', 'waves', 'beach', 'surf'], '🌊'],
  [['sun', 'sunset', 'sunrise', 'summer', 'sunny'], '🌅'],
  [['star', 'stars', 'galaxy', 'universe', 'cosmos'], '✨'],
  [['space', 'rocket', 'launch', 'astronaut', 'mars', 'moon'], '🚀'],
  [['city', 'cities', 'street', 'urban', 'skyline', 'building'], '🏙️'],
  [['forest', 'tree', 'trees', 'nature', 'jungle', 'woods'], '🌲'],
  [['mountain', 'mountains', 'hike', 'peak', 'adventure'], '🏔️'],
  [['fire', 'hot', 'burn', 'flame', 'energy'], '🔥'],
  [['love', 'heart', 'romance', 'wedding', 'valentine'], '❤️'],
  [['music', 'song', 'dance', 'party', 'beat', 'dj'], '🎵'],
  [['money', 'cash', 'business', 'sales', 'profit', 'rich', 'finance'], '💰'],
  [['idea', 'ideas', 'tip', 'tips', 'learn', 'smart', 'think'], '💡'],
  [['rain', 'storm', 'cloud', 'clouds', 'weather'], '🌧️'],
  [['snow', 'winter', 'cold', 'christmas', 'ice'], '❄️'],
  [['cat', 'cats', 'kitten'], '🐱'],
  [['dog', 'dogs', 'puppy'], '🐶'],
  [['dragon', 'dragons', 'magic', 'wizard', 'fantasy'], '🐉'],
  [['robot', 'robots', 'ai', 'tech', 'future', 'futuristic', 'cyber'], '🤖'],
  [['car', 'cars', 'drive', 'race', 'speed', 'fast'], '🏎️'],
  [['food', 'pizza', 'eat', 'restaurant', 'cook', 'cooking', 'chef'], '🍕'],
  [['coffee', 'cafe', 'morning'], '☕'],
  [['travel', 'trip', 'flight', 'plane', 'vacation', 'journey'], '✈️'],
  [['flower', 'flowers', 'spring', 'garden', 'bloom', 'sakura'], '🌸'],
  [['game', 'games', 'gaming', 'play', 'player'], '🎮'],
  [['sport', 'football', 'soccer', 'goal', 'match', 'team'], '⚽'],
  [['win', 'winner', 'champion', 'success', 'victory', 'trophy'], '🏆'],
  [['book', 'books', 'story', 'read', 'school', 'study'], '📚'],
  [['phone', 'app', 'mobile', 'social', 'online'], '📱'],
  [['camera', 'photo', 'film', 'movie', 'video', 'cinema'], '🎬'],
  [['happy', 'smile', 'joy', 'fun', 'funny'], '😄'],
  [['night', 'dark', 'midnight', 'dream', 'dreams', 'sleep'], '🌙'],
  [['world', 'earth', 'planet', 'global', 'africa'], '🌍'],
  [['health', 'fitness', 'gym', 'workout', 'strong'], '💪'],
  [['time', 'clock', 'today', 'now', 'fast'], '⏰'],
  [['gift', 'sale', 'offer', 'deal', 'discount', 'promo'], '🎁'],
  [['house', 'home', 'real', 'estate', 'apartment'], '🏡'],
  [['hotel', 'room', 'stay', 'resort'], '🏨'],
  [['grow', 'growth', 'rise', 'up', 'chart', 'data'], '📈'],
  [['lightning', 'power', 'electric', 'thunder'], '⚡'],
  [['diamond', 'luxury', 'gold', 'premium'], '💎'],
];

// Extra keywords: events and French words, so French prompts get matching icons too.
const EMOJI_WORDS_EXTRA = [
  [['birthday', 'anniversaire', 'cake', 'gateau', 'gâteau', 'celebrate', 'celebration', 'fête', 'fete'], '🎂'],
  [['church', 'église', 'eglise', 'god', 'dieu', 'jesus', 'jésus', 'pray', 'prière', 'priere', 'worship', 'culte', 'gospel', 'bless', 'blessed', 'béni'], '🙏'],
  [['wedding', 'mariage', 'married'], '💍'],
  [['shop', 'store', 'boutique', 'magasin', 'order', 'commande', 'commandez', 'buy', 'achetez', 'livraison', 'delivery'], '🛍️'],
  [['mer', 'océan', 'ocean', 'vague', 'vagues', 'plage'], '🌊'],
  [['soleil', 'coucher', 'été', 'ete'], '🌅'],
  [['étoile', 'étoiles', 'etoile', 'etoiles'], '✨'],
  [['espace', 'fusée', 'fusee', 'astronaute', 'lune'], '🚀'],
  [['ville', 'rue', 'quartier'], '🏙️'],
  [['forêt', 'foret', 'arbre', 'arbres', 'nature'], '🌲'],
  [['montagne', 'montagnes', 'aventure'], '🏔️'],
  [['feu', 'énergie', 'energie'], '🔥'],
  [['amour', 'coeur', 'cœur'], '❤️'],
  [['musique', 'chanson', 'danse', 'soirée', 'soiree'], '🎵'],
  [['argent', 'affaires', 'entreprise', 'business', 'ventes', 'prix'], '💰'],
  [['idée', 'idee', 'idées', 'conseil', 'conseils', 'astuce', 'astuces', 'apprendre'], '💡'],
  [['pluie', 'orage', 'nuage'], '🌧️'],
  [['noël', 'noel', 'hiver', 'neige'], '❄️'],
  [['chat', 'chats'], '🐱'],
  [['chien', 'chiens'], '🐶'],
  [['dragon', 'magie'], '🐉'],
  [['robot', 'avenir', 'futur', 'technologie', 'tech'], '🤖'],
  [['voiture', 'course', 'vitesse'], '🏎️'],
  [['nourriture', 'manger', 'restaurant', 'cuisine', 'plat', 'repas'], '🍕'],
  [['café', 'cafe', 'matin'], '☕'],
  [['voyage', 'vol', 'avion', 'vacances'], '✈️'],
  [['fleur', 'fleurs', 'printemps', 'jardin'], '🌸'],
  [['jeu', 'jeux'], '🎮'],
  [['sport', 'foot', 'football', 'match', 'équipe', 'equipe'], '⚽'],
  [['gagner', 'gagnant', 'champion', 'succès', 'succes', 'victoire', 'réussite', 'reussite'], '🏆'],
  [['livre', 'livres', 'histoire', 'école', 'ecole', 'étude', 'etude', 'cours', 'élèves', 'eleves'], '📚'],
  [['téléphone', 'telephone', 'application', 'ligne', 'réseaux', 'reseaux'], '📱'],
  [['film', 'vidéo', 'video', 'cinéma', 'cinema', 'photo'], '🎬'],
  [['heureux', 'sourire', 'joie', 'bonheur'], '😄'],
  [['nuit', 'rêve', 'reve', 'rêves', 'sommeil'], '🌙'],
  [['monde', 'terre', 'planète', 'planete', 'afrique', 'congo', 'brazzaville'], '🌍'],
  [['santé', 'sante', 'gym', 'fort', 'forme'], '💪'],
  [['temps', 'aujourd', 'maintenant', 'heure'], '⏰'],
  [['cadeau', 'cadeaux', 'promo', 'promotion', 'réduction', 'reduction', 'offre', 'solde', 'soldes'], '🎁'],
  [['maison', 'appartement', 'immobilier'], '🏡'],
  [['hôtel', 'hotel', 'chambre', 'séjour', 'sejour'], '🏨'],
  [['croissance', 'grandir', 'hausse'], '📈'],
  [['luxe', 'premium', 'diamant'], '💎'],
];

const EMOJI_LOOKUP = new Map();
for (const [words, emoji] of [...EMOJI_WORDS, ...EMOJI_WORDS_EXTRA]) for (const w of words) if (!EMOJI_LOOKUP.has(w)) EMOJI_LOOKUP.set(w, emoji);

export function emojisFor(text, max = 3) {
  const out = [];
  for (const raw of text.toLowerCase().split(/[^a-z0-9\u00c0-\u017f\u0153]+/)) {
    const e = EMOJI_LOOKUP.get(raw) || EMOJI_LOOKUP.get(raw.replace(/s$/, ''));
    if (e && !out.includes(e)) out.push(e);
    if (out.length >= max) break;
  }
  return out;
}

const FALLBACK_EMOJI = ['✨', '🎬', '🌟', '💫', '🚀', '🌈'];

// Turn a prompt into timed scenes.
export function planScenes(prompt, duration, rng) {
  const clean = prompt.replace(/\s+/g, ' ').trim() || 'Your story starts here';
  let parts = clean.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);

  // Long single sentences get broken into short, readable beats.
  const beats = [];
  for (const p of parts) {
    const words = p.split(' ');
    if (words.length <= 9) { beats.push(p); continue; }
    const chunks = Math.ceil(words.length / 7);
    const size = Math.ceil(words.length / chunks);
    for (let i = 0; i < words.length; i += size) beats.push(words.slice(i, i + size).join(' '));
  }
  parts = beats;

  const maxScenes = Math.max(1, Math.floor(duration / 2.2));
  if (parts.length > maxScenes) {
    // Merge neighbours until we fit.
    const merged = [];
    const per = Math.ceil(parts.length / maxScenes);
    for (let i = 0; i < parts.length; i += per) merged.push(parts.slice(i, i + per).join(' '));
    parts = merged;
  }

  const allEmojis = emojisFor(clean, 6);
  const scenes = parts.map((text, i) => {
    let emojis = emojisFor(text, 3);
    if (!emojis.length) emojis = allEmojis.length ? [allEmojis[i % allEmojis.length]] : [FALLBACK_EMOJI[Math.floor(rng() * FALLBACK_EMOJI.length)]];
    return { text, emojis, motion: Math.floor(rng() * 4), hue: Math.floor(rng() * 360) };
  });

  // Weight scene length by how much text it has, with a minimum.
  const weights = scenes.map((s) => 1 + s.text.split(' ').length * 0.12);
  const total = weights.reduce((a, b) => a + b, 0);
  let t = 0;
  scenes.forEach((s, i) => {
    s.start = t;
    s.dur = (weights[i] / total) * duration;
    t += s.dur;
  });
  return scenes;
}

export function sceneAt(scenes, t) {
  for (let i = scenes.length - 1; i >= 0; i--) if (t >= scenes[i].start) return { scene: scenes[i], index: i, local: t - scenes[i].start };
  return { scene: scenes[0], index: 0, local: t };
}

// Wrap text into lines that fit maxWidth with the current ctx.font.
export function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

// Pick a font size so that text fits in a box.
export function fitFont(ctx, text, family, weight, maxWidth, maxHeight, start, min = 18, lineH = 1.18) {
  let size = start;
  let lines;
  while (size > min) {
    ctx.font = `${weight} ${size}px ${family}`;
    lines = wrapText(ctx, text, maxWidth);
    if (lines.length * size * lineH <= maxHeight && lines.every((l) => ctx.measureText(l).width <= maxWidth)) break;
    size -= 2;
  }
  ctx.font = `${weight} ${size}px ${family}`;
  lines = wrapText(ctx, text, maxWidth);
  return { size, lines };
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawCover(ctx, img, x, y, w, h, scale = 1, panX = 0, panY = 0) {
  const ir = img.width / img.height;
  const r = w / h;
  let dw, dh;
  if (ir > r) { dh = h * scale; dw = dh * ir; } else { dw = w * scale; dh = dw / ir; }
  const dx = x + (w - dw) / 2 + panX * (dw - w) / 2;
  const dy = y + (h - dh) / 2 + panY * (dh - h) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
}
