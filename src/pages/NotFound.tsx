import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/ui/States';
import { usePageTitle } from '@/lib/usePageTitle';

export default function NotFoundPage() {
  usePageTitle('Page not found');
  return (
    <EmptyState icon={<Compass size={48} strokeWidth={1.25} />} title="Page not found">
      <p>The page you’re looking for doesn’t exist.</p>
      <Link to="/" className="mt-4 inline-block font-semibold text-accent hover:underline">
        Go home
      </Link>
    </EmptyState>
  );
}
