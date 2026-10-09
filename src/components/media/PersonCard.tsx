import { User } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { BaseItemPerson } from '@/api/types';
import { useApi } from '@/auth/AuthProvider';
import { Img } from '@/components/ui/States';

export function PersonCard({ person }: { person: BaseItemPerson }) {
  const api = useApi();
  const src = person.PrimaryImageTag
    ? api.imageUrl(person.Id, 'Primary', { tag: person.PrimaryImageTag, maxWidth: 300 })
    : undefined;
  const role = person.Role || person.Type;
  return (
    <Link
      to={`/item/${person.Id}`}
      className="group/person block shrink-0 text-center"
      style={{ width: 'calc(var(--hub-person) * var(--card-scale))' }}
    >
      <div className="relative mx-auto aspect-square w-full overflow-hidden rounded-full bg-base-800 ring-white/0 transition group-hover/person:ring-2 group-hover/person:ring-accent">
        <Img
          src={src}
          className="absolute inset-0 h-full w-full object-cover"
          fallback={
            <div className="absolute inset-0 flex items-center justify-center text-faint">
              <User size={40} strokeWidth={1.25} />
            </div>
          }
        />
      </div>
      <div className="mt-2 truncate text-sm font-medium group-hover/person:underline" title={person.Name}>
        {person.Name}
      </div>
      {role && (
        <div className="truncate text-xs text-muted" title={role}>
          {role}
        </div>
      )}
    </Link>
  );
}
