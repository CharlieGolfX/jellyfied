import { Camera, KeyRound, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CultureDto, QuickConnectResult, UserConfiguration } from '@/api/types';
import { useApi, useCurrentUser, useSession } from '@/auth/AuthProvider';
import { Avatar } from '@/components/layout/UserMenu';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Switch } from '@/components/ui/Form';
import { PageSpinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { MAX_BITRATE } from '@/player/deviceProfile';

export function Card({ title, description, children, actions }: { title: string; description?: ReactNode; children: ReactNode; actions?: ReactNode }) {
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
  const api = useApi();
  const { userId } = useSession();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: user, isLoading, error, refetch } = useCurrentUser();
  const cultures = useQuery({ queryKey: ['cultures'], queryFn: () => api.get<CultureDto[]>('/Localization/Cultures'), staleTime: Infinity });

  const [config, setConfig] = useState<UserConfiguration | null>(null);
  useEffect(() => {
    if (user && !config) setConfig(user.Configuration);
  }, [user, config]);

  const [bitrate, setBitrate] = useState(() => Number(localStorage.getItem('jellyplex.maxBitrate')) || MAX_BITRATE);

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
                <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} loading={deleteImage.isPending} onClick={() => deleteImage.mutate()}>
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
                <option key={l.ThreeLetterISOLanguageName!} value={l.ThreeLetterISOLanguageName!}>
                  {l.DisplayName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Preferred subtitle language">
            <Select value={config.SubtitleLanguagePreference ?? ''} onChange={(e) => set('SubtitleLanguagePreference', e.target.value)}>
              <option value="">Any language</option>
              {languages.map((l) => (
                <option key={l.ThreeLetterISOLanguageName!} value={l.ThreeLetterISOLanguageName!}>
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

      <Card title="This device" description="Settings stored in this browser only.">
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
      </Card>

      <PasswordCard hasPassword={user.HasPassword} />
      <QuickConnectCard />
    </div>
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
          <Input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" placeholder="123456" className="font-mono tracking-widest" />
        </Field>
        <Button type="submit" variant="primary" icon={<KeyRound size={16} />} loading={mutation.isPending} disabled={!code.trim()}>
          Authorize
        </Button>
      </form>
    </Card>
  );
}
