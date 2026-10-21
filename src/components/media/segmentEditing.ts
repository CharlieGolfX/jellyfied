import type { MediaSegment } from '@/api/types';
import { formatClock } from '@/lib/format';

/** The kinds of segment an editor can set; Jellyfin's "Unknown" is not one of them. */
export const SEGMENT_TYPES = ['Intro', 'Outro', 'Recap', 'Preview', 'Commercial'] as const;
export type EditableSegmentType = (typeof SEGMENT_TYPES)[number];

/** A segment as it is being edited: times as typed. */
export interface SegmentDraft {
  /** Kept for segments that exist on the server, so they keep their identity. */
  id?: string;
  type: EditableSegmentType;
  start: string;
  end: string;
}

const TICKS_PER_SECOND = 10_000_000;

/** "1:23", "1:02:03", "83" or "83.5" to seconds; null when it isn't a time. */
export function parseTime(text: string): number | null {
  const parts = text.trim().split(':');
  if (parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
  // Only the seconds may have a fraction, and minutes and seconds after a colon stay under 60.
  if (parts.slice(0, -1).some((p) => p.includes('.'))) return null;
  if (parts.slice(1).some((p) => Number(p) >= 60)) return null;
  return parts.reduce((total, p) => total * 60 + Number(p), 0);
}

/** Seconds as "m:ss" or "h:mm:ss", with tenths when there are any. */
export function formatTime(seconds: number): string {
  const whole = Math.floor(seconds);
  const tenths = Math.round((seconds - whole) * 10);
  return tenths ? `${formatClock(whole)}.${tenths}` : formatClock(whole);
}

export function toDraft(segment: MediaSegment): SegmentDraft {
  return {
    id: segment.Id,
    type: (SEGMENT_TYPES as readonly string[]).includes(segment.Type) ? (segment.Type as EditableSegmentType) : 'Intro',
    start: formatTime(segment.StartTicks / TICKS_PER_SECOND),
    end: formatTime(segment.EndTicks / TICKS_PER_SECOND),
  };
}

export type DraftProblem = 'badStart' | 'badEnd' | 'endBeforeStart' | 'pastTheEnd';

/** What is wrong with a row, if anything. `duration` is the item's length in seconds, when known. */
export function draftProblem(draft: SegmentDraft, duration?: number): DraftProblem | null {
  const start = parseTime(draft.start);
  const end = parseTime(draft.end);
  if (start === null) return 'badStart';
  if (end === null) return 'badEnd';
  if (end <= start) return 'endBeforeStart';
  if (duration && start >= duration) return 'pastTheEnd';
  return null;
}

/** The rows as the server takes them: in order of their start. Assumes `draftProblem` found nothing. */
export function toSegments(drafts: SegmentDraft[]) {
  return drafts
    .map((d) => ({
      ...(d.id ? { Id: d.id } : {}),
      Type: d.type,
      StartTicks: Math.round(parseTime(d.start)! * TICKS_PER_SECOND),
      EndTicks: Math.round(parseTime(d.end)! * TICKS_PER_SECOND),
    }))
    .sort((a, b) => a.StartTicks - b.StartTicks);
}
