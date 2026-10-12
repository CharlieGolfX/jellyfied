import { describe, expect, it } from 'vitest';
import { format, languageName, matchLanguage, t, tRich } from './index';
import en from './locales/en.json';

const catalogue = {
  greeting: 'Hello {name}',
  nested: { deep: 'Deep' },
  items: { one: '{count} item', other: '{count} items' },
};

describe('format', () => {
  it('finds a text by its path and fills in the placeholders', () => {
    expect(format(catalogue, 'en', 'nested.deep')).toBe('Deep');
    expect(format(catalogue, 'en', 'greeting', { name: 'Ada' })).toBe('Hello Ada');
  });

  it('leaves a placeholder alone when it was given no value', () => {
    expect(format(catalogue, 'en', 'greeting')).toBe('Hello {name}');
  });

  it('picks the plural form for the count', () => {
    expect(format(catalogue, 'en', 'items', { count: 1 })).toBe('1 item');
    expect(format(catalogue, 'en', 'items', { count: 4 })).toBe('4 items');
  });

  it('is undefined for a text that is not there, or is a group', () => {
    expect(format(catalogue, 'en', 'missing.key')).toBeUndefined();
    expect(format(catalogue, 'en', 'nested')).toBeUndefined();
  });
});

describe('t', () => {
  it('reads the English file', () => {
    expect(t('login.signIn')).toBe('Sign in');
    expect(t('userMenu.switchTo', { name: 'Ada' })).toBe('Switch to Ada');
    expect(t('settings.language.count', { count: 1 })).toBe('1 language is available.');
  });
});

describe('tRich', () => {
  it('puts an element where its placeholder is and keeps the sentence around it', () => {
    const parts = tRich('admin.userEdit.deleteConfirm', { name: 'ADA' }) as unknown[];
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe('Delete ');
    expect((parts[1] as { props: { children: unknown } }).props.children).toBe('ADA');
    expect(String(parts[2])).toContain('watch history');
  });
});

describe('matchLanguage', () => {
  const available = ['de', 'en', 'nb', 'pt-BR'];

  it('prefers an exact match, then the language without its region', () => {
    expect(matchLanguage(['pt-BR', 'en'], available)).toBe('pt-BR');
    expect(matchLanguage(['nb-NO', 'en'], available)).toBe('nb');
    expect(matchLanguage(['DE-at'], available)).toBe('de');
  });

  it('serves a language that only exists for another region, and plain Norwegian with Bokmål', () => {
    expect(matchLanguage(['es-MX'], ['en', 'es-ES', 'nb'])).toBe('es-ES');
    expect(matchLanguage(['es'], ['en', 'es-ES', 'nb'])).toBe('es-ES');
    expect(matchLanguage(['no'], ['en', 'es-ES', 'nb'])).toBe('nb');
    expect(matchLanguage(['nn-NO', 'no-NO'], ['en', 'es-ES', 'nb'])).toBe('nb');
  });

  it('takes the first wanted language there is text for, or English', () => {
    expect(matchLanguage(['fr', 'de'], available)).toBe('de');
    expect(matchLanguage(['fr'], available)).toBe('en');
    expect(matchLanguage([], available)).toBe('en');
  });
});

describe('languageName', () => {
  it('names a language in that language', () => {
    expect(languageName('en')).toBe('English');
    expect(languageName('de')).toBe('Deutsch');
    expect(languageName('nb')).toBe('Norsk bokmål');
    expect(languageName('es-ES')).toMatch(/^Español/);
  });
});

/** Every text of a catalogue as "path" → the placeholders it uses. */
function texts(node: unknown, path = '', out = new Map<string, string[]>()): Map<string, string[]> {
  if (typeof node === 'string') out.set(path, [...node.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort());
  else if (node && typeof node === 'object') {
    const group = node as Record<string, unknown>;
    // The forms of a plural are one text.
    if (typeof group.other === 'string') texts(group.other, path, out);
    else for (const [key, value] of Object.entries(group)) texts(value, path ? `${path}.${key}` : key, out);
  }
  return out;
}

describe('the language files', () => {
  const files = import.meta.glob<{ default: unknown }>('./locales/*.json', { eager: true });
  const reference = texts(en);
  const others = Object.keys(files).filter((path) => !path.endsWith('/en.json'));

  it('English has no empty texts', () => {
    expect(reference.size).toBeGreaterThan(0);
    expect(JSON.stringify(en)).not.toContain('""');
  });

  it('there are translations', () => {
    expect(others.map((path) => path.slice(path.lastIndexOf('/') + 1))).toEqual(['es-ES.json', 'nb.json']);
  });

  it('the translations have every text English has, and none are empty', () => {
    for (const path of others) {
      const translated = texts(files[path].default);
      expect(
        [...reference.keys()].filter((key) => !translated.has(key)),
        `${path}: texts that are missing`,
      ).toEqual([]);
      expect(JSON.stringify(files[path].default), `${path}: empty texts`).not.toContain('""');
    }
  });

  it('a plural has the forms its language needs', () => {
    const forms = (node: unknown, path: string, language: string, missing: string[]) => {
      if (!node || typeof node !== 'object') return;
      const group = node as Record<string, unknown>;
      if (typeof group.other === 'string') {
        // Only the forms whole numbers can select: "many" in Spanish is for millions, which nothing here counts.
        for (const n of [0, 1, 2, 5, 21, 100]) {
          const rule = new Intl.PluralRules(language).select(n);
          if (!(rule in group)) missing.push(`${path} (${rule})`);
        }
      } else for (const [key, value] of Object.entries(group)) forms(value, path ? `${path}.${key}` : key, language, missing);
    };
    for (const path of Object.keys(files)) {
      const missing: string[] = [];
      forms(files[path].default, '', path.slice(path.lastIndexOf('/') + 1, -'.json'.length), missing);
      expect([...new Set(missing)], `${path}: plural forms that are missing`).toEqual([]);
    }
  });

  it('other languages only have texts English has, with the same placeholders', () => {
    for (const path of others) {
      for (const [key, placeholders] of texts(files[path].default)) {
        expect(reference.has(key), `${path}: "${key}" is not in en.json`).toBe(true);
        expect(placeholders, `${path}: placeholders of "${key}"`).toEqual(reference.get(key));
      }
    }
  });
});
