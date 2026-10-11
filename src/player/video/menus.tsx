import clsx from 'clsx';
import { ListVideo, Scaling, Settings2, Subtitles } from 'lucide-react';
import type { MediaStream } from '@/api/types';
import { useApi } from '@/auth/AuthProvider';
import { Img } from '@/components/ui/States';
import { formatClock } from '@/lib/format';
import { AUDIO_DELAY_STEP, MAX_AUDIO_DELAY } from '../audioDelay';
import { MAX_PICTURE_ZOOM, PICTURE_ASPECTS, PICTURE_FITS, type PictureAspect, type PictureFit } from '../picture';
import { clearSleepTimer, SLEEP_TIMER_MINUTES, sleepAtEndOfVideo, startSleepTimer, useSleepTimer } from '../sleepTimer';
import { SUBTITLE_SIZES, useSubtitleStyle } from '../subtitleStyle';
import { ControlButton, DelayControl, Panel, PanelChip, PanelOption, PanelSection } from './controls';
import {
  formatAudioDelay,
  formatSubtitleDelay,
  MAX_SUBTITLE_DELAY,
  QUALITY_OPTIONS,
  SPEED_OPTIONS,
  streamName,
  SUBTITLE_DELAY_SLIDER,
  type ActiveStream,
} from './shared';

/** The control-bar buttons that open a menu, each with its menu. */
interface MenuProps {
  open: boolean;
  onToggle: () => void;
}

export interface Chapter {
  index: number;
  /** Seconds. */
  start: number;
  name: string;
  tag?: string | null;
}

export function ChaptersMenu({
  open,
  onToggle,
  itemId,
  chapters,
  current,
  onSelect,
}: MenuProps & { itemId: string; chapters: Chapter[]; current: number; onSelect: (chapter: Chapter) => void }) {
  const api = useApi();
  return (
    <div className="relative">
      <ControlButton label="Chapters" onClick={onToggle} active={open}>
        <ListVideo size={24} />
      </ControlButton>
      {open && (
        <Panel wide>
          <PanelSection title="Chapters">
            {chapters.map((c) => (
              <button
                key={c.index}
                onClick={() => onSelect(c)}
                aria-current={c.index === current}
                className={clsx(
                  'flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-white/10',
                  c.index === current ? 'text-accent' : 'text-white/90',
                )}
              >
                {c.tag && (
                  <Img
                    src={api.imageUrl(itemId, 'Chapter', { index: c.index, tag: c.tag, maxWidth: 240 })}
                    className="aspect-video w-24 shrink-0 rounded-sm bg-black object-cover"
                  />
                )}
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <span className="shrink-0 text-xs text-white/50 tabular-nums">{formatClock(c.start)}</span>
              </button>
            ))}
          </PanelSection>
        </Panel>
      )}
    </div>
  );
}

export function SubtitlesMenu({
  open,
  onToggle,
  stream,
  subtitleStreams,
  onSelect,
  textSubtitles,
  delay,
  onDelayChange,
}: MenuProps & {
  stream: ActiveStream | null;
  subtitleStreams: MediaStream[];
  /** -1 turns subtitles off. */
  onSelect: (index: number) => void;
  /** A text subtitle track is attached, so timing and size can be adjusted. */
  textSubtitles: boolean;
  delay: number;
  onDelayChange: (seconds: number) => void;
}) {
  const [subtitleStyle, setSubtitleStyle] = useSubtitleStyle();
  const subIndex = stream?.subIndex ?? -1;
  return (
    <div className="relative">
      <ControlButton label="Subtitles" onClick={onToggle} active={open || subIndex >= 0}>
        <Subtitles size={24} />
      </ControlButton>
      {open && (
        <Panel>
          <PanelSection title="Subtitles">
            <PanelOption selected={subIndex === -1} onClick={() => onSelect(-1)}>
              None
            </PanelOption>
            {subtitleStreams.map((s) => (
              <PanelOption key={s.Index} selected={stream?.subIndex === s.Index} onClick={() => onSelect(s.Index)}>
                {streamName(s)}
                {s.DeliveryMethod === 'Encode' && <span className="ml-2 text-xs text-white/40">burn-in</span>}
              </PanelOption>
            ))}
          </PanelSection>
          {subIndex >= 0 && (
            <>
              <PanelSection title="Subtitle delay">
                {textSubtitles ? (
                  <DelayControl
                    value={delay}
                    onChange={onDelayChange}
                    min={-MAX_SUBTITLE_DELAY}
                    max={MAX_SUBTITLE_DELAY}
                    sliderMin={-SUBTITLE_DELAY_SLIDER}
                    sliderMax={SUBTITLE_DELAY_SLIDER}
                    step={0.1}
                    format={formatSubtitleDelay}
                    lessLabel="Show subtitles earlier"
                    moreLabel="Show subtitles later"
                    sliderLabel="Subtitle delay"
                    testId="subtitle-delay"
                  />
                ) : (
                  <div className="px-4 pt-1 pb-2 text-xs text-white/50">Not available for subtitles that are burned into the video.</div>
                )}
              </PanelSection>
              {textSubtitles && (
                <PanelSection title="Text size">
                  <div className="flex flex-wrap gap-1 px-4 pt-1 pb-2">
                    {SUBTITLE_SIZES.map((sz) => (
                      <PanelChip key={sz.value} selected={subtitleStyle.size === sz.value} onClick={() => setSubtitleStyle({ size: sz.value })} title={sz.label}>
                        {sz.short}
                      </PanelChip>
                    ))}
                  </div>
                  <div className="px-4 pb-2 text-xs text-white/40">More subtitle options are under Account settings.</div>
                </PanelSection>
              )}
            </>
          )}
        </Panel>
      )}
    </div>
  );
}

export function PictureMenu({
  open,
  onToggle,
  fit,
  aspect,
  zoom,
  changed,
  onFitChange,
  onAspectChange,
  onZoomChange,
}: MenuProps & {
  fit: PictureFit;
  aspect: PictureAspect;
  zoom: number;
  /** Anything differs from the normal picture. */
  changed: boolean;
  onFitChange: (fit: PictureFit) => void;
  onAspectChange: (aspect: PictureAspect) => void;
  onZoomChange: (zoom: number) => void;
}) {
  return (
    <div className="relative">
      <ControlButton label="Picture" onClick={onToggle} active={open || changed}>
        <Scaling size={24} />
      </ControlButton>
      {open && (
        <Panel>
          <PanelSection title="Zoom mode">
            <div className="flex flex-wrap gap-1 px-4 pt-1 pb-2">
              {PICTURE_FITS.map((f) => (
                <PanelChip key={f.value} selected={fit === f.value} onClick={() => onFitChange(f.value)} title={f.title}>
                  {f.label}
                </PanelChip>
              ))}
            </div>
          </PanelSection>
          <PanelSection title="Aspect ratio">
            <div className="flex flex-wrap gap-1 px-4 pt-1 pb-2">
              {PICTURE_ASPECTS.map((a) => (
                <PanelChip
                  key={a.value}
                  selected={fit !== 'stretch' && aspect === a.value}
                  onClick={() => {
                    onAspectChange(a.value);
                    // Stretch ignores the aspect ratio, so picking one leaves that mode.
                    if (fit === 'stretch') onFitChange('fit');
                  }}
                >
                  {a.label}
                </PanelChip>
              ))}
            </div>
          </PanelSection>
          <PanelSection title="Zoom">
            <div className="flex items-center gap-3 px-4 pt-1 pb-2">
              <input
                type="range"
                min={1}
                max={MAX_PICTURE_ZOOM}
                step={0.05}
                value={zoom}
                onChange={(e) => onZoomChange(Number(e.target.value))}
                aria-label="Zoom"
                className="min-w-0 flex-1"
              />
              <span className="w-12 text-right text-sm tabular-nums" data-testid="picture-zoom">
                {Math.round(zoom * 100)}%
              </span>
            </div>
          </PanelSection>
          {changed && (
            <div className="border-t border-white/10 py-1">
              <PanelOption
                selected={false}
                onClick={() => {
                  onFitChange('fit');
                  onAspectChange('auto');
                  onZoomChange(1);
                }}
              >
                Reset picture
              </PanelOption>
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}

export function SettingsMenu({
  open,
  onToggle,
  stream,
  audioStreams,
  onAudioSelect,
  audioDelay,
  onAudioDelayChange,
  audioDelayAvailable,
  inSync,
  speed,
  onSpeedChange,
  maxBitrate,
  onQualityChange,
  showInfo,
  onToggleInfo,
}: MenuProps & {
  stream: ActiveStream | null;
  audioStreams: MediaStream[];
  onAudioSelect: (index: number) => void;
  audioDelay: number;
  onAudioDelayChange: (seconds: number) => void;
  audioDelayAvailable: boolean;
  /** A SyncPlay group always plays at normal speed. */
  inSync: boolean;
  speed: number;
  onSpeedChange: (speed: number) => void;
  maxBitrate: number;
  onQualityChange: (bitrate: number) => void;
  showInfo: boolean;
  onToggleInfo: () => void;
}) {
  const sleep = useSleepTimer();
  return (
    <div className="relative">
      <ControlButton label="Settings" onClick={onToggle} active={open}>
        <Settings2 size={24} />
      </ControlButton>
      {open && (
        <Panel>
          {audioStreams.length > 0 && (
            <PanelSection title="Audio">
              {audioStreams.map((s) => (
                <PanelOption key={s.Index} selected={stream?.audioIndex === s.Index} onClick={() => onAudioSelect(s.Index)}>
                  {streamName(s)}
                </PanelOption>
              ))}
            </PanelSection>
          )}
          {audioStreams.length > 0 && (
            <PanelSection title="Audio delay">
              {audioDelayAvailable ? (
                <>
                  <DelayControl
                    value={audioDelay}
                    onChange={onAudioDelayChange}
                    min={0}
                    max={MAX_AUDIO_DELAY}
                    sliderMin={0}
                    sliderMax={MAX_AUDIO_DELAY}
                    step={AUDIO_DELAY_STEP}
                    format={formatAudioDelay}
                    lessLabel="Less audio delay"
                    moreLabel="More audio delay"
                    sliderLabel="Audio delay"
                    testId="audio-delay"
                  />
                  <div className="px-4 pb-2 text-xs text-white/40">
                    Holds the sound back when it is ahead of the picture. A browser can’t play sound earlier than the picture.
                  </div>
                </>
              ) : (
                <div className="px-4 pt-1 pb-2 text-xs text-white/50">Not available in this browser.</div>
              )}
            </PanelSection>
          )}
          {!inSync && (
            <PanelSection title="Speed">
              <div className="flex flex-wrap gap-1 px-4 pt-1 pb-2">
                {SPEED_OPTIONS.map((r) => (
                  <PanelChip key={r} selected={speed === r} onClick={() => onSpeedChange(r)}>
                    {r === 1 ? 'Normal' : `${r}×`}
                  </PanelChip>
                ))}
              </div>
            </PanelSection>
          )}
          <PanelSection title="Sleep timer">
            <div className="flex flex-wrap gap-1 px-4 pt-1 pb-2">
              <PanelChip selected={!sleep.endsAt && !sleep.endOfVideo} onClick={clearSleepTimer}>
                Off
              </PanelChip>
              {SLEEP_TIMER_MINUTES.map((m) => (
                <PanelChip key={m} selected={false} onClick={() => startSleepTimer(m)}>
                  {m} min
                </PanelChip>
              ))}
              <PanelChip selected={sleep.endOfVideo} onClick={sleepAtEndOfVideo}>
                End of video
              </PanelChip>
            </div>
          </PanelSection>
          <PanelSection title="Quality">
            {QUALITY_OPTIONS.map((q) => (
              <PanelOption key={q.value} selected={maxBitrate === q.value} onClick={() => onQualityChange(q.value)}>
                {q.label}
              </PanelOption>
            ))}
          </PanelSection>
          <div className="border-t border-white/10 py-1">
            <PanelOption selected={showInfo} onClick={onToggleInfo}>
              Playback info
            </PanelOption>
          </div>
          {stream && (
            <div className="border-t border-white/10 px-4 py-3 text-xs leading-relaxed text-white/50">
              <div>
                {stream.method === 'Transcode' ? 'Transcoding' : stream.method === 'DirectPlay' ? 'Direct playing' : 'Direct streaming'}{' '}
                {stream.source.Container?.toUpperCase()}
              </div>
              {stream.transcodeReasons.length > 0 && <div>Reason: {stream.transcodeReasons.join(', ')}</div>}
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
