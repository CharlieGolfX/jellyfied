import { Plus, Trash2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { AccessSchedule, ParentalRating } from '@/api/generated';
import type { UserPolicy } from '@/api/types';
import { useApi } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, Input, Select } from '@/components/ui/Form';
import { Card } from '@/pages/Settings';
import { parseList } from './shared';

const UNRATED: [string, string][] = [
  ['Movie', 'Movies'],
  ['Series', 'Shows'],
  ['Music', 'Music'],
  ['Book', 'Books'],
  ['Trailer', 'Trailers'],
  ['LiveTvChannel', 'Live TV channels'],
  ['LiveTvProgram', 'Live TV programmes'],
  ['ChannelContent', 'Channel content'],
  ['Other', 'Everything else'],
];

const DAYS: [NonNullable<AccessSchedule['DayOfWeek']>, string][] = [
  ['Everyday', 'Every day'],
  ['Weekday', 'Weekdays'],
  ['Weekend', 'Weekends'],
  ['Monday', 'Monday'],
  ['Tuesday', 'Tuesday'],
  ['Wednesday', 'Wednesday'],
  ['Thursday', 'Thursday'],
  ['Friday', 'Friday'],
  ['Saturday', 'Saturday'],
  ['Sunday', 'Sunday'],
];

/** Half-hour steps of a day: 0, 0.5, … 24. */
const HOURS = Array.from({ length: 49 }, (_, i) => i / 2);
export const hourLabel = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${h % 1 ? '30' : '00'}`;

export interface RatingLevel {
  /** "score" or "score:subScore": what the select carries. */
  key: string;
  score: number;
  subScore: number | null;
  label: string;
}

/**
 * The server's ratings grouped into levels: ratings from different countries that mean the same
 * age share one level, as "PG-13 / 12 / FSK-12". Ratings without a score ("Unrated") are left out.
 */
export function ratingLevels(ratings: ParentalRating[]): RatingLevel[] {
  const levels = new Map<string, RatingLevel>();
  for (const r of ratings) {
    const score = r.RatingScore?.score ?? r.Value;
    if (score === null || score === undefined || !r.Name) continue;
    const subScore = r.RatingScore?.subScore ?? null;
    const key = subScore ? `${score}:${subScore}` : String(score);
    const level = levels.get(key);
    if (level) level.label += ` / ${r.Name}`;
    else levels.set(key, { key, score, subScore: subScore || null, label: r.Name });
  }
  return [...levels.values()].sort((a, b) => a.score - b.score || (a.subScore ?? 0) - (b.subScore ?? 0));
}

/** The "Parental" tab of the user editor: what a user may see, and when they may use the server. */
export function ParentalControls({
  policy,
  onChange,
}: {
  policy: UserPolicy;
  onChange: <K extends keyof UserPolicy>(key: K, value: UserPolicy[K]) => void;
}) {
  const api = useApi();
  const ratings = useQuery({
    queryKey: ['parental-ratings'],
    queryFn: () => api.get<ParentalRating[]>('/Localization/ParentalRatings'),
    staleTime: Infinity,
  });
  const levels = ratingLevels(ratings.data ?? []);
  const max = policy.MaxParentalRating;
  const current =
    max === null || max === undefined ? '' : policy.MaxParentalSubRating ? `${max}:${policy.MaxParentalSubRating}` : String(max);
  const unrated = policy.BlockUnratedItems ?? [];
  const schedules = policy.AccessSchedules ?? [];
  const setSchedule = (i: number, patch: Partial<AccessSchedule>) =>
    onChange(
      'AccessSchedules',
      schedules.map((s, n) => (n === i ? { ...s, ...patch } : s)),
    );

  return (
    <>
      <Card title="Ratings" description="Hides everything rated above the chosen level from this user.">
        <Field label="Highest allowed rating" className="max-w-md">
          <Select
            aria-label="Highest allowed rating"
            value={current}
            onChange={(e) => {
              const level = levels.find((l) => l.key === e.target.value);
              onChange('MaxParentalRating', level ? level.score : null);
              if ('MaxParentalSubRating' in policy || level?.subScore) onChange('MaxParentalSubRating', level?.subScore ?? null);
            }}
          >
            <option value="">No limit</option>
            {levels.map((l) => (
              <option key={l.key} value={l.key}>
                {l.label}
              </option>
            ))}
            {current && !levels.some((l) => l.key === current) && <option value={current}>Level {current}</option>}
          </Select>
        </Field>
        <div className="mt-4">
          <div className="mb-1 text-sm font-medium">Also hide items that have no rating</div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3">
            {UNRATED.map(([value, label]) => (
              <Checkbox
                key={value}
                label={label}
                checked={unrated.includes(value)}
                onChange={(on) => onChange('BlockUnratedItems', on ? [...unrated, value] : unrated.filter((u) => u !== value))}
              />
            ))}
          </div>
        </div>
      </Card>

      <Card title="Tags" description="Tags are set on items in the metadata editor. Separate several with commas.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Only show items with one of these tags" hint="Empty shows everything the rating allows.">
            <Input
              defaultValue={(policy.AllowedTags ?? []).join(', ')}
              onChange={(e) => onChange('AllowedTags', parseList(e.target.value))}
              placeholder="kids, family"
            />
          </Field>
          <Field label="Hide items with any of these tags">
            <Input
              defaultValue={(policy.BlockedTags ?? []).join(', ')}
              onChange={(e) => onChange('BlockedTags', parseList(e.target.value))}
              placeholder="horror"
            />
          </Field>
        </div>
      </Card>

      <Card
        title="Access schedule"
        description="When this user may use the server. Without a schedule there is no restriction. Administrators are never restricted."
      >
        <ul className="space-y-2">
          {schedules.map((s, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2" data-testid="access-schedule">
              <Select
                aria-label="Days"
                className="w-40"
                value={s.DayOfWeek ?? 'Everyday'}
                onChange={(e) => setSchedule(i, { DayOfWeek: e.target.value as AccessSchedule['DayOfWeek'] })}
              >
                {DAYS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
              <span className="text-sm text-muted">from</span>
              <Select
                aria-label="From"
                className="w-24"
                value={s.StartHour ?? 0}
                onChange={(e) => setSchedule(i, { StartHour: Number(e.target.value) })}
              >
                {HOURS.slice(0, -1).map((h) => (
                  <option key={h} value={h}>
                    {hourLabel(h)}
                  </option>
                ))}
              </Select>
              <span className="text-sm text-muted">to</span>
              <Select
                aria-label="To"
                className="w-24"
                value={s.EndHour ?? 24}
                onChange={(e) => setSchedule(i, { EndHour: Number(e.target.value) })}
              >
                {HOURS.filter((h) => h > (s.StartHour ?? 0)).map((h) => (
                  <option key={h} value={h}>
                    {hourLabel(h)}
                  </option>
                ))}
              </Select>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Remove this time"
                onClick={() =>
                  onChange(
                    'AccessSchedules',
                    schedules.filter((_, n) => n !== i),
                  )
                }
              >
                <Trash2 size={16} />
              </Button>
            </li>
          ))}
        </ul>
        {schedules.length === 0 && <p className="text-sm text-muted">No restriction: the user can sign in at any time.</p>}
        <Button
          className="mt-3"
          variant="secondary"
          size="sm"
          icon={<Plus size={15} />}
          onClick={() => onChange('AccessSchedules', [...schedules, { DayOfWeek: 'Everyday', StartHour: 8, EndHour: 20 }])}
        >
          Add a time
        </Button>
      </Card>
    </>
  );
}
