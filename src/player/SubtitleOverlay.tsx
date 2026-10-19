import { useEffect, useRef, useState, type RefObject } from 'react';
import { subtitleLineCss, subtitleScale, useSubtitleStyle } from './subtitleStyle';

function cueHtml(cue: VTTCue): string {
  try {
    // getCueAsHTML() only yields the safe WebVTT tags (<i>, <b>, <u>, <ruby>, spans), never scripts.
    const holder = document.createElement('div');
    holder.appendChild(cue.getCueAsHTML());
    return holder.innerHTML;
  } catch {
    const holder = document.createElement('div');
    holder.textContent = cue.text;
    return holder.innerHTML.replace(/\n/g, '<br>');
  }
}

/**
 * Draws the active text-subtitle cues over the video. Doing this ourselves (instead of the browser's
 * native rendering) is what makes the delay and appearance settings possible, and lets the text move
 * out of the way of the controls.
 */
export function SubtitleOverlay({
  trackRef,
  videoRef,
  delay,
  raised,
  compact,
}: {
  trackRef: RefObject<HTMLTrackElement | null>;
  videoRef: RefObject<HTMLVideoElement | null>;
  /** Seconds to shift the subtitles: positive shows them later, negative earlier. */
  delay: number;
  /** Lift the text above the player controls. */
  raised: boolean;
  /** Mini player: smaller text. */
  compact: boolean;
}) {
  const [style] = useSubtitleStyle();
  const [lines, setLines] = useState<string[]>([]);
  const shownKey = useRef('');

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let timer: number | undefined;
    // Works out the cues to show now, and while playing, looks again when the next one starts or ends.
    const update = () => {
      window.clearTimeout(timer);
      const cues = trackRef.current?.track.cues ?? [];
      const t = video.currentTime - delay;
      const active: VTTCue[] = [];
      let next = Infinity;
      for (let i = 0; i < cues.length; i++) {
        const cue = cues[i] as VTTCue;
        if (cue.startTime <= t && t < cue.endTime) active.push(cue);
        if (cue.startTime > t) next = Math.min(next, cue.startTime);
        else if (cue.endTime > t) next = Math.min(next, cue.endTime);
      }
      if (!video.paused && next < Infinity) {
        timer = window.setTimeout(update, ((next - t) / (video.playbackRate || 1)) * 1000 + 10);
      }
      const key = active.map((c) => `${c.startTime}|${c.endTime}|${c.text}`).join('\n');
      if (key === shownKey.current) return;
      shownKey.current = key;
      setLines(active.map(cueHtml));
    };
    // "cuechange" and "load" come from the <track>, which is replaced when another track is picked;
    // listening while they pass through the video (capture) catches every one.
    const capture = ['cuechange', 'load'];
    const events = ['play', 'pause', 'playing', 'waiting', 'seeked', 'ratechange', 'emptied', 'loadeddata'];
    capture.forEach((e) => video.addEventListener(e, update, true));
    events.forEach((e) => video.addEventListener(e, update));
    update();
    return () => {
      window.clearTimeout(timer);
      capture.forEach((e) => video.removeEventListener(e, update, true));
      events.forEach((e) => video.removeEventListener(e, update));
    };
  }, [trackRef, videoRef, delay]);

  if (lines.length === 0) return null;
  const scale = subtitleScale(style);
  return (
    <div
      data-testid="subtitle-overlay"
      className="pointer-events-none absolute inset-x-0 z-[5] flex flex-col items-center gap-1 px-[6%] text-center transition-[bottom] duration-200"
      style={{
        bottom: compact ? '8%' : raised ? '9.5rem' : '6%',
        fontSize: compact ? `${12 * scale}px` : `calc(${scale} * clamp(16px, min(4.4vh, 2.6vw), 56px))`,
        lineHeight: 1.3,
        fontWeight: 600,
      }}
    >
      {lines.map((html, i) => (
        <div
          key={i}
          className="max-w-full rounded-sm px-[0.35em] whitespace-pre-line"
          style={subtitleLineCss(style)}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ))}
    </div>
  );
}
