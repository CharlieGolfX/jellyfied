import { useCurrentUser } from '@/auth/AuthProvider';
import { t } from '@/i18n';
import { PageSpinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/States';
import { usePageTitle } from '@/lib/usePageTitle';
import { AccountPinCard } from './settings/AccountPinCard';
import { DeviceCard } from './settings/DeviceCard';
import { InterfaceColorsCard } from './settings/InterfaceColorsCard';
import { LanguageCard } from './settings/LanguageCard';
import { PasswordCard } from './settings/PasswordCard';
import { PlaybackCard } from './settings/PlaybackCard';
import { ProfileCard } from './settings/ProfileCard';
import { QuickConnectCard } from './settings/QuickConnectCard';
import { SubtitleAppearanceCard } from './settings/SubtitleAppearanceCard';

export default function SettingsPage() {
  usePageTitle(t('settings.accountSettings'));
  const { data: user, isLoading, error, refetch } = useCurrentUser();

  if (isLoading) return <PageSpinner />;
  if (!user) return error ? <ErrorState error={error} onRetry={() => refetch()} /> : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-8">
      <h1 className="text-2xl font-bold">{t('settings.accountSettingsTitle')}</h1>

      <ProfileCard user={user} />
      <PlaybackCard saved={user.Configuration} />
      <DeviceCard />

      <LanguageCard />
      <InterfaceColorsCard />
      <SubtitleAppearanceCard />

      <PasswordCard hasPassword={user.HasPassword} />
      <AccountPinCard />
      <QuickConnectCard />
    </div>
  );
}
