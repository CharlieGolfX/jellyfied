import clsx from 'clsx';
import { Camera, Check, KeyRound, Trash2 } from 'lucide-react';
import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CultureDto, QuickConnectResult, UserConfiguration } from '@/api/types';
import { checkPin, hasPin, validPin } from '@/auth/accountPin';
import { useApi, useAuth, useCurrentUser, useSession } from '@/auth/AuthProvider';
import { PinInput } from '@/auth/PinPrompt';
import { browserLanguage, languageName, LANGUAGES, setLanguage, t, useLanguageChoice } from '@/i18n';
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
  { value: 'Default', label: t('settings.defaultMatchLanguagePreferenceForced') },
  { value: 'Smart', label: t('settings.smartShowWhenAudioIs') },
  { value: 'OnlyForced', label: t('settings.onlyForcedSubtitles') },
  { value: 'Always', label: t('settings.alwaysShowSubtitles') },
  { value: 'None', label: t('settings.neverShowSubtitles') },
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
  usePageTitle(t('settings.accountSettings'));
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
      toast.success(t('settings.preferencesSaved'));
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
      toast.success(t('settings.profilePictureUpdated'));
      void qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (e) => toast.error(e),
  });
  const deleteImage = useMutation({
    mutationFn: () => api.delete('/UserImage', { userId }),
    onSuccess: () => {
      toast.success(t('settings.profilePictureRemoved'));
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
      <h1 className="text-2xl font-bold">{t('settings.accountSettings2')}</h1>

      <Card title={t('settings.profile')}>
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
                {t('settings.changePicture')}
              </Button>
              {user.PrimaryImageTag && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Trash2 size={14} />}
                  loading={deleteImage.isPending}
                  onClick={() => deleteImage.mutate()}
                >
                  {t('settings.remove')}
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Card
        title={t('settings.playback')}
        description={t('settings.storedOnYourJellyfinAccount')}
        actions={
          <Button variant="primary" size="sm" loading={saveConfig.isPending} onClick={() => saveConfig.mutate(config)}>
            {t('common.save')}
          </Button>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('settings.preferredAudioLanguage')}>
            <Select value={config.AudioLanguagePreference ?? ''} onChange={(e) => set('AudioLanguagePreference', e.target.value)}>
              <option value="">{t('settings.anyLanguage')}</option>
              {languages.map((l) => (
                <option key={`${l.ThreeLetterISOLanguageName}-${l.DisplayName}`} value={l.ThreeLetterISOLanguageName!}>
                  {l.DisplayName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('settings.preferredSubtitleLanguage')}>
            <Select value={config.SubtitleLanguagePreference ?? ''} onChange={(e) => set('SubtitleLanguagePreference', e.target.value)}>
              <option value="">{t('settings.anyLanguage')}</option>
              {languages.map((l) => (
                <option key={`${l.ThreeLetterISOLanguageName}-${l.DisplayName}`} value={l.ThreeLetterISOLanguageName!}>
                  {l.DisplayName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('settings.subtitleMode')} className="sm:col-span-2">
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
            label={t('settings.playDefaultAudioTrackRegardless')}
            checked={config.PlayDefaultAudioTrack}
            onChange={(v) => set('PlayDefaultAudioTrack', v)}
          />
          <Switch
            label={t('settings.automaticallyPlayTheNextEpisode')}
            checked={config.EnableNextEpisodeAutoPlay}
            onChange={(v) => set('EnableNextEpisodeAutoPlay', v)}
          />
          <Switch
            label={t('settings.rememberAudioSelections')}
            checked={config.RememberAudioSelections}
            onChange={(v) => set('RememberAudioSelections', v)}
          />
          <Switch
            label={t('settings.rememberSubtitleSelections')}
            checked={config.RememberSubtitleSelections}
            onChange={(v) => set('RememberSubtitleSelections', v)}
          />
          <Switch
            label={t('settings.hideWatchedItemsInRecently')}
            checked={config.HidePlayedInLatest}
            onChange={(v) => set('HidePlayedInLatest', v)}
          />
          <Switch
            label={t('settings.showMissingEpisodes')}
            checked={config.DisplayMissingEpisodes}
            onChange={(v) => set('DisplayMissingEpisodes', v)}
          />
        </div>
      </Card>

      <Card title={t('common.thisDevice')} description={t('settings.streamingQualityIsStoredIn')}>
        <div className="mb-3 border-b border-white/5 pb-2">
          <Switch
            label={t('settings.syncMyPreferences')}
            description={t('settings.keepsColoursSubtitleAppearanceSkip')}
            checked={syncPrefs}
            onChange={setSyncPrefs}
          />
        </div>
        <Field label={t('settings.defaultStreamingQuality')} hint={t('settings.lowerValuesMakeTheServer')}>
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
              toast.success(t('settings.streamingQualityUpdated'));
            }}
          >
            <option value={MAX_BITRATE}>{t('settings.originalAuto')}</option>
            <option value={40_000_000}>{t('settings.n40Mbps4k')}</option>
            <option value={20_000_000}>{t('settings.n20Mbps1080p')}</option>
            <option value={12_000_000}>{t('settings.n12Mbps1080p')}</option>
            <option value={8_000_000}>{t('settings.n8Mbps1080p')}</option>
            <option value={4_000_000}>{t('settings.n4Mbps720p')}</option>
            <option value={2_000_000}>{t('settings.n2Mbps480p')}</option>
            <option value={1_000_000}>{t('settings.n1Mbps480p')}</option>
          </Select>
        </Field>
        <Field className="mt-4" label={t('settings.defaultTimeDisplay')} hint={t('settings.usedForClockTimesSuch')}>
          <Select
            value={timeFormat}
            onChange={(e) => {
              setTimeFormat(e.target.value as TimeFormat);
              toast.success(t('settings.timeDisplayUpdated'));
            }}
          >
            <option value="24h">{t('settings.n24Hour2145')}</option>
            <option value="12h">{t('settings.n12Hour945Pm')}</option>
          </Select>
        </Field>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label={t('settings.skipBack')} hint={t('settings.thePlayerSBackButton')}>
            <Select value={seekSteps.back} onChange={(e) => setSeekSteps({ back: Number(e.target.value) })}>
              {SEEK_STEP_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {t('settings.seconds', { count: s })}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('settings.skipForward')} hint={t('settings.theForwardButtonTheAnd')}>
            <Select value={seekSteps.forward} onChange={(e) => setSeekSteps({ forward: Number(e.target.value) })}>
              {SEEK_STEP_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {t('settings.seconds', { count: s })}
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
      title={t('settings.interfaceColours')}
      description={t('settings.theAccentColourAndBackground')}
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
    <Card title={t('settings.subtitleAppearance')} description={t('settings.howTextSubtitlesLookIn')}>
      <div
        className="mb-4 flex aspect-[32/9] items-end justify-center rounded-md bg-gradient-to-br from-sky-900 via-slate-700 to-amber-800 p-4"
        aria-hidden
      >
        <span
          data-testid="subtitle-preview"
          className="rounded-sm px-[0.35em] text-center font-semibold"
          style={{ ...subtitleLineCss(style), fontSize: `${20 * subtitleScale(style)}px`, lineHeight: 1.3 }}
        >
          {t('settings.thisIsHowSubtitlesWill')}
        </span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {select('size', t('settings.textSize'), SUBTITLE_SIZES)}
        {select('color', t('settings.textColour'), SUBTITLE_COLORS)}
        {select('background', 'Background', SUBTITLE_BACKGROUNDS)}
        {select('edge', t('settings.textEdge'), SUBTITLE_EDGES)}
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
      toast.success(t('settings.passwordChanged'));
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
    <Card title={t('common.password')}>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-3">
        {hasPassword && (
          <Field label={t('settings.currentPassword')}>
            <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </Field>
        )}
        <Field label={t('settings.newPassword')}>
          <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field
          label={t('settings.confirmNewPassword')}
          hint={mismatch ? <span className="text-danger">{t('settings.passwordsDonTMatch')}</span> : undefined}
        >
          <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <div className="sm:col-span-3">
          <Button type="submit" variant="primary" loading={mutation.isPending} disabled={mismatch || (!next && !hasPassword)}>
            {t('settings.updatePassword')}
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
      toast.success(t('settings.deviceAuthorized'));
      setCode('');
    },
    onError: (e) => toast.error(e),
  });
  if (enabled.data !== true) return null;
  return (
    <Card title={t('settings.quickConnect')} description={t('settings.signInOnAnotherDevice')}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) mutation.mutate();
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <Field label={t('settings.code')} className="w-48">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            placeholder="123456"
            className="font-mono tracking-widest"
          />
        </Field>
        <Button type="submit" variant="primary" icon={<KeyRound size={16} />} loading={mutation.isPending} disabled={!code.trim()}>
          {t('settings.authorize')}
        </Button>
      </form>
    </Card>
  );
}

/** Sets, changes or removes the PIN that is asked for before switching to this account on this device. */
function AccountPinCard() {
  const session = useSession();
  const { protectAccount } = useAuth();
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
      result.lockedFor ? t('auth.pin.locked', { seconds: Math.ceil(result.lockedFor / 1000) }) : t('settings.theCurrentPinIsWrong'),
    );
    setCurrent('');
    return false;
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (mismatch || !validPin(next) || !currentIsRight()) return;
    protectAccount(next);
    toast.success(protectedNow ? t('settings.pinChanged') : t('settings.pinSet'));
    reset();
  };
  const remove = () => {
    if (!currentIsRight()) return;
    protectAccount(null);
    toast.success(t('settings.pinRemoved'));
    reset();
  };

  return (
    <Card title={t('settings.accountPin')} description={t('settings.askedForBeforeSomeoneSwitches')}>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-3" data-testid="account-pin">
        {protectedNow && (
          <Field label={t('settings.currentPin')}>
            <PinInput value={current} onChange={setCurrent} />
          </Field>
        )}
        <Field label={protectedNow ? t('settings.newPin') : t('settings.pin')} hint={t('settings.n4To12Digits')}>
          <PinInput value={next} onChange={setNext} />
        </Field>
        <Field
          label={t('settings.repeatThePin')}
          hint={mismatch ? <span className="text-danger">{t('settings.thePinsDonTMatch')}</span> : undefined}
        >
          <PinInput value={confirm} onChange={setConfirm} />
        </Field>
        <div className="flex flex-wrap gap-2 sm:col-span-3">
          <Button type="submit" variant="primary" disabled={mismatch || !validPin(next) || next !== confirm || (protectedNow && !current)}>
            {protectedNow ? t('settings.changePin') : t('settings.setPin')}
          </Button>
          {protectedNow && (
            <Button variant="outline" disabled={!current} onClick={remove}>
              {t('settings.removePin')}
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}

/** Picks the language of Jellyplex's own text, from the languages it has been translated to. */
function LanguageCard() {
  const choice = useLanguageChoice();
  return (
    <Card title={t('settings.language.title')} description={t('settings.language.description')}>
      <Field label={t('settings.language.label')} hint={t('settings.language.count', { count: LANGUAGES.length })} className="max-w-sm">
        <Select value={choice ?? ''} onChange={(e) => setLanguage(e.target.value || null)}>
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
