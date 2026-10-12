import clsx from 'clsx';
import { t } from '@/i18n';
import { Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { cardImage, imageSrc } from '@/api/images';
import type { BaseItemDto, ItemsResult } from '@/api/types';
import { useApi, useSession } from '@/auth/AuthProvider';
import { Img } from '@/components/ui/States';
import { Spinner } from '@/components/ui/Spinner';
import { fallbackIcon } from '@/components/media/PosterCard';
import { episodeLabel } from '@/lib/format';

export const SEARCH_TYPES = [
  'Movie',
  'Series',
  'Episode',
  'MusicAlbum',
  'MusicArtist',
  'Audio',
  'BoxSet',
  'Playlist',
  'MusicVideo',
  'Video',
];

function useDebounced<T>(value: T, delay: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setV(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return v;
}

const typeLabel: Partial<Record<BaseItemDto['Type'], string>> = {
  Movie: t('layout.searchBox.type.movie'),
  Series: t('layout.searchBox.tvShow'),
  Episode: t('layout.searchBox.type.episode'),
  MusicAlbum: t('layout.searchBox.type.album'),
  MusicArtist: t('layout.searchBox.type.artist'),
  Audio: t('layout.searchBox.type.track'),
  BoxSet: t('layout.searchBox.type.collection'),
  Playlist: t('layout.searchBox.type.playlist'),
  Person: t('layout.searchBox.type.person'),
  MusicVideo: t('layout.searchBox.musicVideo'),
  Video: t('layout.searchBox.type.video'),
};

function describe(item: BaseItemDto): string {
  const parts: string[] = [typeLabel[item.Type] ?? item.Type];
  if (item.Type === 'Episode') parts.push(`${item.SeriesName ?? ''} ${episodeLabel(item)}`.trim());
  else if (item.Type === 'Audio' || item.Type === 'MusicAlbum') parts.push(item.AlbumArtist ?? '');
  else if (item.ProductionYear) parts.push(String(item.ProductionYear));
  return parts.filter(Boolean).join(' · ');
}

export function SearchBox() {
  const api = useApi();
  const { userId } = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [term, setTerm] = useState(params.get('q') ?? '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const debounced = useDebounced(term.trim(), 250);

  const { data, isFetching } = useQuery({
    queryKey: ['quicksearch', debounced],
    queryFn: async ({ signal }) => {
      const [items, people] = await Promise.all([
        api.get<ItemsResult>(
          '/Items',
          {
            userId,
            searchTerm: debounced,
            recursive: true,
            includeItemTypes: SEARCH_TYPES,
            limit: 8,
            fields: ['PrimaryImageAspectRatio'],
            enableImageTypes: ['Primary', 'Thumb', 'Backdrop'],
            imageTypeLimit: 1,
          },
          signal,
        ),
        api.get<ItemsResult>('/Persons', { userId, searchTerm: debounced, limit: 3 }, signal),
      ]);
      return [...items.Items, ...people.Items];
    },
    enabled: debounced.length >= 2,
    staleTime: 30_000,
  });

  const results = useMemo(() => (debounced.length >= 2 ? (data ?? []) : []), [data, debounced]);

  // New results: nothing is highlighted yet.
  const [shown, setShown] = useState(results);
  if (shown !== results) {
    setShown(results);
    setActive(-1);
  }

  // "/" focuses search, like Plex.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) && !el.isContentEditable) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const go = (item: BaseItemDto) => {
    setOpen(false);
    inputRef.current?.blur();
    navigate(`/item/${item.Id}`);
  };

  const submit = () => {
    const q = term.trim();
    if (!q) return;
    setOpen(false);
    inputRef.current?.blur();
    navigate(`/search?q=${encodeURIComponent(q)}`);
  };

  return (
    <div ref={boxRef} className="relative w-full max-w-xl">
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-faint" />
        <input
          ref={inputRef}
          type="search"
          value={term}
          placeholder={t('common.search')}
          aria-label={t('common.search')}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setTerm(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(results.length - 1, a + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(-1, a - 1));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              if (active >= 0 && results[active]) go(results[active]);
              else submit();
            } else if (e.key === 'Escape') {
              setOpen(false);
              inputRef.current?.blur();
            }
          }}
          className="h-10 w-full rounded-full bg-white/10 pr-10 pl-11 text-sm text-fg ring-1 ring-transparent transition placeholder:text-faint focus:bg-base-950 focus:ring-white/20 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {term && (
          <button
            onClick={() => {
              setTerm('');
              inputRef.current?.focus();
            }}
            className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full p-1 text-faint hover:text-fg"
            aria-label={t('search.clear')}
          >
            {isFetching ? <Spinner size={14} /> : <X size={16} />}
          </button>
        )}
      </div>

      {open && debounced.length >= 2 && (
        <div className="animate-pop-in absolute top-12 right-0 left-0 z-50 overflow-hidden rounded-lg bg-base-750 shadow-2xl ring-1 ring-black/40">
          {results.length === 0 && !isFetching && (
            <div className="px-4 py-6 text-center text-sm text-muted">{t('search.noResultsFor', { query: debounced })}</div>
          )}
          {results.map((item, i) => {
            const src = imageSrc(api, cardImage(item, 'poster'), 96);
            const round = item.Type === 'Person' || item.Type === 'MusicArtist';
            return (
              <button
                key={item.Id}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(item)}
                className={clsx(
                  'flex w-full items-center gap-3 px-3 py-2 text-left transition-colors',
                  i === active ? 'bg-white/10' : 'hover:bg-white/5',
                )}
              >
                <div className={clsx('relative h-12 w-8 shrink-0 overflow-hidden bg-base-800', round ? 'h-9 w-9 rounded-full' : 'rounded')}>
                  <Img
                    src={src}
                    className="h-full w-full object-cover"
                    fallback={<div className="flex h-full items-center justify-center text-faint">{fallbackIcon(item, 16)}</div>}
                  />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{item.Name}</div>
                  <div className="truncate text-xs text-muted">{describe(item)}</div>
                </div>
              </button>
            );
          })}
          {results.length > 0 && (
            <button
              onClick={submit}
              className="block w-full border-t border-white/10 px-4 py-2.5 text-left text-sm text-accent hover:bg-white/5"
            >
              {t('layout.searchBox.seeAllResultsFor', { debounced })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
