import { CONFIG } from './config.js';
import { PROVIDERS, getProvider, isSupported } from './providers.js';
import { AVATARS, drawAvatarIcon } from './engine/avatar.js';
import { supabase, initAuth, onAuthChange, currentUser, signIn, signUp, signOut, getProfile, spendCredits, cloudEnabled, activateKey, getPricing, resetPassword, updatePassword, onPasswordRecovery } from './supabase.js';
import { localStore, saveVideo, listCloudVideos, signedVideoUrl, deleteVideo, backupVideo } from './store.js';
import { t, tn, getLang, setLang, applyI18n, onLangChange } from './i18n.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const state = {
  mode: 'text',
  style: 'cinematic',
  aspect: '9:16',
  duration: 8,
  music: true,
  images: [],
  avatar: 'nova',
  voiceURI: null,
  engine: 'demo',
  profile: { credits: CONFIG.GUEST_CREDITS, guest: true },
  result: null,
  abort: null,
  busy: false,
  gallery: [],
  playerItem: null,
  mood: 'auto',
  logo: null, // data URL of the customer's logo
  voiceManual: false,
  tplCat: 'all',
};
const LOGO_KEY = 'stoneai.logo';

const PLACEHOLDERS = {
  en: {
    text: 'A lone astronaut walks across a glowing ocean at sunset. The stars wake up. A new journey begins.',
    image: 'Optional caption, e.g. "Summer in Brazzaville. Good vibes only."',
    avatar: 'Hi everyone! Welcome to my channel. Today I will show you three quick tips to grow your business online. Let\'s go!',
  },
  fr: {
    text: 'Un astronaute marche sur un océan lumineux au coucher du soleil. Les étoiles se réveillent. Un nouveau voyage commence.',
    image: 'Légende facultative, ex. « L\'été à Brazzaville. Que des bonnes vibes. »',
    avatar: 'Bonjour à tous ! Bienvenue sur ma chaîne. Aujourd\'hui je vous donne trois astuces pour développer votre business en ligne. C\'est parti !',
  },
};

const SURPRISE = {
  en: {
    text: [
      'A tiny robot discovers a garden on Mars. It plants the first flower. The red planet turns green.',
      'Morning coffee in a quiet city. The sun rises over the skyline. Today is your day.',
      'A dragon flies over snowy mountains at night. The stars light the way home.',
      'Three tips to save money. Track every expense. Cook at home. Invest a little every month.',
      'Big sale this weekend only! Fifty percent off everything. Come visit us today.',
      'The ocean whispers at sunset. Waves dance with the light. Peace at last.',
    ],
    image: ['Memories that last forever.', 'New collection. Available now.', 'Weekend getaway mood.', 'Before and after. Real results.'],
    avatar: [
      'Hello and welcome! I am your new AI presenter. Type any script and I will read it for you, with captions and music.',
      'Did you know? Drinking water first thing in the morning wakes up your brain. Try it tomorrow and tell me how you feel!',
      'Big news! Our shop is now open online. Order today and get free delivery all week long.',
    ],
  },
  fr: {
    text: [
      'Un petit robot découvre un jardin sur Mars. Il plante la première fleur. La planète rouge devient verte.',
      'Un café le matin dans une ville calme. Le soleil se lève sur la ville. Aujourd\'hui est ton jour.',
      'Un dragon vole au-dessus des montagnes enneigées. Les étoiles éclairent le chemin.',
      'Trois astuces pour économiser. Note chaque dépense. Cuisine à la maison. Épargne un peu chaque mois.',
      'Grande promo ce week-end seulement ! Moins cinquante pour cent sur tout. Venez nous voir aujourd\'hui.',
      'L\'océan murmure au coucher du soleil. Les vagues dansent avec la lumière. Enfin la paix.',
    ],
    image: ['Des souvenirs pour toujours.', 'Nouvelle collection. Disponible maintenant.', 'Ambiance week-end.', 'Avant et après. De vrais résultats.'],
    avatar: [
      'Bonjour et bienvenue ! Je suis votre nouveau présentateur. Écrivez un texte et je le lis pour vous, avec sous-titres et musique.',
      'Le saviez-vous ? Boire de l\'eau dès le réveil réveille votre cerveau. Essayez demain et dites-moi ce que vous ressentez !',
      'Grande nouvelle ! Notre boutique est maintenant en ligne. Commandez aujourd\'hui et la livraison est gratuite toute la semaine.',
    ],
  },
};

// Ready-made ideas, grouped by use. Each one fills the studio in one tap.
const TEMPLATE_CATS = [
  ['all', 'All'], ['business', 'Business'], ['events', 'Events'], ['church', 'Church'], ['social', 'Social media'], ['learn', 'Learning'],
];
const TEMPLATES = [
  { cat: 'business', mode: 'text', style: 'anime', aspect: '9:16', name: ['Shop promo', 'Promo boutique'],
    en: 'Big sale this weekend! Fifty percent off everything in the shop. Free gift for every customer. Come today!',
    fr: 'Grande promo ce week-end ! Moins cinquante pour cent sur toute la boutique. Un cadeau pour chaque client. Venez aujourd\'hui !' },
  { cat: 'business', mode: 'text', style: 'cinematic', aspect: '1:1', name: ['New product', 'Nouveau produit'],
    en: 'Something new is here. Made with care. Premium quality at the right price. Order now on WhatsApp.',
    fr: 'Du nouveau arrive. Fait avec soin. Qualité premium au juste prix. Commandez maintenant sur WhatsApp.' },
  { cat: 'business', mode: 'avatar', style: 'explainer', aspect: '9:16', name: ['Restaurant menu', 'Menu du restaurant'],
    en: 'Hello! Today at our restaurant: grilled fish, chicken with plantain and fresh juice. Order now, we deliver in thirty minutes!',
    fr: 'Bonjour ! Aujourd\'hui au restaurant : poisson braisé, poulet aux bananes plantains et jus frais. Commandez, on livre en trente minutes !' },
  { cat: 'business', mode: 'text', style: '3d', aspect: '4:5', name: ['Real estate', 'Immobilier'],
    en: 'Beautiful house for rent. Three bedrooms, big living room, secure area. Call us today for a visit.',
    fr: 'Belle maison à louer. Trois chambres, grand salon, quartier sécurisé. Appelez-nous aujourd\'hui pour une visite.' },
  { cat: 'events', mode: 'text', style: 'anime', aspect: '9:16', name: ['Birthday wish', 'Joyeux anniversaire'],
    en: 'Happy birthday! Today is your day. May this new year bring you joy, love and success. Celebrate big!',
    fr: 'Joyeux anniversaire ! Aujourd\'hui c\'est ton jour. Que cette nouvelle année t\'apporte joie, amour et succès. Fais la fête !' },
  { cat: 'events', mode: 'text', style: 'cinematic', aspect: '16:9', name: ['Wedding invitation', 'Invitation au mariage'],
    en: 'Two hearts, one love. You are invited to our wedding. Saturday at three in the afternoon. We hope to see you there.',
    fr: 'Deux cœurs, un seul amour. Vous êtes invités à notre mariage. Samedi à quinze heures. Nous espérons vous y voir.' },
  { cat: 'events', mode: 'text', style: '3d', aspect: '9:16', name: ['Party night', 'Soirée'],
    en: 'Party night this Friday! Music, dance and good vibes. DJ live until midnight. Bring your friends!',
    fr: 'Grande soirée ce vendredi ! Musique, danse et bonne ambiance. DJ en live jusqu\'à minuit. Venez avec vos amis !' },
  { cat: 'church', mode: 'text', style: 'cinematic', aspect: '9:16', name: ['Sunday service', 'Culte du dimanche'],
    en: 'Join us this Sunday for worship. Praise, prayer and the word of God. Everyone is welcome. God bless you.',
    fr: 'Rejoignez-nous ce dimanche pour le culte. Louange, prière et parole de Dieu. Tout le monde est le bienvenu. Que Dieu vous bénisse.' },
  { cat: 'church', mode: 'avatar', style: 'cinematic', aspect: '9:16', name: ['Verse of the day', 'Verset du jour'],
    en: 'Good morning family. Here is the verse of the day: be strong and courageous, do not be afraid. Have a blessed day!',
    fr: 'Bonjour la famille. Voici le verset du jour : fortifie-toi et prends courage, ne crains point. Passez une journée bénie !' },
  { cat: 'social', mode: 'text', style: 'cinematic', aspect: '9:16', name: ['Motivation', 'Motivation'],
    en: 'Start where you are. Use what you have. Do what you can. Your future is built today.',
    fr: 'Commence là où tu es. Utilise ce que tu as. Fais ce que tu peux. Ton avenir se construit aujourd\'hui.' },
  { cat: 'social', mode: 'image', style: 'anime', aspect: '9:16', name: ['Photo memories', 'Souvenirs en photos'],
    en: 'Memories that last forever.', fr: 'Des souvenirs pour toujours.' },
  { cat: 'learn', mode: 'text', style: 'explainer', aspect: '1:1', name: ['3 quick tips', '3 astuces rapides'],
    en: 'Three tips to grow your business. Post every day. Talk to your customers. Track your money.',
    fr: 'Trois astuces pour développer ton business. Publie chaque jour. Parle à tes clients. Suis ton argent.' },
  { cat: 'learn', mode: 'avatar', style: 'explainer', aspect: '16:9', name: ['Lesson intro', 'Introduction du cours'],
    en: 'Welcome to today\'s lesson. In five minutes you will learn the basics, with simple examples. Let\'s start!',
    fr: 'Bienvenue au cours d\'aujourd\'hui. En cinq minutes vous allez apprendre les bases, avec des exemples simples. On commence !' },
];

/* ---------------- Toast ---------------- */
let toastTimer;
function toast(msg, ms = 2800) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

/* ---------------- Mode, style, aspect ---------------- */
function cost() {
  return CONFIG.COSTS[state.mode] || 1;
}

function setMode(mode) {
  state.mode = mode;
  $$('.mode-tab').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  $('#imageField').classList.toggle('hidden', mode !== 'image');
  $('#avatarField').classList.toggle('hidden', mode !== 'avatar');
  $('#durationWrap').classList.toggle('hidden', mode === 'avatar');
  $('#prompt').placeholder = PLACEHOLDERS[getLang()][mode];
  updateCostLabel();
  markStale();
  if (mode === 'avatar') loadVoices();
}

function updateCostLabel() {
  $('#costLabel').textContent = state.profile.unlimited ? t('Included in your plan') : tn(cost(), 'credit', 'credits');
}

// The last video stays on screen while you change things: dim it so it is clear a new one is needed.
function markStale() {
  if (state.busy || $('#resultVideo').classList.contains('hidden')) return;
  const screen = $('#screen');
  screen.dataset.stale = t('Press Generate to make the new video');
  screen.classList.add('stale');
}

function setChip(group, attr, value) {
  $$(`#${group} .chip`).forEach((b) => b.classList.toggle('active', b.dataset[attr] === value));
}

function setStyle(style) {
  state.style = style;
  setChip('styleChips', 'style', style);
  markStale();
}

function setAspect(aspect) {
  state.aspect = aspect;
  setChip('aspectChips', 'aspect', aspect);
  $('#screen').dataset.aspect = aspect;
  markStale();
}

/* ---------------- Images ---------------- */
async function addImages(files) {
  const list = [...files].filter((f) => f.type.startsWith('image/'));
  for (const file of list) {
    if (state.images.length >= 6) {
      toast(t('Up to 6 photos per video'));
      break;
    }
    try {
      const bitmap = await createImageBitmap(file);
      state.images.push({ file, bitmap, url: URL.createObjectURL(file) });
    } catch {
      toast(t('Could not read {name}', { name: file.name }));
    }
  }
  renderThumbs();
  markStale();
}

function renderThumbs() {
  const wrap = $('#thumbs');
  wrap.innerHTML = '';
  state.images.forEach((img, i) => {
    const d = document.createElement('div');
    d.className = 'thumb';
    d.innerHTML = `<img alt="${i + 1}" src="${img.url}"><button type="button" aria-label="${t('Remove')}">✕</button>`;
    d.querySelector('button').onclick = () => {
      URL.revokeObjectURL(img.url);
      state.images.splice(i, 1);
      renderThumbs();
    };
    wrap.appendChild(d);
  });
}

/* ---------------- Avatars and voices ---------------- */
function renderAvatarPicker() {
  const wrap = $('#avatarPicker');
  for (const [key, av] of Object.entries(AVATARS)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'avatar-opt' + (key === state.avatar ? ' active' : '');
    const c = document.createElement('canvas');
    drawAvatarIcon(c, key);
    b.append(c, Object.assign(document.createElement('span'), { textContent: av.name }));
    b.onclick = () => {
      state.avatar = key;
      $$('.avatar-opt').forEach((x) => x.classList.toggle('active', x === b));
      state.voiceManual = false;
      loadVoices();
      markStale();
    };
    wrap.appendChild(b);
  }
}

function voices() {
  return 'speechSynthesis' in window ? speechSynthesis.getVoices() : [];
}

// Guess a voice's gender from its name (browsers do not say).
const FEMALE_RE = /female|woman|zira|aria|jenny|samantha|karen|victoria|susan|hazel|libby|sonia|amelie|amélie|audrey|julie|denise|hortense|marie|virginie|elsa|eloise|helena|sabina|paulina|monica|moira|tessa|fiona|veena|alice|luciana|joana|ellen|sara|nora|anna|catherine|ava|allison|google us english|google français|google francais/i;
const MALE_RE = /\bmale\b|\bman\b|david|mark|guy|james|george|daniel|thomas|alex\b|fred|ryan|paul|henri|claude|nicolas|jacques|yannick|rishi|aaron|arthur|oliver|remy|rémy|jerome|google uk english male/i;
function voiceGender(v) {
  if (FEMALE_RE.test(v.name)) return 'female';
  if (MALE_RE.test(v.name)) return 'male';
  return '';
}

// Best voice for the presenter: same language as the app, then same gender.
function pickVoice(list, gender) {
  const lang = getLang();
  const same = list.filter((v) => v.lang.toLowerCase().startsWith(lang));
  const pool = same.length ? same : list.filter((v) => v.lang.toLowerCase().startsWith('en'));
  return pool.find((v) => voiceGender(v) === gender && v.localService)
    || pool.find((v) => voiceGender(v) === gender)
    || pool.find((v) => !voiceGender(v))
    || pool[0] || list[0];
}

function loadVoices() {
  const sel = $('#voiceSelect');
  const list = voices();
  if (!list.length) {
    sel.innerHTML = `<option>${t('Default voice')}</option>`;
    return;
  }
  const lang = getLang();
  const sorted = [...list].sort((a, b) => (b.lang.startsWith(lang) - a.lang.startsWith(lang)) || (b.lang.startsWith('en') - a.lang.startsWith('en')) || a.name.localeCompare(b.name));
  sel.innerHTML = sorted.map((v) => {
    const g = voiceGender(v);
    return `<option value="${esc(v.voiceURI)}">${esc(v.name)} (${esc(v.lang)})${g ? ' · ' + t(g === 'female' ? 'female' : 'male') : ''}</option>`;
  }).join('');
  if (!state.voiceManual || !sorted.some((v) => v.voiceURI === state.voiceURI)) {
    state.voiceURI = pickVoice(sorted, AVATARS[state.avatar].gender)?.voiceURI || sel.value;
  }
  sel.value = state.voiceURI;
}

function selectedVoice() {
  return voices().find((v) => v.voiceURI === state.voiceURI) || null;
}

/* ---------------- Credits & auth UI ---------------- */
async function refreshCredits() {
  state.profile = await getProfile();
  const pill = $('#creditsBtn');
  if (state.profile.unlimited) {
    pill.innerHTML = `<span class="coin">◆</span> ${esc(t('Unlimited'))}`;
    pill.title = t('{name} subscription', { name: state.profile.sub.name });
  } else {
    pill.innerHTML = `<span class="coin">◆</span> <span id="creditsValue"></span> ${esc(t('credits'))}`;
    $('#creditsValue').textContent = state.profile.credits;
    pill.title = t('Your credits');
  }
  updateCostLabel();
  updateBrandNote();
}

function updateBrandNote() {
  $('#brandNote').textContent = state.profile.unlimited
    ? t('Your plan has no "Stone\'s AI Video" mark on videos.')
    : t('Paid plans remove the small "Stone\'s AI Video" mark.');
}

function updateAuthUI() {
  const u = currentUser();
  $('#authBtn').textContent = u ? t('My account') : t('Sign in');
  $('#galleryNote').textContent = u ? t('Saved to your account') : t('Saved on this device. Sign in to keep them in the cloud.');
}

let authMode = 'signin';
function setAuthMode(mode) {
  authMode = mode;
  const up = mode === 'signup';
  $('#authTitle').textContent = up ? t('Create your account') : t('Welcome back');
  $('#authSub').textContent = up
    ? t('Free account with {n} credits. Your videos are saved to the cloud.', { n: CONFIG.SIGNUP_CREDITS })
    : t('Sign in to save your videos to the cloud and use your credits.');
  $('#authSubmit').textContent = up ? t('Create account') : t('Sign in');
  $('#authSwitchText').textContent = up ? t('Already have an account?') : t('New here?');
  $('#authSwitch').textContent = up ? t('Sign in') : t('Create an account');
  $('#authPassword').autocomplete = up ? 'new-password' : 'current-password';
  $('#forgotBtn').classList.toggle('hidden', up);
  $('#authError').classList.add('hidden');
}

function openAuth(mode = 'signin') {
  if (!cloudEnabled()) {
    toast(t('Accounts are not set up yet. You can still create videos as a guest.'));
    return;
  }
  setAuthMode(mode);
  $('#authModal').showModal();
}

async function openAccount() {
  const u = currentUser();
  $('#accountEmail').textContent = u.email;
  $('#accountCredits').textContent = state.profile.credits;
  $('#accountPlan').textContent = t((state.profile.plan || 'free').replace(/^./, (c) => c.toUpperCase()));
  $('#accountBuy').textContent = state.profile.unlimited ? t('See plans and prices') : '◆ ' + t('Get more credits');
  $('#accountBuy').className = `btn ${state.profile.unlimited ? 'btn-ghost' : 'btn-primary'} btn-block`;
  $('#accountVideos').textContent = state.gallery.length;
  renderSubscription();
  $('#keyError').classList.add('hidden');
  $('#keyInput').value = '';
  $('#accountModal').showModal();
}

const TIER_NAMES = { basic: 'Starter', pro: 'Pro', business: 'Studio' };
function renderSubscription() {
  const sub = state.profile.sub;
  const box = $('#subBox');
  box.classList.toggle('hidden', !sub);
  $('#keyBox').classList.toggle('hidden', !!sub?.open);
  if (!sub) return;
  const until = new Date(sub.expires_at).toLocaleDateString(getLang() === 'fr' ? 'fr-FR' : undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  box.classList.toggle('ended', !sub.open);
  box.innerHTML = '<b></b><span></span>';
  box.querySelector('b').textContent = `${t('{name} subscription', { name: TIER_NAMES[sub.tier] || 'Pro' })} · ${sub.name}`;
  box.querySelector('span').textContent = sub.open
    ? t('Unlimited videos until {d}.', { d: until })
    : t('Ended on {d}. Renew it to get unlimited videos again.', { d: until });
  if (sub.open) $('#accountPlan').textContent = TIER_NAMES[sub.tier] || 'Pro';
}

async function activate() {
  const key = $('#keyInput').value.trim();
  const err = $('#keyError');
  err.classList.add('hidden');
  if (key.length < 8) {
    err.textContent = t('Type the full key, like SAV-7KQ2-M9XD-4TPA.');
    err.classList.remove('hidden');
    return;
  }
  $('#keyBtn').disabled = true;
  try {
    await activateKey(key);
    await refreshCredits();
    renderSubscription();
    $('#accountPlan').textContent = TIER_NAMES[state.profile.sub?.tier] || 'Pro';
    toast(t('Activated! Enjoy unlimited videos ✨'));
  } catch (e) {
    err.textContent = t(e.message || 'Could not activate this key');
    err.classList.remove('hidden');
  } finally {
    $('#keyBtn').disabled = false;
  }
}

/* ---------------- Plans & credits ---------------- */
let pricingCache = null;
let supportNumber = '';
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fcfa = (n, cur) => `${Math.round(Number(n) || 0).toLocaleString('en-US').replace(/,/g, '\u00a0')}\u00a0${cur}`;

async function openPricing() {
  renderPricing(pricingCache);
  $('#creditsModal').showModal();
  if (!pricingCache) {
    pricingCache = await getPricing().catch(() => null);
    if (pricingCache) renderPricing(pricingCache);
  }
}

function renderPricing(remote) {
  const P = CONFIG.PRICING;
  const cur = remote?.currency || P.currency;
  const weekly = remote?.weekly_price ?? P.weekly;
  const tiers = Object.entries(P.tiers).map(([k, d]) => ({ k, ...d, ...(remote?.tiers?.[k] || {}) }));
  const wa = String(remote?.support_whatsapp || remote?.support_phone || '').replace(/[^0-9]/g, '');
  const email = currentUser()?.email;
  const link = (what) => `https://wa.me/${wa}?text=${encodeURIComponent(t('Hello! I want {what} on Stone\'s AI Video.', { what }) + (email ? ' ' + t('My account email: {e}.', { e: email }) : '') + ' ' + t('I paid by mobile money, transaction ID: '))}`;
  const choose = (what, primary) => wa
    ? `<a class="btn ${primary ? 'btn-primary' : 'btn-ghost'} btn-choose" target="_blank" rel="noopener" href="${esc(link(what))}">${esc(t('Choose'))}</a>`
    : '';

  const plans = [
    { name: t('Weekly pass'), amt: weekly, per: t('week'), meta: t('1 user · try it for a campaign'), what: t('the Weekly pass ({p})', { p: fcfa(weekly, cur) }) },
    ...tiers.map((x) => ({
      name: x.name, amt: x.monthly, per: t('month'), featured: x.k === 'pro',
      meta: `${tn(x.users, 'user', 'users')} · ${t('or {p} a year', { p: fcfa(x.yearly, cur) })}`,
      what: t('the {name} plan ({m} per month or {y} per year)', { name: x.name, m: fcfa(x.monthly, cur), y: fcfa(x.yearly, cur) }),
    })),
  ];
  $('#plansGrid').innerHTML = plans.map((p) => `
    <div class="plan${p.featured ? ' featured' : ''}">
      ${p.featured ? `<span class="badge">${esc(t('Most popular'))}</span>` : ''}
      <b>${esc(p.name)}</b>
      <span class="amt">${esc(fcfa(p.amt, cur))} <small>/ ${p.per}</small></span>
      <span class="meta">${esc(t('Unlimited videos'))} · ${esc(p.meta)}</span>
      ${choose(p.what, p.featured)}
    </div>`).join('');

  $('#packsGrid').innerHTML = P.packs.map((k) => `
    <div class="pack${k.best ? ' featured' : ''}">
      ${k.best ? `<span class="badge">${esc(t('Best value'))}</span>` : ''}
      <span class="big">${k.credits}</span><span>${esc(t('credits'))}</span>
      <span class="price">${esc(fcfa(k.price, cur))}</span>
      ${choose(`${k.credits} ${t('credits')} (${fcfa(k.price, cur)})`, k.best)}
    </div>`).join('');

  $('#howPay').innerHTML = wa
    ? `<b>${esc(t('How to pay'))}</b><ol>
        <li>${t('Send the amount by {m} to <b>+{n}</b>.', { m: esc(t(P.payMethods)), n: esc(wa) })}</li>
        <li>${t('Tap <b>Choose</b> to send us the transaction ID on WhatsApp')}${email ? '' : esc(t(' (sign in first so we know your account)'))}.</li>
        <li>${t('We add your credits or send your activation key the same day. Enter the key in <b>My account</b>.')}</li>
      </ol>`
    : `<b>${esc(t('How to pay'))}</b><p class="small">${esc(t('Pay by {m}. Payment details are coming soon, contact us to subscribe.', { m: t(P.payMethods) }))}</p>`;
  supportNumber = wa;
}

/* ---------------- Generate ---------------- */
function slug(s) {
  return (s || 'video').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'video';
}

function makeTitle(prompt, mode) {
  const words = prompt.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return mode === 'image' ? t('Photo animation') : t('My video');
  const t = words.slice(0, 6).join(' ').replace(/[.,!?;:]+$/, '');
  return words.length > 6 ? t + '…' : t;
}

function setProgress(p) {
  const pct = Math.round(p * 100);
  $('#progressFill').style.width = pct + '%';
  $('#progressPct').textContent = pct + '%';
}

function setStage(step, label) {
  $('#progressStage').textContent = t(label);
  const order = ['plan', 'render', 'encode'];
  const idx = order.indexOf(step);
  $$('#steps li').forEach((li, i) => {
    li.classList.toggle('active', i === idx);
    li.classList.toggle('done', i < idx);
  });
}

function showStage(view) {
  // view: empty | rendering | result
  $('#screenEmpty').classList.toggle('hidden', view !== 'empty');
  $('#canvas').classList.toggle('hidden', view !== 'rendering');
  $('#resultVideo').classList.toggle('hidden', view !== 'result');
  $('#progress').classList.toggle('hidden', view !== 'rendering');
  $('#resultActions').classList.toggle('hidden', view !== 'result');
  $('#avatarNote').classList.toggle('hidden', !(view === 'result' && state.result?.mode === 'avatar'));
  if (view !== 'result') $('#screen').classList.remove('stale');
}

async function generate() {
  if (state.busy) return;
  const prompt = $('#prompt').value.trim();
  if (state.mode !== 'image' && prompt.length < 3) {
    toast(state.mode === 'avatar' ? t('Write what your presenter should say ✍️') : t('Describe your video first ✍️'));
    $('#prompt').focus();
    return;
  }
  if (state.mode === 'image' && !state.images.length) {
    toast(t('Add at least one photo 🖼️'));
    return;
  }
  if (!isSupported()) {
    toast(t('Your browser cannot record video. Please try Chrome, Edge or Safari 17+.'), 5000);
    return;
  }
  const price = cost();
  await refreshCredits();
  if (!state.profile.unlimited && state.profile.credits < price) {
    if (state.profile.guest && cloudEnabled()) {
      toast(t('You\'re out of free credits. Create a free account for {n} more!', { n: CONFIG.SIGNUP_CREDITS }), 4000);
      openAuth('signup');
    } else openPricing();
    return;
  }

  state.busy = true;
  state.abort = new AbortController();
  $('#generateBtn').disabled = true;
  setProgress(0);
  showStage('rendering');
  // Make sure the preview and progress bar are on screen.
  if (window.innerWidth < 900) $('#screen').scrollIntoView({ behavior: 'smooth', block: 'center' });
  else {
    const r = $('#progress').getBoundingClientRect();
    if (r.bottom > innerHeight || r.top < 70) $('#progress').scrollIntoView({ behavior: 'smooth', block: 'end' });
  }

  const job = {
    mode: state.mode,
    prompt,
    style: state.style,
    aspect: state.aspect,
    duration: state.duration,
    music: state.music,
    images: state.images.map((i) => i.bitmap),
    avatar: state.avatar,
    voice: selectedVoice(),
    mood: state.mood,
    logo: state.logo ? await loadLogoBitmap() : null,
    brandMark: !state.profile.unlimited,
  };

  try {
    const provider = getProvider(state.engine);
    const out = await provider.generate(job, {
      canvas: $('#canvas'),
      onProgress: setProgress,
      onStage: setStage,
      signal: state.abort.signal,
    });
    await spendCredits(price, `${state.mode} video`).catch((e) => {
      if (e.message !== 'NO_CREDITS') console.warn(e);
    });
    const meta = {
      id: crypto.randomUUID(),
      title: makeTitle(prompt, state.mode),
      prompt,
      mode: state.mode,
      style: state.style,
      aspect: state.aspect,
      duration: out.duration,
      mime: out.mime,
      ext: out.ext,
      thumb: out.thumb,
      engine: provider.id,
    };
    const item = await saveVideo(meta, out.blob);
    state.result = item;
    const v = $('#resultVideo');
    if (v.src) URL.revokeObjectURL(v.src);
    v.src = URL.createObjectURL(out.blob);
    showStage('result');
    v.play().catch(() => {});
    toast(item.cloud ? t('Done! Saved to your account ✨') : t('Done! Your video is ready ✨'));
    refreshCredits();
    loadGallery();
  } catch (e) {
    if (e.name === 'AbortError') toast(t('Cancelled'));
    else {
      console.error(e);
      toast(t('Something went wrong: ') + (e.message || e), 5000);
    }
    showStage(state.result ? 'result' : 'empty');
  } finally {
    state.busy = false;
    $('#generateBtn').disabled = false;
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  }
}

/* ---------------- Download / share ---------------- */
async function blobFor(item) {
  if (item.blob) return item.blob;
  const local = await localStore.get(item.id);
  if (local?.blob) return local.blob;
  const url = await signedVideoUrl(item);
  const res = await fetch(url);
  return res.blob();
}

async function download(item) {
  try {
    const blob = await blobFor(item);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${slug(item.title)}.${item.ext || 'webm'}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  } catch (e) {
    toast(t('Download failed: ') + e.message);
  }
}

async function share(item) {
  try {
    const blob = await blobFor(item);
    const file = new File([blob], `${slug(item.title)}.${item.ext || 'webm'}`, { type: blob.type });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: item.title, text: t('Made with Stone\'s AI Video ✨') });
      return;
    }
    if (item.cloud && currentUser()) {
      const url = await signedVideoUrl(item, 60 * 60 * 24 * 7);
      await navigator.clipboard.writeText(url);
      toast(t('Share link copied! It works for 7 days 🔗'));
      return;
    }
    await download(item);
    toast(cloudEnabled() ? t('Downloaded. Sign in to get share links.') : t('Downloaded. Share it from your device.'));
  } catch (e) {
    if (e.name !== 'AbortError') toast(t('Could not share: ') + e.message);
  }
}

/* ---------------- Gallery ---------------- */
const MODE_LABEL = { text: 'Text', image: 'Photo', avatar: 'Avatar' };
const STYLE_LABEL = { cinematic: 'Cinematic', anime: 'Anime', '3d': '3D', explainer: 'Explainer' };

async function loadGallery() {
  const local = await localStore.all().catch(() => []);
  const cloud = await listCloudVideos().catch(() => []);
  const ids = new Set(local.map((i) => i.id));
  state.gallery = [...local, ...cloud.filter((c) => !ids.has(c.id))].sort((a, b) => b.createdAt - a.createdAt);
  renderGallery();
}

function renderGallery() {
  const grid = $('#galleryGrid');
  grid.innerHTML = '';
  $('#galleryEmpty').classList.toggle('hidden', state.gallery.length > 0);
  for (const item of state.gallery) {
    const b = document.createElement('button');
    b.className = 'gcard';
    const date = new Date(item.createdAt).toLocaleDateString(getLang() === 'fr' ? 'fr-FR' : undefined, { month: 'short', day: 'numeric' });
    const unsaved = !item.cloud && !!currentUser();
    b.innerHTML = `
      <div class="gthumb">
        <img alt="" loading="lazy">
        <span class="gbadge"></span>
        ${item.cloud ? `<span class="gcloud" title="${esc(t('Saved in the cloud'))}">☁</span>` : ''}
        ${unsaved ? `<span class="gcloud warn">${esc(t('Not backed up'))}</span>` : ''}
        <span class="play">▶</span>
      </div>
      <div class="ginfo"><b></b><span></span></div>`;
    b.querySelector('img').src = item.thumb || '';
    b.querySelector('.gbadge').textContent = `${t(MODE_LABEL[item.mode] || '')} · ${item.aspect}`;
    b.querySelector('.ginfo b').textContent = item.title;
    b.querySelector('.ginfo span').textContent = `${date} · ${Math.round(item.duration || 0)}s · ${t(STYLE_LABEL[item.style] || item.style)}`;
    b.onclick = () => openPlayer(item);
    grid.appendChild(b);
  }
}

async function openPlayer(item) {
  state.playerItem = item;
  const v = $('#playerVideo');
  $('#playerTitle').textContent = item.title;
  $('#playerInfo').textContent = item.prompt || '';
  $('#playerBackup').classList.toggle('hidden', !!item.cloud || !currentUser() || !!item.remoteOnly);
  if (v.src.startsWith('blob:')) URL.revokeObjectURL(v.src);
  v.removeAttribute('src');
  $('#playerModal').showModal();
  try {
    const local = item.blob || (await localStore.get(item.id))?.blob;
    v.src = local ? URL.createObjectURL(local) : await signedVideoUrl(item);
    v.play().catch(() => {});
  } catch (e) {
    toast(t('Could not load this video'));
  }
}

function closePlayer() {
  const v = $('#playerVideo');
  v.pause();
  $('#playerModal').close();
}

/* ---------------- Engine modal ---------------- */
function renderEngines() {
  const list = $('#engineList');
  list.innerHTML = '';
  for (const p of PROVIDERS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'engine' + (p.id === state.engine ? ' active' : '');
    b.disabled = !p.available;
    b.innerHTML = `<div><div class="e-name"></div><div class="e-desc"></div></div><span class="e-tag"></span>`;
    b.querySelector('.e-name').textContent = p.name;
    b.querySelector('.e-desc').textContent = t(p.desc);
    b.querySelector('.e-tag').textContent = p.id === state.engine ? t('Active') : t(p.tag);
    b.onclick = () => {
      state.engine = p.id;
      renderEngines();
    };
    list.appendChild(b);
  }
}

/* ---------------- Templates ---------------- */
const MODE_ICON = { text: '✍️', image: '🖼️', avatar: '🗣️' };
function renderTemplates() {
  const fr = getLang() === 'fr';
  const cats = $('#tplCats');
  cats.innerHTML = '';
  for (const [k, label] of TEMPLATE_CATS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (state.tplCat === k ? ' active' : '');
    b.textContent = t(label);
    b.onclick = () => { state.tplCat = k; renderTemplates(); };
    cats.appendChild(b);
  }
  const grid = $('#inspoGrid');
  grid.innerHTML = '';
  for (const it of TEMPLATES.filter((x) => state.tplCat === 'all' || x.cat === state.tplCat)) {
    const b = document.createElement('button');
    b.className = 'inspo-card';
    b.innerHTML = '<span class="tag"></span><b></b><p></p>';
    b.querySelector('.tag').textContent = `${MODE_ICON[it.mode]} ${t(STYLE_LABEL[it.style])} · ${it.aspect}`;
    b.querySelector('b').textContent = it.name[fr ? 1 : 0];
    b.querySelector('p').textContent = fr ? it.fr : it.en;
    b.onclick = () => {
      setMode(it.mode);
      setStyle(it.style);
      setAspect(it.aspect);
      $('#prompt').value = fr ? it.fr : it.en;
      updateCount();
      $('#create').scrollIntoView({ behavior: 'smooth' });
      if (it.mode === 'image' && !state.images.length) toast(t('Now add your photos 🖼️'));
    };
    grid.appendChild(b);
  }
}

/* ---------------- Logo ---------------- */
let logoBitmap = null;
async function loadLogoBitmap() {
  if (logoBitmap) return logoBitmap;
  const img = new Image();
  img.src = state.logo;
  await img.decode();
  logoBitmap = await createImageBitmap(img);
  return logoBitmap;
}

function renderLogo() {
  $('#logoPreview').classList.toggle('hidden', !state.logo);
  $('#logoRemove').classList.toggle('hidden', !state.logo);
  if (state.logo) $('#logoPreview').src = state.logo;
}

async function setLogo(file) {
  if (!file?.type.startsWith('image/')) return;
  try {
    // Shrink to 256 px so it can be kept on this device.
    const bmp = await createImageBitmap(file);
    const r = Math.min(1, 256 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * r);
    c.height = Math.round(bmp.height * r);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    state.logo = c.toDataURL('image/png');
    logoBitmap = null;
    try { localStorage.setItem(LOGO_KEY, state.logo); } catch { /* storage full or private */ }
    renderLogo();
    markStale();
    toast(t('Logo added. It shows on your next videos.'));
  } catch {
    toast(t('Could not read {name}', { name: file.name }));
  }
}

/* ---------------- Language ---------------- */
function renderLanguage() {
  $('#langBtn').textContent = getLang() === 'fr' ? 'EN' : 'FR';
  $('#langBtn').title = getLang() === 'fr' ? 'Switch to English' : 'Passer en français';
  $('#prompt').placeholder = PLACEHOLDERS[getLang()][state.mode];
  $('#engineNote').textContent = isSupported() ? t('Demo engine: rendered right in your browser, free and private.') : t('⚠️ This browser cannot record video. Please use Chrome, Edge or Safari 17+.');
  updateAuthUI();
  updateCostLabel();
  setAuthMode(authMode);
  renderTemplates();
  renderGallery();
  refreshCreditsLabelOnly();
  updateBrandNote();
  if (state.mode === 'avatar') loadVoices();
}

function refreshCreditsLabelOnly() {
  const p = state.profile;
  const pill = $('#creditsBtn');
  if (p.unlimited) pill.innerHTML = `<span class="coin">◆</span> ${esc(t('Unlimited'))}`;
  else pill.innerHTML = `<span class="coin">◆</span> <span id="creditsValue">${esc(p.credits)}</span> ${esc(t('credits'))}`;
}

async function contactUs() {
  if (!supportNumber) {
    pricingCache = pricingCache || (await getPricing().catch(() => null));
    supportNumber = String(pricingCache?.support_whatsapp || pricingCache?.support_phone || '').replace(/[^0-9]/g, '');
  }
  if (!supportNumber) return toast(t('Contact details are coming soon.'));
  window.open(`https://wa.me/${supportNumber}?text=${encodeURIComponent(t('Hello! I have a question about Stone\'s AI Video.'))}`, '_blank', 'noopener');
}

function updateCount() {
  $('#promptCount').textContent = `${$('#prompt').value.length} / 600`;
}

/* ---------------- Wire up ---------------- */
function bind() {
  $$('.mode-tab').forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
  $$('#styleChips .chip').forEach((b) => (b.onclick = () => setStyle(b.dataset.style)));
  $$('#aspectChips .chip').forEach((b) => (b.onclick = () => setAspect(b.dataset.aspect)));
  $('#duration').oninput = (e) => {
    state.duration = +e.target.value;
    $('#durationLabel').textContent = state.duration + 's';
  };
  $('#musicToggle').onchange = (e) => (state.music = e.target.checked);
  $('#prompt').oninput = () => { updateCount(); markStale(); };
  $('#prompt').onkeydown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generate();
  };
  $('#surpriseBtn').onclick = () => {
    const list = SURPRISE[getLang()][state.mode];
    $('#prompt').value = list[Math.floor(Math.random() * list.length)];
    updateCount();
    markStale();
  };

  // Uploads
  $('#imageInput').onchange = (e) => {
    addImages(e.target.files);
    e.target.value = '';
  };
  const dz = $('#dropzone');
  ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('drag'); }));
  dz.addEventListener('drop', (e) => addImages(e.dataTransfer.files));

  // Voices
  if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = loadVoices;
  $('#voiceSelect').onchange = (e) => {
    state.voiceURI = e.target.value;
    state.voiceManual = true;
  };
  $('#voiceTest').onclick = () => {
    if (!('speechSynthesis' in window)) return toast(t('Voice is not supported in this browser'));
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(t('Hi, I\'m {name}. Ready when you are!', { name: AVATARS[state.avatar].name }));
    const v = selectedVoice();
    if (v) u.voice = v;
    u.pitch = AVATARS[state.avatar].pitch;
    speechSynthesis.speak(u);
  };

  $('#moodSelect').onchange = (e) => { state.mood = e.target.value; markStale(); };
  $('#logoInput').onchange = (e) => { setLogo(e.target.files[0]); e.target.value = ''; };
  $('#logoRemove').onclick = () => {
    state.logo = null;
    logoBitmap = null;
    try { localStorage.removeItem(LOGO_KEY); } catch { /* ignore */ }
    renderLogo();
  };
  $('#langBtn').onclick = () => setLang(getLang() === 'fr' ? 'en' : 'fr');
  $('#firstVideoBtn').onclick = () => {
    $('#create').scrollIntoView({ behavior: 'smooth' });
    $('#prompt').focus({ preventScroll: true });
  };
  $('#contactBtn').onclick = contactUs;
  $('#plansLink').onclick = openPricing;
  $('#generateBtn').onclick = generate;
  $('#cancelBtn').onclick = () => state.abort?.abort();
  $('#downloadBtn').onclick = () => state.result && download(state.result);
  $('#shareBtn').onclick = () => state.result && share(state.result);
  $('#againBtn').onclick = () => {
    showStage('empty');
    $('#prompt').focus();
    $('#create').scrollIntoView({ behavior: 'smooth' });
  };

  // Auth
  $('#authBtn').onclick = () => (currentUser() ? openAccount() : openAuth('signin'));
  $('#authSwitch').onclick = () => setAuthMode(authMode === 'signin' ? 'signup' : 'signin');
  $('#authForm').addEventListener('submit', async (e) => {
    if (e.submitter?.value === 'cancel') return;
    e.preventDefault();
    const email = $('#authEmail').value.trim();
    const pw = $('#authPassword').value;
    const err = $('#authError');
    err.classList.add('hidden');
    $('#authSubmit').disabled = true;
    try {
      if (authMode === 'signup') {
        const { needsConfirm } = await signUp(email, pw);
        if (needsConfirm) {
          err.textContent = t('Check your email to confirm your account, then sign in.');
          err.style.color = 'var(--good)';
          err.classList.remove('hidden');
          setAuthMode('signin');
          err.classList.remove('hidden');
          return;
        }
      } else await signIn(email, pw);
      $('#authModal').close();
      toast(t('Welcome! ✨'));
    } catch (ex) {
      err.style.color = '';
      err.textContent = t(ex.message || 'Something went wrong');
      err.classList.remove('hidden');
    } finally {
      $('#authSubmit').disabled = false;
    }
  });
  $('#forgotBtn').onclick = async () => {
    const email = $('#authEmail').value.trim();
    const err = $('#authError');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      err.style.color = '';
      err.textContent = t('Type your email above first, then tap "Forgot password?".');
      err.classList.remove('hidden');
      $('#authEmail').focus();
      return;
    }
    $('#forgotBtn').disabled = true;
    try {
      await resetPassword(email);
      err.style.color = 'var(--good)';
      err.textContent = t('We sent you an email with a link to choose a new password.');
    } catch (ex) {
      err.style.color = '';
      err.textContent = t(ex.message || 'Something went wrong');
    } finally {
      err.classList.remove('hidden');
      $('#forgotBtn').disabled = false;
    }
  };
  $('#resetForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#resetError');
    err.classList.add('hidden');
    $('#resetSubmit').disabled = true;
    try {
      await updatePassword($('#newPassword').value);
      $('#resetModal').close();
      toast(t('Password saved. You are signed in ✨'));
    } catch (ex) {
      err.textContent = t(ex.message || 'Something went wrong');
      err.classList.remove('hidden');
    } finally {
      $('#resetSubmit').disabled = false;
    }
  });
  $('#playerBackup').onclick = async () => {
    const item = state.playerItem;
    if (!item) return;
    $('#playerBackup').disabled = true;
    try {
      state.playerItem = await backupVideo(item);
      $('#playerBackup').classList.add('hidden');
      toast(t('Saved to your account ✨'));
      loadGallery();
    } catch (e) {
      toast(t('Could not save to the cloud: ') + e.message, 4000);
    } finally {
      $('#playerBackup').disabled = false;
    }
  };
  $('#keyBtn').onclick = activate;
  $('#keyInput').onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      activate();
    }
  };
  $('#signOutBtn').onclick = async () => {
    await signOut();
    $('#accountModal').close();
    toast(t('Signed out'));
  };
  $('#accountBuy').onclick = () => {
    $('#accountModal').close();
    openPricing();
  };
  $('#creditsBtn').onclick = openPricing;
  $('#engineBtn').onclick = () => {
    renderEngines();
    $('#engineModal').showModal();
  };

  // Player
  $('#playerClose').onclick = closePlayer;
  $('#playerModal').addEventListener('close', () => $('#playerVideo').pause());
  $('#playerDownload').onclick = () => state.playerItem && download(state.playerItem);
  $('#playerShare').onclick = () => state.playerItem && share(state.playerItem);
  $('#playerDelete').onclick = async () => {
    const item = state.playerItem;
    if (!item) return;
    if (!confirm(t('Delete this video?'))) return;
    await deleteVideo(item).catch((e) => toast(t('Delete failed: ') + e.message));
    closePlayer();
    loadGallery();
    toast(t('Deleted'));
  };
  // Close dialogs by clicking the backdrop.
  $$('dialog.modal').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));
}

async function main() {
  $('#year').textContent = new Date().getFullYear();
  try { state.logo = localStorage.getItem(LOGO_KEY); } catch { /* private mode */ }
  applyI18n();
  renderAvatarPicker();
  renderTemplates();
  renderLogo();
  bind();
  onLangChange(renderLanguage);
  renderLanguage();
  setMode('text');
  setAspect(state.aspect);
  showStage('empty');
  if (!supabase) $('#authBtn').classList.add('hidden');

  onPasswordRecovery(() => {
    if (!$('#resetModal').open) $('#resetModal').showModal();
  });
  await initAuth().catch((e) => console.warn(e));
  updateAuthUI();
  onAuthChange(() => {
    updateAuthUI();
    refreshCredits();
    loadGallery();
  });
  await refreshCredits();
  await loadGallery();
}

main();
