import pgsWorkerUrl from 'libpgs/dist/libpgs.worker.js?url';

/** How the selected subtitle track gets on screen. */
export type SubtitleKind =
  /** No subtitles, or ones the server burned into the picture. */
  | 'none'
  /** WebVTT cues drawn by SubtitleOverlay. */
  | 'text'
  /** Styled ASS/SSA subtitles drawn by libass. */
  | 'ass'
  /** Image subtitles (PGS) drawn from the pictures in the file. */
  | 'pgs';

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
