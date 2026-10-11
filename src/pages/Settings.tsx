import clsx from 'clsx';
import { Camera, Check, KeyRound, Trash2 } from 'lucide-react';
import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CultureDto, QuickConnectResult, UserConfiguration } from '@/api/types';
import { checkPin, clearPin, hasPin, setPin, validPin } from '@/auth/accountPin';
import { useApi, useCurrentUser, useSession } from '@/auth/AuthProvider';
import { PinInput } from '@/auth/PinPrompt';
import { browserLanguage, chosenLanguage, languageName, LANGUAGES, setLanguage, useLanguage, useT } from '@/i18n';
import { Avatar } from '@/components/layout/UserMenu';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Switch } from '@/components/ui/Form';
import { PageSpinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { ACCENT_PRESETS, BACKGROUNDS, backgroundSwatch, DEFAULT_THEME, useTheme } from '@/lib/theme';
import { useTimeFormat, type TimeFormat } from '@/lib/timeFormat';
import { usePageTitle } from '@/lib/usePageTitle';
import { usePrefsSyncEnabled } from '@/lib/prefsSync';
import { MAX_BITRATE } from '@/player/deviceProfile';
import { SEEK_STEP_OPTIONS, useSeekSteps } from '@/player/seekSteps';
import {
  SUBTITLE_BACKGROUNDS,
  SUBTITLE_COLORS,
  SUBTITLE_EDGES,
  SUBTITLE_SIZES,
  subtitleLineCss,
  subtitleScale,
  useSubtitleStyle,
  type SubtitleStyle,
} from '@/player/subtitleStyle';

export function Card({
  title,
  description,
  children,
  actions,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="rounded-lg bg-base-800/70 ring-1 ring-white/5">
      <div className="flex items-start justify-between gap-4 border-b border-white/5 px-5 py-4">
        <div>
          <h2 className="font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
        </div>
        {actions}
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

const SUBTITLE_MODES: { value: UserConfiguration['SubtitleMode']; label: string }[] = [
  { value: 'Default', label: 'Default — match language preference, forced subtitles' },
  { value: 'Smart', label: 'Smart — show when audio is in a foreign language' },
  { value: 'OnlyForced', label: 'Only forced subtitles' },
  { value: 'Always', label: 'Always show subtitles' },
  { value: 'None', label: 'Never show subtitles' },
];

/** Reads a File as a base64 string (without the data URL prefix), as Jellyfin's image upload expects. */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function SettingsPage() {
  usePageTitle('Account settings');
  const api = useApi();
  const { userId } = useSession();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: user, isLoading, error, refetch } = useCurrentUser();
  const cultures = useQuery({
    queryKey: ['cultures'],
    queryFn: () => api.get<CultureDto[]>('/Localization/Cultures'),
    staleTime: Infinity,
  });

  const [config, setConfig] = useState<UserConfiguration | null>(null);
  // The form starts from the saved preferences once they have arrived.
  if (user && !config) setConfig(user.Configuration);

  const [timeFormat, setTimeFormat] = useTimeFormat();
  const [bitrate, setBitrate] = useState(() => Number(localStorage.getItem('jellyplex.maxBitrate')) || MAX_BITRATE);
  const [seekSteps, setSeekSteps] = useSeekSteps();
  const [syncPrefs, setSyncPrefs] = usePrefsSyncEnabled();

  const saveConfig = useMutation({
    mutationFn: (c: UserConfiguration) => api.post('/Users/Configuration', c, { userId }),
    onSuccess: () => {
      toast.success('Preferences saved');
      void qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (e) => toast.error(e),
  });

  const fileRef = useRef<HTMLInputElement>(null);
  const uploadImage = useMutation({
    mutationFn: async (file: File) => {
      const data = await fileToBase64(file);
      await api.request('POST', '/UserImage', { query: { userId }, rawBody: { data, contentType: file.type || 'image/jpeg' } });
    },
    onSuccess: () => {
      toast.success('Profile picture updated');
      void qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (e) => toast.error(e),
  });
  const deleteImage = useMutation({
    mutationFn: () => api.delete('/UserImage', { userId }),
    onSuccess: () => {
      toast.success('Profile picture removed');
      void qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (e) => toast.error(e),
  });

  if (isLoading || !config) return error ? <ErrorState error={error} onRetry={() => refetch()} /> : <PageSpinner />;
  if (!user) return null;

  const languages = (cultures.data ?? [])
    .filter((c) => c.ThreeLetterISOLanguageName)
    .sort((a, b) => a.DisplayName.localeCompare(b.DisplayName));
  const set = <K extends keyof UserConfiguration>(key: K, value: UserConfiguration[K]) =>
    setConfig((c) => (c ? { ...c, [key]: value } : c));

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-8">
      <h1 className="text-2xl font-bold">Account Settings</h1>

      <Card title="Profile">
        <div className="flex items-center gap-5">
          <Avatar userId={user.Id} tag={user.PrimaryImageTag} name={user.Name} size={80} />
          <div className="space-y-2">
            <div className="text-lg font-semibold">{user.Name}</div>
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadImage.mutate(f);
                  e.target.value = '';
                }}
              />
              <Button size="sm" icon={<Camera size={14} />} loading={uploadImage.isPending} onClick={() => fileRef.current?.click()}>
                Change picture
              </Button>
              {user.PrimaryImageTag && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Trash2 size={14} />}
                  loading={deleteImage.isPending}
                  onClick={() => deleteImage.mutate()}
                >
                  Remove
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Card
        title="Playback"
        description="Stored on your Jellyfin account and used by all clients."
        actions={
          <Button variant="primary" size="sm" loading={saveConfig.isPending} onClick={() => saveConfig.mutate(config)}>
            Save
          </Button>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Preferred audio language">
            <Select value={config.AudioLanguagePreference ?? ''} onChange={(e) => set('AudioLanguagePreference', e.target.value)}>
              <option value="">Any language</option>
              {languages.map((l) => (
                <option key={`${l.ThreeLetterISOLanguageName}-${l.DisplayName}`} value={l.ThreeLetterISOLanguageName!}>
                  {l.DisplayName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Preferred subtitle language">
            <Select value={config.SubtitleLanguagePreference ?? ''} onChange={(e) => set('SubtitleLanguagePreference', e.target.value)}>
              <option value="">Any language</option>
              {languages.map((l) => (
                <option key={`${l.ThreeLetterISOLanguageName}-${l.DisplayName}`} value={l.ThreeLetterISOLanguageName!}>
                  {l.DisplayName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Subtitle mode" className="sm:col-span-2">
            <Select value={config.SubtitleMode} onChange={(e) => set('SubtitleMode', e.target.value as UserConfiguration['SubtitleMode'])}>
              {SUBTITLE_MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="mt-3 divide-y divide-white/5">
          <Switch
            label="Play default audio track regardless of language"
            checked={config.PlayDefaultAudioTrack}
            onChange={(v) => set('PlayDefaultAudioTrack', v)}
          />
          <Switch
            label="Automatically play the next episode"
            checked={config.EnableNextEpisodeAutoPlay}
            onChange={(v) => set('EnableNextEpisodeAutoPlay', v)}
          />
          <Switch
            label="Remember audio selections"
            checked={config.RememberAudioSelections}
            onChange={(v) => set('RememberAudioSelections', v)}
          />
          <Switch
            label="Remember subtitle selections"
            checked={config.RememberSubtitleSelections}
            onChange={(v) => set('RememberSubtitleSelections', v)}
          />
          <Switch
            label="Hide watched items in Recently Added"
            checked={config.HidePlayedInLatest}
            onChange={(v) => set('HidePlayedInLatest', v)}
          />
          <Switch
            label="Show missing episodes"
            checked={config.DisplayMissingEpisodes}
            onChange={(v) => set('DisplayMissingEpisodes', v)}
          />
        </div>
      </Card>

      <Card
        title="This device"
        description="Streaming quality is stored in this browser only. The other settings here, the colours and the subtitle appearance follow your account when syncing is on."
      >
        <div className="mb-3 border-b border-white/5 pb-2">
          <Switch
            label="Sync my preferences"
            description="Keeps colours, subtitle appearance, skip lengths, time display, the home page layout and remembered tracks the same in every browser you sign in to."
            checked={syncPrefs}
            onChange={setSyncPrefs}
          />
        </div>
        <Field label="Default streaming quality" hint="Lower values make the server transcode to save bandwidth.">
          <Select
            value={bitrate}
            onChange={(e) => {
              const v = Number(e.target.value);
              setBitrate(v);
              try {
                localStorage.setItem('jellyplex.maxBitrate', String(v));
              } catch {
                /* ignore */
              }
              toast.success('Streaming quality updated');
            }}
          >
            <option value={MAX_BITRATE}>Original / Auto</option>
            <option value={40_000_000}>40 Mbps (4K)</option>
            <option value={20_000_000}>20 Mbps (1080p)</option>
            <option value={12_000_000}>12 Mbps (1080p)</option>
            <option value={8_000_000}>8 Mbps (1080p)</option>
            <option value={4_000_000}>4 Mbps (720p)</option>
            <option value={2_000_000}>2 Mbps (480p)</option>
            <option value={1_000_000}>1 Mbps (480p)</option>
          </Select>
        </Field>
        <Field
          className="mt-4"
          label="Default time display"
          hint="Used for clock times such as “Ends at” in the player and dates in the dashboard."
        >
          <Select
            value={timeFormat}
            onChange={(e) => {
              setTimeFormat(e.target.value as TimeFormat);
              toast.success('Time display updated');
            }}
          >
            <option value="24h">24-hour (21:45)</option>
            <option value="12h">12-hour (9:45 PM)</option>
          </Select>
        </Field>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Skip back" hint="The player’s back button, the ← and J keys, and a double tap on the left.">
            <Select value={seekSteps.back} onChange={(e) => setSeekSteps({ back: Number(e.target.value) })}>
              {SEEK_STEP_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s} seconds
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Skip forward" hint="The forward button, the → and L keys, and a double tap on the right.">
            <Select value={seekSteps.forward} onChange={(e) => setSeekSteps({ forward: Number(e.target.value) })}>
              {SEEK_STEP_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s} seconds
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <LanguageCard />
      <InterfaceColorsCard />
      <SubtitleAppearanceCard />

      <PasswordCard hasPassword={user.HasPassword} />
      <AccountPinCard />
      <QuickConnectCard />
    </div>
  );
}

function InterfaceColorsCard() {
  const [theme, setTheme] = useTheme();
  const customAccent = !ACCENT_PRESETS.some((p) => p.value === theme.accent);
  const changed = theme.accent !== DEFAULT_THEME.accent || theme.background !== DEFAULT_THEME.background;
  return (
    <Card
      title="Interface colours"
      description="The accent colour and background of Jellyplex on this device."
      actions={
        changed ? (
          <Button size="sm" variant="ghost" onClick={() => setTheme(DEFAULT_THEME)}>
            Reset
          </Button>
        ) : undefined
      }
    >
      <div className="text-sm font-medium text-fg">Accent colour</div>
      <div className="mt-2 flex flex-wrap items-center gap-2.5" role="radiogroup" aria-label="Accent colour">
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
          title="Custom colour"
          className={clsx(
            'relative flex h-9 items-center gap-2 rounded-full bg-white/10 pr-3 pl-1.5 text-sm ring-offset-2 ring-offset-base-800 hover:bg-white/15',
            customAccent && 'ring-2 ring-white',
          )}
        >
          <span
            className="h-6 w-6 rounded-full ring-1 ring-white/20"
            style={{ background: customAccent ? theme.accent : 'conic-gradient(#e5484d, #e5a00d, #3dbb6b, #00a4dc, #aa5cc3, #e5484d)' }}
          />
          Custom
          <input
            type="color"
            aria-label="Custom accent colour"
            value={theme.accent}
            onChange={(e) => setTheme({ accent: e.target.value.toLowerCase() })}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
      </div>

      <div className="mt-6 text-sm font-medium text-fg">Background</div>
      <div className="mt-2 grid grid-cols-2 gap-2.5 sm:grid-cols-3" role="radiogroup" aria-label="Background">
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
          Play
        </Button>
        <span className="text-sm font-semibold text-accent">Accent text</span>
        <div className="h-1.5 w-32 overflow-hidden rounded-full bg-base-700">
          <div className="h-full w-2/3 bg-accent" />
        </div>
        <span className="rounded bg-base-800 px-2 py-1 text-xs text-muted ring-1 ring-white/5">Panel</span>
      </div>
    </Card>
  );
}

function SubtitleAppearanceCard() {
  const [style, setStyle] = useSubtitleStyle();
  const select = <K extends keyof SubtitleStyle>(key: K, label: string, options: { value: SubtitleStyle[K]; label: string }[]) => (
    <Field label={label}>
      <Select value={style[key]} onChange={(e) => setStyle({ [key]: e.target.value } as Partial<SubtitleStyle>)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </Field>
  );
  return (
    <Card
      title="Subtitle appearance"
      description="How text subtitles look in the video player on this device. Subtitles that are burned into the video by the server are not affected."
    >
      <div
        className="mb-4 flex aspect-[32/9] items-end justify-center rounded-md bg-gradient-to-br from-sky-900 via-slate-700 to-amber-800 p-4"
        aria-hidden
      >
        <span
          data-testid="subtitle-preview"
          className="rounded-sm px-[0.35em] text-center font-semibold"
          style={{ ...subtitleLineCss(style), fontSize: `${20 * subtitleScale(style)}px`, lineHeight: 1.3 }}
        >
          This is how subtitles will look.
        </span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {select('size', 'Text size', SUBTITLE_SIZES)}
        {select('color', 'Text colour', SUBTITLE_COLORS)}
        {select('background', 'Background', SUBTITLE_BACKGROUNDS)}
        {select('edge', 'Text edge', SUBTITLE_EDGES)}
      </div>
    </Card>
  );
}

function PasswordCard({ hasPassword }: { hasPassword: boolean }) {
  const api = useApi();
  const { userId } = useSession();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const mutation = useMutation({
    mutationFn: () => api.post('/Users/Password', { CurrentPw: current, NewPw: next }, { userId }),
    onSuccess: () => {
      toast.success('Password changed');
      setCurrent('');
      setNext('');
      setConfirm('');
    },
    onError: (e) => toast.error(e),
  });
  const mismatch = confirm.length > 0 && next !== confirm;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (mismatch) return;
    mutation.mutate();
  };

  return (
    <Card title="Password">
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-3">
        {hasPassword && (
          <Field label="Current password">
            <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </Field>
        )}
        <Field label="New password">
          <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label="Confirm new password" hint={mismatch ? <span className="text-danger">Passwords don’t match</span> : undefined}>
          <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <div className="sm:col-span-3">
          <Button type="submit" variant="primary" loading={mutation.isPending} disabled={mismatch || (!next && !hasPassword)}>
            Update password
          </Button>
        </div>
      </form>
    </Card>
  );
}

function QuickConnectCard() {
  const api = useApi();
  const { userId } = useSession();
  const toast = useToast();
  const [code, setCode] = useState('');
  const enabled = useQuery({ queryKey: ['qc-enabled'], queryFn: () => api.get<boolean>('/QuickConnect/Enabled') });
  const mutation = useMutation({
    mutationFn: () => api.post<boolean | QuickConnectResult>('/QuickConnect/Authorize', undefined, { code: code.trim(), userId }),
    onSuccess: () => {
      toast.success('Device authorized');
      setCode('');
    },
    onError: (e) => toast.error(e),
  });
  if (enabled.data !== true) return null;
  return (
    <Card title="Quick Connect" description="Sign in on another device by entering the code it shows.">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) mutation.mutate();
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <Field label="Code" className="w-48">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            placeholder="123456"
            className="font-mono tracking-widest"
          />
        </Field>
        <Button type="submit" variant="primary" icon={<KeyRound size={16} />} loading={mutation.isPending} disabled={!code.trim()}>
          Authorize
        </Button>
      </form>
    </Card>
  );
}

/** Sets, changes or removes the PIN that is asked for before switching to this account on this device. */
function AccountPinCard() {
  const session = useSession();
  const toast = useToast();
  const [protectedNow, setProtectedNow] = useState(() => hasPin(session));
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const mismatch = confirm.length > 0 && next !== confirm;

  const reset = () => {
    setCurrent('');
    setNext('');
    setConfirm('');
    setProtectedNow(hasPin(session));
  };
  /** Changing or removing a PIN takes the PIN, or anyone at the keyboard could do it. */
  const currentIsRight = () => {
    const result = checkPin(session, current);
    if (result.ok) return true;
    toast.error(
      result.lockedFor ? `Too many wrong tries. Try again in ${Math.ceil(result.lockedFor / 1000)} seconds.` : 'The current PIN is wrong.',
    );
    setCurrent('');
    return false;
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (mismatch || !validPin(next) || !currentIsRight()) return;
    setPin(session, next);
    toast.success(protectedNow ? 'PIN changed' : 'PIN set');
    reset();
  };
  const remove = () => {
    if (!currentIsRight()) return;
    clearPin(session);
    toast.success('PIN removed');
    reset();
  };

  return (
    <Card
      title="Account PIN"
      description="Asked for before someone switches to this account on this device. It keeps others in the household out of your account; it does not replace your password, and it only applies to this browser."
    >
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-3" data-testid="account-pin">
        {protectedNow && (
          <Field label="Current PIN">
            <PinInput value={current} onChange={setCurrent} />
          </Field>
        )}
        <Field label={protectedNow ? 'New PIN' : 'PIN'} hint="4 to 12 digits">
          <PinInput value={next} onChange={setNext} />
        </Field>
        <Field label="Repeat the PIN" hint={mismatch ? <span className="text-danger">The PINs don’t match</span> : undefined}>
          <PinInput value={confirm} onChange={setConfirm} />
        </Field>
        <div className="flex flex-wrap gap-2 sm:col-span-3">
          <Button type="submit" variant="primary" disabled={mismatch || !validPin(next) || next !== confirm || (protectedNow && !current)}>
            {protectedNow ? 'Change PIN' : 'Set PIN'}
          </Button>
          {protectedNow && (
            <Button variant="outline" disabled={!current} onClick={remove}>
              Remove PIN
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}

/** Picks the language of Jellyplex's own text, from the languages it has been translated to. */
function LanguageCard() {
  const t = useT();
  // Read again whenever the language in use changes.
  useLanguage();
  return (
    <Card title={t('settings.language.title')} description={t('settings.language.description')}>
      <Field label={t('settings.language.label')} hint={t('settings.language.count', { count: LANGUAGES.length })} className="max-w-sm">
        <Select value={chosenLanguage() ?? ''} onChange={(e) => setLanguage(e.target.value || null)}>
          <option value="">{t('settings.language.auto', { language: languageName(browserLanguage()) })}</option>
          {LANGUAGES.map((code) => (
            <option key={code} value={code}>
              {languageName(code)}
            </option>
          ))}
        </Select>
      </Field>
    </Card>
  );
}
