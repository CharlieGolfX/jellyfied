import type { JellyfinApi } from '@/api/client';
import { ApiError } from '@/api/client';
import type { BaseItemDto, ItemsResult } from '@/api/types';
import { appPath } from './basePath';
import { readPlaytimeSetting, syncPlaytime, type Playtime } from './playtime';
import { RANGES, summarize, watchStats, type Range, type StatsSummary } from './watchStats';

/**
 * Comparing Your stats with the other people on the server, anonymously: Jellyfied's container
 * (docker/stats-compare.js) keeps the summaries of those who take part and only ever tells each
 * of them about themselves. Taking part is a choice, kept with the account's playtime.
 */

export const COMPARE_SETTING = 'compare';
const UPLOADED_KEY = 'jellyfied.stats.uploaded';
const UPLOAD_EVERY = 20 * 3600_000;

export type Statement =
  { type: 'most'; metric: Metric } | { type: 'more'; metric: Metric; share: number } | { type: 'mostGenre'; genre: string };
export type Metric = 'video' | 'music' | 'films' | 'episodes' | 'songs';

export interface Comparison {
  joined: boolean;
  enough?: boolean;
  participants: number;
  minUsers: number;
  statements?: Statement[];
}

async function request<T>(api: JellyfinApi, method: 'GET' | 'POST' | 'DELETE', range?: Range, body?: unknown): Promise<T> {
  const init: RequestInit = {
    method,
    headers: { Authorization: api.authorizationHeader(), 'Content-Type': 'application/json', Accept: 'application/json' },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(appPath(`/jellyfied-api/stats${range ? `?range=${range}` : ''}`), init);
  let data: T | null = null;
  try {
    data = (await res.json()) as T;
  } catch {
    /* not the container answering, e.g. the dev server without a server to ask */
  }
  if (!res.ok || !data) throw new ApiError(res.ok ? 404 : res.status, 'Comparisons are not available');
  return data;
}

export const getComparison = (api: JellyfinApi, range: Range) => request<Comparison>(api, 'GET', range);

/** What the page and the comparisons are worked out from: the playtime and the played videos' details. */
export interface StatsSource {
  playtime: Playtime;
  items: Map<string, BaseItemDto>;
  seriesGenres: Map<string, string[]>;
}

export async function loadStatsSource(api: JellyfinApi, userId: string, signal?: AbortSignal): Promise<StatsSource> {
  // Saving this browser's latest first, so what was just played is in.
  const playtime = await syncPlaytime(api, userId);
  const ids = [...new Set(Object.values(playtime.days).flatMap((d) => Object.keys(d.i ?? {})))];
  const items: BaseItemDto[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    items.push(
      ...(await api.get<ItemsResult>('/Items', { userId, ids: chunk.join(','), fields: 'Genres', enableImages: false }, signal)).Items,
    );
  }
  const seriesIds = [...new Set(items.map((i) => i.SeriesId).filter((id): id is string => Boolean(id)))];
  const series: BaseItemDto[] = [];
  for (let i = 0; i < seriesIds.length; i += 100) {
    const chunk = seriesIds.slice(i, i + 100);
    series.push(
      ...(await api.get<ItemsResult>('/Items', { userId, ids: chunk.join(','), fields: 'Genres', enableImages: false }, signal)).Items,
    );
  }
  return {
    playtime,
    items: new Map(items.map((i) => [i.Id, i])),
    seriesGenres: new Map(series.map((s) => [s.Id, s.Genres ?? []])),
  };
}

export function summaries(source: StatsSource, now = new Date()): Record<Range, StatsSummary> {
  return Object.fromEntries(
    RANGES.map((range) => [range, summarize(watchStats(source.playtime, source.items, source.seriesGenres, range, now))]),
  ) as Record<Range, StatsSummary>;
}

/** Sends this account's summaries, so the others' comparisons include them (and theirs are fresh). */
export async function shareSummaries(api: JellyfinApi, userId: string, source: StatsSource) {
  await request(api, 'POST', undefined, { summaries: summaries(source) });
  try {
    localStorage.setItem(`${UPLOADED_KEY}.${userId}`, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export async function comparing(api: JellyfinApi, userId: string): Promise<boolean> {
  return (await readPlaytimeSetting(api, userId, COMPARE_SETTING)) === 'on';
}

/** Starts or stops taking part. Stopping removes this account's summaries from the container. */
export async function setComparing(api: JellyfinApi, userId: string, on: boolean, source?: StatsSource) {
  await syncPlaytime(api, userId, { [COMPARE_SETTING]: on ? 'on' : null });
  if (on) await shareSummaries(api, userId, source ?? (await loadStatsSource(api, userId)));
  else await request(api, 'DELETE');
}

/** Once a day, for those taking part: keeps their summaries current while they don't open Your stats. */
export async function shareDaily(api: JellyfinApi, userId: string) {
  let last = 0;
  try {
    last = Number(localStorage.getItem(`${UPLOADED_KEY}.${userId}`)) || 0;
  } catch {
    /* ignore */
  }
  if (Date.now() - last < UPLOAD_EVERY) return;
  if (!(await comparing(api, userId))) return;
  await shareSummaries(api, userId, await loadStatsSource(api, userId));
}
