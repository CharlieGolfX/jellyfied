import pgsWorkerUrl from 'libpgs/dist/libpgs.worker.js?url';
import type { SubtitleMode } from '../deviceProfile';
import type { ReadBytes } from './matroska';

/** How the selected subtitle track gets on screen. */
export type SubtitleKind =
  /** No subtitles, or ones the server burned into the picture. */
  | 'none'
  /** WebVTT cues drawn by SubtitleOverlay. */
  | 'text'
  /** Styled ASS/SSA subtitles drawn by libass. */
  | 'ass'
  /** Image subtitles (PGS) drawn from the pictures in the file. */
  | 'pgs'
  /** DVD image subtitles (VobSub), read out of the video file itself. */
  | 'vobsub';

/** What a subtitle track is made of: plain text, text with its own styling, or pictures. */
export type SubtitleContent = 'text' | 'styled' | 'image';

export function isVobSub(codec: string | null | undefined): boolean {
  return /^(dvdsub|dvd_subtitle|vobsub)$/i.test(codec ?? '');
}

export function subtitleContent(codec: string | null | undefined): SubtitleContent {
  if (/^(ass|ssa)$/i.test(codec ?? '')) return 'styled';
  if (isVobSub(codec) || /^(pgssub|pgs|hdmv_pgs_subtitle|dvbsub|dvb_subtitle|xsub)$/i.test(codec ?? '')) return 'image';
  return 'text';
}

/**
 * How a track should be asked for, given where the picture is being shown. The canvases styled
 * and image subtitles are drawn on stay behind in the page: AirPlay only carries what is in the
 * picture, and so does a picture-in-picture window, apart from text the browser draws there itself.
 */
export function subtitleModeFor(
  where: { airPlay: boolean; pip: boolean; pipDrawsText: boolean },
  track: SubtitleContent | undefined,
): SubtitleMode {
  if (where.airPlay) return 'burn';
  if (where.pip && track && track !== 'text') return track === 'styled' && where.pipDrawsText ? 'text' : 'burn';
  return 'canvas';
}

/** A subtitle track that draws itself on a canvas over the video. */
export interface CanvasSubtitles {
  /** Seconds the subtitles are shifted: positive shows them later. */
  setDelay: (seconds: number) => void;
  destroy: () => void;
}

/** Format of an external subtitle track, from the address the server delivers it at. */
export function subtitleFormat(deliveryUrl: string | null | undefined): 'vtt' | 'ass' | 'pgs' {
  const ext = /\/stream\.([a-z0-9]+)(?:$|\?)/i.exec(deliveryUrl ?? '')?.[1]?.toLowerCase();
  if (ext === 'ass' || ext === 'ssa') return 'ass';
  if (ext === 'pgssub' || ext === 'sup') return 'pgs';
  return 'vtt';
}

/** Where the server serves the plain-text (WebVTT) version of a styled subtitle track. */
export function plainTextUrl(url: string): string {
  return url.replace(/(\/stream)\.(?:ass|ssa)(?=$|\?)/i, '$1.vtt');
}

/**
 * Whether a track arrives the same way in both modes, so that switching between them needs no
 * new stream. Pictures are either delivered or burned in; text only changes when all is burned in.
 */
export function sameDelivery(a: SubtitleMode, b: SubtitleMode, track: SubtitleContent): boolean {
  return a === b || (a !== 'burn' && b !== 'burn' && track !== 'image');
}

const FONT_FILE = /\.(ttf|otf|ttc|otc|woff2?)$/i;

/** Whether an attachment of a media file is a font, which styled subtitles may rely on. */
export function isFontAttachment(a: { MimeType?: string | null; FileName?: string | null; Codec?: string | null }): boolean {
  const mime = (a.MimeType ?? '').toLowerCase();
  return (
    mime.startsWith('font/') ||
    mime.includes('truetype') ||
    mime.includes('opentype') ||
    mime.includes('font-sfnt') ||
    FONT_FILE.test(a.FileName ?? '') ||
    ['ttf', 'otf'].includes((a.Codec ?? '').toLowerCase())
  );
}

function makeCanvas(layer: HTMLElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.style.position = 'absolute';
  canvas.style.pointerEvents = 'none';
  layer.appendChild(canvas);
  return canvas;
}

/**
 * Styled subtitles. `layer` has to cover the same box as the video's positioned parent: libass's
 * wrapper places the canvas over the picture by itself, from the video element's position.
 */
export async function createAssSubtitles(opts: {
  video: HTMLVideoElement;
  layer: HTMLElement;
  content: string;
  /** Addresses of the fonts attached to the file. */
  fonts: string[];
  delay: number;
}): Promise<CanvasSubtitles> {
  const { default: JASSUB } = await import('jassub');
  const canvas = makeCanvas(opts.layer);
  let instance: InstanceType<typeof JASSUB>;
  try {
    instance = new JASSUB({
      video: opts.video,
      canvas,
      subContent: opts.content,
      fonts: opts.fonts,
      // Never ask for permission to read the fonts installed on this computer.
      queryFonts: false,
      timeOffset: -opts.delay,
    });
    await instance.ready;
  } catch (err) {
    canvas.remove();
    throw err;
  }
  return {
    setDelay: (seconds) => {
      instance.timeOffset = -seconds;
      // A paused video draws no new frame, so repaint to show the change.
      void instance.resize(true).catch(() => {});
    },
    destroy: () => {
      void instance.destroy().catch(() => {});
      canvas.remove();
    },
  };
}

/**
 * Image subtitles. `layer` has to cover exactly the video element; the pictures are fitted into
 * it the way the video is (`stretched` when the picture mode stretches the video onto its box).
 */
export async function createPgsSubtitles(opts: {
  video: HTMLVideoElement;
  layer: HTMLElement;
  data: ArrayBuffer;
  delay: number;
}): Promise<CanvasSubtitles> {
  const { PgsRenderer } = await import('libpgs');
  const canvas = makeCanvas(opts.layer);
  canvas.style.inset = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  // Follows the video's own object-fit, which the layer passes down.
  canvas.style.objectFit = 'inherit';
  const renderer = new PgsRenderer({ video: opts.video, canvas, workerUrl: pgsWorkerUrl, timeOffset: -opts.delay });
  try {
    await renderer.loadFromBuffer(opts.data);
  } catch (err) {
    renderer.dispose();
    canvas.remove();
    throw err;
  }
  return {
    setDelay: (seconds) => {
      renderer.timeOffset = -seconds;
    },
    destroy: () => {
      renderer.dispose();
      canvas.remove();
    },
  };
}

/**
 * DVD image subtitles, fetched piece by piece from the video file as the video gets to them.
 * `layer` is the same one PGS subtitles use. Rejects when the file can't be read that way.
 */
export async function createVobSubSubtitles(opts: {
  video: HTMLVideoElement;
  layer: HTMLElement;
  /** Reads a range of the video file. */
  read: ReadBytes;
  /** The server's number for the subtitle stream, and its place among the file's VobSub streams. */
  streamIndex: number;
  position: number;
  delay: number;
}): Promise<CanvasSubtitles> {
  const { openVobSubTrack } = await import('./vobsub');
  const track = await openVobSubTrack(opts.read, { streamIndex: opts.streamIndex, position: opts.position });
  const { video } = opts;
  const canvas = makeCanvas(opts.layer);
  canvas.style.inset = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.objectFit = 'inherit';
  const context = canvas.getContext('2d');
  const scratch = document.createElement('canvas');
  let delay = opts.delay;
  let shown: unknown = undefined;
  let frame = 0;
  const draw = () => {
    frame = requestAnimationFrame(draw);
    const seconds = video.currentTime - delay;
    track.prepare(seconds);
    const event = track.at(seconds);
    // The canvas has the video's shape, so that it is fitted into the player the way the video is.
    // DVD pixels aren't square: the pictures are stretched from their frame onto it.
    const width = video.videoWidth || track.header.width || 720;
    const height = video.videoHeight || track.header.height || 480;
    if (event === shown && canvas.width === width && canvas.height === height) return;
    shown = event;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    if (!context) return;
    context.clearRect(0, 0, width, height);
    if (!event) return;
    const { image } = event;
    scratch.width = image.width;
    scratch.height = image.height;
    scratch.getContext('2d')?.putImageData(new ImageData(image.rgba as ImageDataArray, image.width, image.height), 0, 0);
    const scaleX = width / (track.header.width || width);
    const scaleY = height / (track.header.height || height);
    context.drawImage(scratch, image.x * scaleX, image.y * scaleY, image.width * scaleX, image.height * scaleY);
  };
  frame = requestAnimationFrame(draw);
  return {
    setDelay: (seconds) => {
      delay = seconds;
    },
    destroy: () => {
      cancelAnimationFrame(frame);
      track.close();
      canvas.remove();
    },
  };
}
