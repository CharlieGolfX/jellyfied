import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/ui/States';
import { usePageTitle } from '@/lib/usePageTitle';
import { t } from '@/i18n';

export default function NotFoundPage() {
  usePageTitle(t('notFound.pageNotFound'));
  return (
    <EmptyState icon={<Compass size={48} strokeWidth={1.25} />} title={t('notFound.pageNotFound')}>
      <p>{t('notFound.thePageYouReLooking')}</p>
      <Link to="/" className="mt-4 inline-block font-semibold text-accent hover:underline">
        {t('notFound.goHome')}
      </Link>
    </EmptyState>
  );
}
