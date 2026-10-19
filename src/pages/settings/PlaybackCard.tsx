import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CultureDto, UserConfiguration } from '@/api/types';
import { useApi, useSession } from '@/auth/AuthProvider';
import { t } from '@/i18n';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, Select, Switch } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';

const SUBTITLE_MODES: { value: UserConfiguration['SubtitleMode']; label: string }[] = [
  { value: 'Default', label: t('settings.subtitleModeDefault') },
  { value: 'Smart', label: t('settings.subtitleModeSmart') },
  { value: 'OnlyForced', label: t('settings.onlyForcedSubtitles') },
  { value: 'Always', label: t('settings.alwaysShowSubtitles') },
  { value: 'None', label: t('settings.neverShowSubtitles') },
];

/** The playback preferences kept with the account on the server, saved together. */
export function PlaybackCard({ saved }: { saved: UserConfiguration }) {
  const api = useApi();
  const { userId } = useSession();
  const toast = useToast();
  const qc = useQueryClient();
  const cultures = useQuery({
    queryKey: ['cultures'],
    queryFn: () => api.get<CultureDto[]>('/Localization/Cultures'),
    staleTime: Infinity,
  });
  // The form starts from the saved preferences.
  const [config, setConfig] = useState(saved);

  const saveConfig = useMutation({
    mutationFn: (c: UserConfiguration) => api.post('/Users/Configuration', c, { userId }),
    onSuccess: () => {
      toast.success(t('settings.preferencesSaved'));
      void qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (e) => toast.error(e),
  });

  const languages = (cultures.data ?? [])
    .filter((c) => c.ThreeLetterISOLanguageName)
    .sort((a, b) => a.DisplayName.localeCompare(b.DisplayName));
  const set = <K extends keyof UserConfiguration>(key: K, value: UserConfiguration[K]) => setConfig((c) => ({ ...c, [key]: value }));

  return (
    <Card
      title={t('settings.playback')}
      description={t('settings.storedOnAccount')}
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
        <Field label={t('settings.subtitleLanguage')}>
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
          label={t('settings.playDefaultAudio')}
          checked={config.PlayDefaultAudioTrack}
          onChange={(v) => set('PlayDefaultAudioTrack', v)}
        />
        <Switch
          label={t('settings.autoplayNext')}
          checked={config.EnableNextEpisodeAutoPlay}
          onChange={(v) => set('EnableNextEpisodeAutoPlay', v)}
        />
        <Switch
          label={t('settings.rememberAudioSelections')}
          checked={config.RememberAudioSelections}
          onChange={(v) => set('RememberAudioSelections', v)}
        />
        <Switch
          label={t('settings.rememberSubtitles')}
          checked={config.RememberSubtitleSelections}
          onChange={(v) => set('RememberSubtitleSelections', v)}
        />
        <Switch
          label={t('settings.hideWatchedInLatest')}
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
  );
}
