// Supabase client, sign-in and credits.
import { CONFIG } from './config.js';

let createClient = null;
try {
  ({ createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm'));
} catch (e) {
  console.warn('Supabase library could not load, running in guest mode', e);
}

export const supabase = createClient && CONFIG.SUPABASE_URL && CONFIG.SUPABASE_KEY
  ? createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;

let user = null;
const listeners = new Set();

export const currentUser = () => user;
export const cloudEnabled = () => !!supabase;

export function onAuthChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) fn(user);
}

export async function initAuth() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  user = data.session?.user || null;
  supabase.auth.onAuthStateChange((_event, session) => {
    const next = session?.user || null;
    if (next?.id !== user?.id) {
      user = next;
      emit();
    }
  });
  return user;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  user = data.user;
  emit();
  return user;
}

export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: location.origin } });
  if (error) throw error;
  if (data.session) {
    user = data.user;
    emit();
  }
  return { user: data.user, needsConfirm: !data.session };
}

export async function signOut() {
  await supabase?.auth.signOut();
  user = null;
  emit();
}

/* ---------- Credits ---------- */
const GUEST_KEY = 'stoneai.guestCredits';

function guestCredits() {
  try {
    const v = localStorage.getItem(GUEST_KEY);
    return v === null ? CONFIG.GUEST_CREDITS : Math.max(0, parseInt(v, 10) || 0);
  } catch {
    return CONFIG.GUEST_CREDITS;
  }
}

export async function getProfile() {
  if (!user || !supabase) return { credits: guestCredits(), plan: 'guest', guest: true };
  const [{ data, error }, sub] = await Promise.all([
    supabase.from('profiles').select('credits, plan').eq('id', user.id).maybeSingle(),
    supabase.rpc('my_subscription').then((r) => r.data || null, () => null),
  ]);
  if (error || !data) {
    console.warn('Profile not found', error);
    return { credits: guestCredits(), plan: 'free', missing: true, sub };
  }
  return { ...data, sub, unlimited: !!sub?.open };
}

// Join a subscription with the activation key the admin sent.
export async function activateKey(key) {
  const { data, error } = await supabase.rpc('activate_tenant', { p_key: key.trim(), p_name: '' });
  if (error) throw error;
  return data;
}

// Returns the new balance, or throws if there are not enough credits.
export async function spendCredits(amount, reason) {
  if (!user || !supabase) {
    const left = guestCredits();
    if (left < amount) throw new Error('NO_CREDITS');
    try { localStorage.setItem(GUEST_KEY, String(left - amount)); } catch { /* private mode */ }
    return left - amount;
  }
  const { data, error } = await supabase.rpc('spend_credits', { amount, reason });
  if (error) {
    if (/not enough credits/i.test(error.message)) throw new Error('NO_CREDITS');
    throw error;
  }
  return data;
}

// Public prices and support contact from the admin page settings.
export async function getPricing() {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('public_pricing');
  return error ? null : data;
}
