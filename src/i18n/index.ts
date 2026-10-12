import { createElement, Fragment, useSyncExternalStore, type ReactNode } from 'react';
import { flushPrefs, onPrefPulled, prefChanged } from '@/lib/prefsBus';
import en from './locales/en.json';

/**
 * Interface text.
 *
 * Text lives in one file per language under ./locales, named after the language ("de.json",
 * "pt-BR.json"). English is the reference: it has every key, is part of the main bundle, and fills
 * in for whatever another language has not translated yet. Other languages are loaded when chosen.
 *
 * Anywhere:   import { t } from '@/i18n';   t('login.signIn')   t('userMenu.switchTo', { name })
 *
 * The language is loaded before the rest of the app (see main.tsx), and changing it reloads the
 * page. So `t` can be called anywhere, also where a module sets up its constants, and no text is
 * left behind in the old language.
 *
 * A text with a singular and a plural is an object of plural forms ("one", "other", and whichever
 * else the language has) and takes a `count`:   t('settings.language.count', { count: 3 })
 *
 * To add a language, add its file. Nothing else needs to change: it appears under Account settings.
 */
type Plural = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };
type Node = string | Plural | { [key: string]: Node };
type Catalogue = { [key: string]: Node };

/** "login.signIn" | "settings.language.count" | … : every text in the English file. */
type Keys<T> = {
  [K in keyof T & string]: T[K] extends string ? K : T[K] extends { other: string } ? K : `${K}.${Keys<T[K]>}`;
}[keyof T & string];
export type MessageKey = Keys<typeof en>;
/** Values for the {placeholders} of a text. One that is missing (null or undefined) leaves nothing behind. */
export type Vars = Record<string, string | number | null | undefined>;

export const FALLBACK = 'en';
const KEY = 'jellyfied.language';

const loaders = import.meta.glob<{ default: Catalogue }>(['./locales/*.json', '!./locales/en.json']);
const codeOf = (path: string) => path.slice(path.lastIndexOf('/') + 1, -'.json'.length);
/** The languages Jellyfied has text for. */
export const LANGUAGES: string[] = [FALLBACK, ...Object.keys(loaders).map(codeOf)].sort();

/** A language's own name for itself: "Deutsch", "Norsk bokmål". */
export function languageName(code: string): string {
  try {
    const name = new Intl.DisplayNames([code], { type: 'language' }).of(code);
    return name ? name.charAt(0).toLocaleUpperCase(code) + name.slice(1) : code;
  } catch {
    return code;
  }
}

/** Browsers set to plain "Norwegian" mean Bokmål. */
const ALIASES: Record<string, string> = { no: 'nb' };

/**
 * The best available language for a list of wanted ones, or English. "nb-NO" is served by "nb",
 * and a language that only exists for another region is still that language: "es-MX" gets "es-ES".
 */
export function matchLanguage(wanted: readonly string[], available: readonly string[] = LANGUAGES): string {
  for (const want of wanted) {
    const lower = want.toLowerCase();
    const exact = available.find((a) => a.toLowerCase() === lower);
    if (exact) return exact;
    const base = lower.split('-')[0];
    const language = ALIASES[base] ?? base;
    const match = available.find((a) => a.toLowerCase() === language) ?? available.find((a) => a.toLowerCase().split('-')[0] === language);
    if (match) return match;
  }
  return FALLBACK;
}

function lookup(catalogue: Catalogue, key: string): Node | undefined {
  let node: Node | undefined = catalogue;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as { [key: string]: Node })[part];
  }
  return node;
}

/** One text from a catalogue with its {placeholders} filled in, or undefined if it is not there. */
export function format(catalogue: Catalogue, language: string, key: string, vars: Vars = {}): string | undefined {
  let node = lookup(catalogue, key);
  if (node && typeof node === 'object' && 'other' in node && typeof node.other === 'string') {
    const forms = node as Plural;
    const rule = typeof vars.count === 'number' ? new Intl.PluralRules(language).select(vars.count) : 'other';
    node = forms[rule] ?? forms.other;
  }
  if (typeof node !== 'string') return undefined;
  return node.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name] ?? '') : whole));
}

function stored(): string | null {
  try {
    const value = localStorage.getItem(KEY);
    return value && LANGUAGES.includes(value) ? value : null;
  } catch {
    return null;
  }
}

const browserLanguages = () => (typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language]));

/** What the user picked, or null for "same as the browser". */
let choice = stored();
let language = FALLBACK;
let messages: Catalogue = en;
const wanted = () => choice ?? matchLanguage(browserLanguages());

async function load() {
  const next = wanted();
  let catalogue: Catalogue = en;
  if (next !== FALLBACK) {
    const path = Object.keys(loaders).find((p) => codeOf(p) === next);
    try {
      if (path) catalogue = (await loaders[path]()).default;
    } catch {
      /* the file could not be fetched: English it is */
    }
  }
  language = next;
  messages = catalogue;
  if (typeof document !== 'undefined') document.documentElement.lang = next;
}

/** Loads the language to start with. main.tsx waits for it before it loads the app. */
export const ready: Promise<void> = load();

/** Starts over in the language that is wanted now, if that is another one than the page was loaded in. */
function restartIfChanged() {
  if (wanted() === language || typeof window === 'undefined') return;
  // The choice is sent to the account first; otherwise the reloaded page would get the old one back from it.
  void Promise.race([flushPrefs(), new Promise((resolve) => setTimeout(resolve, 3000))]).finally(() => window.location.reload());
}

export function setLanguage(code: string | null) {
  choice = code && LANGUAGES.includes(code) ? code : null;
  try {
    if (choice) localStorage.setItem(KEY, choice);
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  prefChanged(KEY);
  listeners.forEach((l) => l());
  restartIfChanged();
}

onPrefPulled(KEY, () => {
  choice = stored();
  listeners.forEach((l) => l());
  restartIfChanged();
});

const listeners = new Set<() => void>();

/** The language in use, and the one the browser asked for (for the "same as the browser" option). */
export const currentLanguage = () => language;
export const chosenLanguage = () => choice;
export const browserLanguage = () => matchLanguage(browserLanguages());

export function t(key: MessageKey, vars?: Vars): string {
  return format(messages, language, key, vars) ?? format(en, FALLBACK, key, vars) ?? key;
}

/**
 * A text with something other than text in it, such as a name in bold: the values of its
 * {placeholders} may be elements. The sentence stays whole in the language file, so a translation
 * can put the name wherever its grammar wants it.
 *
 *   tRich('admin.userEdit.deleteConfirm', { name: <strong>{user.Name}</strong> })
 */
export function tRich(key: MessageKey, vars: Record<string, ReactNode>): ReactNode {
  const marks: Vars = {};
  for (const name of Object.keys(vars)) marks[name] = `\u0000${name}\u0000`;
  return t(key, marks)
    .split('\u0000')
    .map((part, i) => (i % 2 ? createElement(Fragment, { key: i }, vars[part]) : part));
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** `t`, for code that was written with a hook. The same function as the plain import. */
export function useT(): typeof t {
  return t;
}

/** What the user chose (null for "same as the browser"); renders again when the choice changes. */
export function useLanguageChoice(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => choice,
    () => null,
  );
}
