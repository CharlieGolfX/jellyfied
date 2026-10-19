import type { BaseItemDto } from '@/api/types';
import { episodeLabel } from '@/lib/format';
import type { TitlePart } from './PlayerBars';

/**
 * What the player calls the item: a title and a line under it as plain text (for the mini player),
 * and the same in pieces that lead to their pages: the show, its season and the episode, or the film.
 */
export function playerTitles(item: BaseItemDto | undefined) {
  const title = item?.Type === 'Episode' ? item.SeriesName : item?.Name;
  const subtitle =
    item?.Type === 'Episode'
      ? `${episodeLabel(item)}${item.Name ? ` · ${item.Name}` : ''}`
      : item?.ProductionYear
        ? String(item.ProductionYear)
        : '';

  const itemPage = (id?: string | null) => (id ? `/item/${id}` : undefined);
  const titleParts: TitlePart =
    item?.Type === 'Episode'
      ? { label: item.SeriesName ?? '', to: itemPage(item.SeriesId) }
      : { label: item?.Name ?? '', to: itemPage(item?.Id) };
  const subtitleParts: TitlePart[] = [];
  if (item?.Type === 'Episode') {
    const s = item.ParentIndexNumber;
    const e = item.IndexNumber;
    if (s !== undefined && s !== null) subtitleParts.push({ label: `S${s}`, to: itemPage(item.SeasonId) });
    const episode = [
      e !== undefined && e !== null ? `E${e}${item.IndexNumberEnd ? `-${item.IndexNumberEnd}` : ''}` : '',
      item.Name ?? '',
    ].filter(Boolean);
    if (episode.length) subtitleParts.push({ label: episode.join(' · '), to: itemPage(item.Id) });
  } else if (item?.ProductionYear) {
    subtitleParts.push({ label: String(item.ProductionYear) });
  }
  return { title: title ?? '', subtitle, titleParts, subtitleParts };
}
