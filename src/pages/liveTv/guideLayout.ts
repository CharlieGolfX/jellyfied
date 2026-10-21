import type { BaseItemDto } from '@/api/types';

/** Width of an hour in the guide, in pixels. */
export const HOUR_PX = 240;
/** How much of the day the guide shows at once, and how far Earlier and Later move it. */
export const WINDOW_HOURS = 8;
export const STEP_HOURS = 4;

const HALF_HOUR = 30 * 60_000;
const HOUR = 2 * HALF_HOUR;

/** Where a guide that should show `time` starts: the half hour before it. */
export function windowStart(time: number): number {
  return Math.floor(time / HALF_HOUR) * HALF_HOUR;
}

/** The half hours along the top of the guide. */
export function halfHours(start: number, hours = WINDOW_HOURS): number[] {
  return Array.from({ length: hours * 2 }, (_, i) => start + i * HALF_HOUR);
}

/** Pixels from the guide's start to `time`. */
export function offsetOf(time: number, start: number): number {
  return ((time - start) / HOUR) * HOUR_PX;
}

export interface PlacedProgram {
  program: BaseItemDto;
  left: number;
  width: number;
  /** It began before the window or runs on after it. */
  cutStart: boolean;
  cutEnd: boolean;
}

/**
 * A channel's programmes placed in the window: cut to it, in order, and without overlaps (a
 * programme that starts before the previous one ended is moved up to that end).
 */
export function placePrograms(programs: BaseItemDto[], start: number, hours = WINDOW_HOURS): PlacedProgram[] {
  const end = start + hours * HOUR;
  const placed: PlacedProgram[] = [];
  let reached = start;
  const sorted = programs
    .map((program) => ({ program, from: Date.parse(program.StartDate ?? ''), to: Date.parse(program.EndDate ?? '') }))
    .filter((p) => Number.isFinite(p.from) && Number.isFinite(p.to) && p.to > start && p.from < end && p.to > p.from)
    .sort((a, b) => a.from - b.from);
  for (const p of sorted) {
    const from = Math.max(p.from, start, reached);
    const to = Math.min(p.to, end);
    if (to <= from) continue;
    placed.push({
      program: p.program,
      left: offsetOf(from, start),
      width: offsetOf(to, start) - offsetOf(from, start),
      cutStart: p.from < start,
      cutEnd: p.to > end,
    });
    reached = to;
  }
  return placed;
}
