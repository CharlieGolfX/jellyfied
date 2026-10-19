import clsx from 'clsx';
import { Check } from 'lucide-react';
import { t } from '@/i18n';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ACCENT_PRESETS, BACKGROUNDS, backgroundSwatch, DEFAULT_THEME, useTheme } from '@/lib/theme';

export function InterfaceColorsCard() {
  const [theme, setTheme] = useTheme();
  const customAccent = !ACCENT_PRESETS.some((p) => p.value === theme.accent);
  const changed = theme.accent !== DEFAULT_THEME.accent || theme.background !== DEFAULT_THEME.background;
  return (
    <Card
      title={t('settings.interfaceColours')}
      description={t('settings.themeHint')}
      actions={
        changed ? (
          <Button size="sm" variant="ghost" onClick={() => setTheme(DEFAULT_THEME)}>
            {t('common.reset')}
          </Button>
        ) : undefined
      }
    >
      <div className="text-sm font-medium text-fg">{t('settings.accentColour')}</div>
      <div className="mt-2 flex flex-wrap items-center gap-2.5" role="radiogroup" aria-label={t('settings.accentColour')}>
        {ACCENT_PRESETS.map((p) => (
          <button
            key={p.value}
            type="button"
            role="radio"
            aria-checked={theme.accent === p.value}
            aria-label={p.label}
            title={p.label}
            onClick={() => setTheme({ accent: p.value })}
            className={clsx(
              'flex h-9 w-9 items-center justify-center rounded-full ring-offset-2 ring-offset-base-800 transition-shadow',
              theme.accent === p.value ? 'ring-2 ring-white' : 'hover:ring-2 hover:ring-white/40',
            )}
            style={{ backgroundColor: p.value }}
          >
            {theme.accent === p.value && <Check size={18} className="text-accent-ink" />}
          </button>
        ))}
        <label
          title={t('settings.customColour')}
          className={clsx(
            'relative flex h-9 items-center gap-2 rounded-full bg-white/10 pr-3 pl-1.5 text-sm ring-offset-2 ring-offset-base-800 hover:bg-white/15',
            customAccent && 'ring-2 ring-white',
          )}
        >
          <span
            className="h-6 w-6 rounded-full ring-1 ring-white/20"
            style={{ background: customAccent ? theme.accent : 'conic-gradient(#e5484d, #e5a00d, #3dbb6b, #00a4dc, #aa5cc3, #e5484d)' }}
          />
          {t('settings.custom')}
          <input
            type="color"
            aria-label={t('settings.customAccentColour')}
            value={theme.accent}
            onChange={(e) => setTheme({ accent: e.target.value.toLowerCase() })}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
      </div>

      <div className="mt-6 text-sm font-medium text-fg">{t('settings.background')}</div>
      <div className="mt-2 grid grid-cols-2 gap-2.5 sm:grid-cols-3" role="radiogroup" aria-label={t('settings.background')}>
        {BACKGROUNDS.map((b) => (
          <button
            key={b.value}
            type="button"
            role="radio"
            aria-checked={theme.background === b.value}
            onClick={() => setTheme({ background: b.value })}
            className={clsx(
              'flex items-center gap-2.5 rounded-md p-2 text-left text-sm ring-1 transition-colors',
              theme.background === b.value ? 'bg-white/10 ring-accent' : 'ring-white/10 hover:bg-white/5',
            )}
          >
            <span className="h-8 w-8 shrink-0 rounded ring-1 ring-white/25" style={{ backgroundColor: backgroundSwatch(b.value) }} />
            <span className="min-w-0 truncate">{b.label}</span>
          </button>
        ))}
      </div>

      <div
        className="mt-6 flex flex-wrap items-center gap-3 rounded-md bg-base-900 p-4 ring-1 ring-white/5"
        aria-hidden
        data-testid="theme-preview"
      >
        <Button variant="primary" size="sm" tabIndex={-1}>
          {t('common.play')}
        </Button>
        <span className="text-sm font-semibold text-accent">{t('settings.accentText')}</span>
        <div className="h-1.5 w-32 overflow-hidden rounded-full bg-base-700">
          <div className="h-full w-2/3 bg-accent" />
        </div>
        <span className="rounded bg-base-800 px-2 py-1 text-xs text-muted ring-1 ring-white/5">{t('settings.panel')}</span>
      </div>
    </Card>
  );
}
