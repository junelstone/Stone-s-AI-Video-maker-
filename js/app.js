import { CONFIG } from './config.js';
import { PROVIDERS, getProvider, isSupported } from './providers.js';
import { AVATARS, drawAvatarIcon } from './engine/avatar.js';
import { supabase, initAuth, onAuthChange, currentUser, signIn, signUp, signOut, getProfile, spendCredits, cloudEnabled, activateKey, getPricing } from './supabase.js';
import { localStore, saveVideo, listCloudVideos, signedVideoUrl, deleteVideo } from './store.js';

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
};

const PLACEHOLDERS = {
  text: 'A lone astronaut walks across a glowing ocean at sunset. The stars wake up. A new journey begins.',
  image: 'Optional caption, e.g. "Summer in Brazzaville. Good vibes only."',
  avatar: 'Hi everyone! Welcome to my channel. Today I will show you three quick tips to grow your business online. Let\'s go!',
};

const SURPRISE = {
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
};

const INSPO = [
  { tag: 'Cinematic · TikTok', mode: 'text', style: 'cinematic', aspect: '9:16', prompt: 'A lone astronaut walks across a glowing ocean at sunset. The stars wake up. A new journey begins.' },
  { tag: 'Anime · Reels', mode: 'text', style: 'anime', aspect: '9:16', prompt: 'Spring is here! Cherry blossoms fall on the city. Run toward your dreams!' },
  { tag: '3D · YouTube', mode: 'text', style: '3d', aspect: '16:9', prompt: 'Welcome to the future. AI robots build the city of tomorrow. Are you ready?' },
  { tag: 'Explainer · Instagram', mode: 'text', style: 'explainer', aspect: '1:1', prompt: 'Three tips to grow your business. Post every day. Talk to your customers. Track your money.' },
  { tag: 'Talking avatar', mode: 'avatar', style: 'explainer', aspect: '9:16', prompt: SURPRISE.avatar[0] },
  { tag: 'Promo · Instagram post', mode: 'text', style: 'anime', aspect: '4:5', prompt: 'Big sale this weekend! Fifty percent off everything. Gift for every customer!' },
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
  $('#prompt').placeholder = PLACEHOLDERS[mode];
  const c = cost();
  $('#costLabel').textContent = `${c} credit${c > 1 ? 's' : ''}`;
  if (mode === 'avatar') loadVoices();
}

function setChip(group, attr, value) {
  $$(`#${group} .chip`).forEach((b) => b.classList.toggle('active', b.dataset[attr] === value));
}

function setStyle(style) {
  state.style = style;
  setChip('styleChips', 'style', style);
}

function setAspect(aspect) {
  state.aspect = aspect;
  setChip('aspectChips', 'aspect', aspect);
  $('#screen').dataset.aspect = aspect;
}

/* ---------------- Images ---------------- */
async function addImages(files) {
  const list = [...files].filter((f) => f.type.startsWith('image/'));
  for (const file of list) {
    if (state.images.length >= 6) {
      toast('Up to 6 photos per video');
      break;
    }
    try {
      const bitmap = await createImageBitmap(file);
      state.images.push({ file, bitmap, url: URL.createObjectURL(file) });
    } catch {
      toast(`Could not read ${file.name}`);
    }
  }
  renderThumbs();
}

function renderThumbs() {
  const wrap = $('#thumbs');
  wrap.innerHTML = '';
  state.images.forEach((img, i) => {
    const d = document.createElement('div');
    d.className = 'thumb';
    d.innerHTML = `<img alt="Upload ${i + 1}" src="${img.url}"><button type="button" aria-label="Remove">✕</button>`;
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
    };
    wrap.appendChild(b);
  }
}

function voices() {
  return 'speechSynthesis' in window ? speechSynthesis.getVoices() : [];
}

function loadVoices() {
  const sel = $('#voiceSelect');
  const list = voices();
  if (!list.length) {
    sel.innerHTML = '<option>Default voice</option>';
    return;
  }
  const sorted = [...list].sort((a, b) => (b.lang.startsWith('en') - a.lang.startsWith('en')) || a.name.localeCompare(b.name));
  sel.innerHTML = sorted.map((v) => `<option value="${v.voiceURI}">${v.name} (${v.lang})</option>`).join('');
  if (state.voiceURI && sorted.some((v) => v.voiceURI === state.voiceURI)) sel.value = state.voiceURI;
  else state.voiceURI = sel.value;
}

function selectedVoice() {
  return voices().find((v) => v.voiceURI === state.voiceURI) || null;
}

/* ---------------- Credits & auth UI ---------------- */
async function refreshCredits() {
  state.profile = await getProfile();
  const pill = $('#creditsBtn');
  if (state.profile.unlimited) {
    pill.innerHTML = '<span class="coin">◆</span> Unlimited';
    pill.title = `${state.profile.sub.name} subscription`;
  } else {
    pill.innerHTML = '<span class="coin">◆</span> <span id="creditsValue"></span> credits';
    $('#creditsValue').textContent = state.profile.credits;
    pill.title = 'Your credits';
  }
}

function updateAuthUI() {
  const u = currentUser();
  $('#authBtn').textContent = u ? 'My account' : 'Sign in';
  $('#galleryNote').textContent = u ? 'Saved to your account' : 'Saved on this device. Sign in to keep them in the cloud.';
}

let authMode = 'signin';
function setAuthMode(mode) {
  authMode = mode;
  const up = mode === 'signup';
  $('#authTitle').textContent = up ? 'Create your account' : 'Welcome back';
  $('#authSub').textContent = up
    ? `Free account with ${CONFIG.SIGNUP_CREDITS} credits. Your videos are saved to the cloud.`
    : 'Sign in to save your videos to the cloud and use your credits.';
  $('#authSubmit').textContent = up ? 'Create account' : 'Sign in';
  $('#authSwitchText').textContent = up ? 'Already have an account?' : 'New here?';
  $('#authSwitch').textContent = up ? 'Sign in' : 'Create an account';
  $('#authPassword').autocomplete = up ? 'new-password' : 'current-password';
  $('#authError').classList.add('hidden');
}

function openAuth(mode = 'signin') {
  if (!cloudEnabled()) {
    toast('Accounts are not set up yet. You can still create videos as a guest.');
    return;
  }
  setAuthMode(mode);
  $('#authModal').showModal();
}

async function openAccount() {
  const u = currentUser();
  $('#accountEmail').textContent = u.email;
  $('#accountCredits').textContent = state.profile.credits;
  $('#accountPlan').textContent = (state.profile.plan || 'free').replace(/^./, (c) => c.toUpperCase());
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
  const until = new Date(sub.expires_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  box.classList.toggle('ended', !sub.open);
  box.innerHTML = '<b></b><span></span>';
  box.querySelector('b').textContent = `${TIER_NAMES[sub.tier] || 'Pro'} subscription · ${sub.name}`;
  box.querySelector('span').textContent = sub.open
    ? `Unlimited videos until ${until}.`
    : `Ended on ${until}. Renew it to get unlimited videos again.`;
  if (sub.open) $('#accountPlan').textContent = TIER_NAMES[sub.tier] || 'Pro';
}

async function activate() {
  const key = $('#keyInput').value.trim();
  const err = $('#keyError');
  err.classList.add('hidden');
  if (key.length < 8) {
    err.textContent = 'Type the full key, like SAV-7KQ2-M9XD-4TPA.';
    err.classList.remove('hidden');
    return;
  }
  $('#keyBtn').disabled = true;
  try {
    await activateKey(key);
    await refreshCredits();
    renderSubscription();
    $('#accountPlan').textContent = TIER_NAMES[state.profile.sub?.tier] || 'Pro';
    toast('Activated! Enjoy unlimited videos ✨');
  } catch (e) {
    err.textContent = e.message || 'Could not activate this key';
    err.classList.remove('hidden');
  } finally {
    $('#keyBtn').disabled = false;
  }
}

/* ---------------- Plans & credits ---------------- */
let pricingCache = null;
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
  const link = (what) => `https://wa.me/${wa}?text=${encodeURIComponent(`Hello! I want ${what} on Stone's AI Video.${email ? ` My account email: ${email}.` : ''} I paid by mobile money, transaction ID: `)}`;
  const choose = (what, primary) => wa
    ? `<a class="btn ${primary ? 'btn-primary' : 'btn-ghost'} btn-choose" target="_blank" rel="noopener" href="${esc(link(what))}">Choose</a>`
    : '';

  const plans = [
    { name: 'Weekly pass', amt: weekly, per: 'week', meta: '1 user · try it for a campaign', what: `the Weekly pass (${fcfa(weekly, cur)})` },
    ...tiers.map((t) => ({
      name: t.name, amt: t.monthly, per: 'month', featured: t.k === 'pro',
      meta: `${t.users} user${t.users > 1 ? 's' : ''} · or ${fcfa(t.yearly, cur)} a year`,
      what: `the ${t.name} plan (${fcfa(t.monthly, cur)} per month or ${fcfa(t.yearly, cur)} per year)`,
    })),
  ];
  $('#plansGrid').innerHTML = plans.map((p) => `
    <div class="plan${p.featured ? ' featured' : ''}">
      ${p.featured ? '<span class="badge">Most popular</span>' : ''}
      <b>${esc(p.name)}</b>
      <span class="amt">${esc(fcfa(p.amt, cur))} <small>/ ${p.per}</small></span>
      <span class="meta">Unlimited videos · ${esc(p.meta)}</span>
      ${choose(p.what, p.featured)}
    </div>`).join('');

  $('#packsGrid').innerHTML = P.packs.map((k) => `
    <div class="pack${k.best ? ' featured' : ''}">
      ${k.best ? '<span class="badge">Best value</span>' : ''}
      <span class="big">${k.credits}</span><span>credits</span>
      <span class="price">${esc(fcfa(k.price, cur))}</span>
      ${choose(`${k.credits} credits (${fcfa(k.price, cur)})`, k.best)}
    </div>`).join('');

  $('#howPay').innerHTML = wa
    ? `<b>How to pay</b><ol>
        <li>Send the amount by ${esc(P.payMethods)} to <b>+${esc(wa)}</b>.</li>
        <li>Tap <b>Choose</b> to send us the transaction ID on WhatsApp${email ? '' : ' (sign in first so we know your account)'}.</li>
        <li>We add your credits or send your activation key the same day. Enter the key in <b>My account</b>.</li>
      </ol>`
    : `<b>How to pay</b><p class="small">Pay by ${esc(P.payMethods)}. Payment details are coming soon, contact us to subscribe.</p>`;
}

/* ---------------- Generate ---------------- */
function slug(s) {
  return (s || 'video').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'video';
}

function makeTitle(prompt, mode) {
  const words = prompt.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return mode === 'image' ? 'Photo animation' : 'My video';
  const t = words.slice(0, 6).join(' ').replace(/[.,!?;:]+$/, '');
  return words.length > 6 ? t + '…' : t;
}

function setProgress(p) {
  const pct = Math.round(p * 100);
  $('#progressFill').style.width = pct + '%';
  $('#progressPct').textContent = pct + '%';
}

function setStage(step, label) {
  $('#progressStage').textContent = label;
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
}

async function generate() {
  if (state.busy) return;
  const prompt = $('#prompt').value.trim();
  if (state.mode !== 'image' && prompt.length < 3) {
    toast(state.mode === 'avatar' ? 'Write what your presenter should say ✍️' : 'Describe your video first ✍️');
    $('#prompt').focus();
    return;
  }
  if (state.mode === 'image' && !state.images.length) {
    toast('Add at least one photo 🖼️');
    return;
  }
  if (!isSupported()) {
    toast('Your browser cannot record video. Please try Chrome, Edge or Safari 17+.', 5000);
    return;
  }
  const price = cost();
  await refreshCredits();
  if (!state.profile.unlimited && state.profile.credits < price) {
    if (state.profile.guest && cloudEnabled()) {
      toast(`You're out of free credits. Create a free account for ${CONFIG.SIGNUP_CREDITS} more!`, 4000);
      openAuth('signup');
    } else openPricing();
    return;
  }

  state.busy = true;
  state.abort = new AbortController();
  $('#generateBtn').disabled = true;
  setProgress(0);
  showStage('rendering');
  if (window.innerWidth < 900) $('#screen').scrollIntoView({ behavior: 'smooth', block: 'center' });

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
    toast(item.cloud ? 'Done! Saved to your account ✨' : 'Done! Your video is ready ✨');
    refreshCredits();
    loadGallery();
  } catch (e) {
    if (e.name === 'AbortError') toast('Cancelled');
    else {
      console.error(e);
      toast('Something went wrong: ' + (e.message || e), 5000);
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
    toast('Download failed: ' + e.message);
  }
}

async function share(item) {
  try {
    const blob = await blobFor(item);
    const file = new File([blob], `${slug(item.title)}.${item.ext || 'webm'}`, { type: blob.type });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: item.title, text: 'Made with Stone\'s AI Video ✨' });
      return;
    }
    if (item.cloud && currentUser()) {
      const url = await signedVideoUrl(item, 60 * 60 * 24 * 7);
      await navigator.clipboard.writeText(url);
      toast('Share link copied! It works for 7 days 🔗');
      return;
    }
    await download(item);
    toast(cloudEnabled() ? 'Downloaded. Sign in to get share links.' : 'Downloaded. Share it from your device.');
  } catch (e) {
    if (e.name !== 'AbortError') toast('Could not share: ' + e.message);
  }
}

/* ---------------- Gallery ---------------- */
const MODE_LABEL = { text: 'Text', image: 'Photo', avatar: 'Avatar' };

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
    const date = new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    b.innerHTML = `
      <div class="gthumb">
        <img alt="" loading="lazy">
        <span class="gbadge"></span>
        ${item.cloud ? '<span class="gcloud" title="Saved in the cloud">☁</span>' : ''}
        <span class="play">▶</span>
      </div>
      <div class="ginfo"><b></b><span></span></div>`;
    b.querySelector('img').src = item.thumb || '';
    b.querySelector('.gbadge').textContent = `${MODE_LABEL[item.mode] || ''} · ${item.aspect}`;
    b.querySelector('.ginfo b').textContent = item.title;
    b.querySelector('.ginfo span').textContent = `${date} · ${Math.round(item.duration || 0)}s · ${item.style}`;
    b.onclick = () => openPlayer(item);
    grid.appendChild(b);
  }
}

async function openPlayer(item) {
  state.playerItem = item;
  const v = $('#playerVideo');
  $('#playerTitle').textContent = item.title;
  $('#playerInfo').textContent = item.prompt || '';
  if (v.src.startsWith('blob:')) URL.revokeObjectURL(v.src);
  v.removeAttribute('src');
  $('#playerModal').showModal();
  try {
    const local = item.blob || (await localStore.get(item.id))?.blob;
    v.src = local ? URL.createObjectURL(local) : await signedVideoUrl(item);
    v.play().catch(() => {});
  } catch (e) {
    toast('Could not load this video');
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
    b.querySelector('.e-desc').textContent = p.desc;
    b.querySelector('.e-tag').textContent = p.id === state.engine ? 'Active' : p.tag;
    b.onclick = () => {
      state.engine = p.id;
      renderEngines();
    };
    list.appendChild(b);
  }
}

/* ---------------- Inspiration ---------------- */
function renderInspo() {
  const grid = $('#inspoGrid');
  for (const it of INSPO) {
    const b = document.createElement('button');
    b.className = 'inspo-card';
    b.innerHTML = '<span class="tag"></span><p></p>';
    b.querySelector('.tag').textContent = it.tag;
    b.querySelector('p').textContent = it.prompt;
    b.onclick = () => {
      setMode(it.mode);
      setStyle(it.style);
      setAspect(it.aspect);
      $('#prompt').value = it.prompt;
      updateCount();
      $('#create').scrollIntoView({ behavior: 'smooth' });
    };
    grid.appendChild(b);
  }
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
  $('#prompt').oninput = updateCount;
  $('#prompt').onkeydown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generate();
  };
  $('#surpriseBtn').onclick = () => {
    const list = SURPRISE[state.mode];
    $('#prompt').value = list[Math.floor(Math.random() * list.length)];
    updateCount();
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
  $('#voiceSelect').onchange = (e) => (state.voiceURI = e.target.value);
  $('#voiceTest').onclick = () => {
    if (!('speechSynthesis' in window)) return toast('Voice is not supported in this browser');
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(`Hi, I'm ${AVATARS[state.avatar].name}. Ready when you are!`);
    const v = selectedVoice();
    if (v) u.voice = v;
    u.pitch = AVATARS[state.avatar].pitch;
    speechSynthesis.speak(u);
  };

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
          err.textContent = 'Check your email to confirm your account, then sign in.';
          err.style.color = 'var(--good)';
          err.classList.remove('hidden');
          setAuthMode('signin');
          err.classList.remove('hidden');
          return;
        }
      } else await signIn(email, pw);
      $('#authModal').close();
      toast('Welcome! ✨');
    } catch (ex) {
      err.style.color = '';
      err.textContent = ex.message || 'Something went wrong';
      err.classList.remove('hidden');
    } finally {
      $('#authSubmit').disabled = false;
    }
  });
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
    toast('Signed out');
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
    if (!confirm('Delete this video?')) return;
    await deleteVideo(item).catch((e) => toast('Delete failed: ' + e.message));
    closePlayer();
    loadGallery();
    toast('Deleted');
  };
  // Close dialogs by clicking the backdrop.
  $$('dialog.modal').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));
}

async function main() {
  $('#year').textContent = new Date().getFullYear();
  renderAvatarPicker();
  renderInspo();
  bind();
  setMode('text');
  setAspect(state.aspect);
  showStage('empty');
  if (!isSupported()) $('#engineNote').textContent = '⚠️ This browser cannot record video. Please use Chrome, Edge or Safari 17+.';
  if (!supabase) $('#authBtn').classList.add('hidden');

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
