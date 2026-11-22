// English / French. English text is the key; FR holds the French version.
// In the page: data-i18n (plain text), data-i18n-html="key" (text with markup).
import { FR, FR_HTML } from './i18n-fr.js';

const KEY = 'stoneai.lang';
let lang = (() => {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'fr' || saved === 'en') return saved;
  } catch { /* private mode */ }
  return (navigator.language || '').toLowerCase().startsWith('fr') ? 'fr' : 'en';
})();

const listeners = new Set();
export const getLang = () => lang;
export const onLangChange = (fn) => listeners.add(fn);

export function setLang(l) {
  lang = l === 'fr' ? 'fr' : 'en';
  try { localStorage.setItem(KEY, lang); } catch { /* private mode */ }
  applyI18n();
  listeners.forEach((fn) => fn(lang));
}

// t('Hello {name}', { name }) → translated text with values filled in.
export function t(s, vars) {
  let out = (lang === 'fr' && FR[s]) || s;
  if (vars) out = out.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  return out;
}

// Plural helper: tn(n, 'credit', 'credits')
export const tn = (n, one, many) => `${n} ${t(n === 1 ? one : many)}`;

export function applyI18n(root = document) {
  document.documentElement.lang = lang;
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    if (el.dataset.i18nKey === undefined) el.dataset.i18nKey = el.textContent.trim();
    el.textContent = t(el.dataset.i18nKey);
  });
  root.querySelectorAll('[data-i18n-html]').forEach((el) => {
    const k = el.dataset.i18nHtml;
    if (el.dataset.i18nEn === undefined) el.dataset.i18nEn = el.innerHTML;
    el.innerHTML = lang === 'fr' && FR_HTML[k] ? FR_HTML[k] : el.dataset.i18nEn;
  });
}
