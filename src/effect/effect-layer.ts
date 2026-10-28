import type { EffectSettings, PaletteId, Rgb, UpdateKind } from '../types';
import {
  ASCII_CHARS,
  analyzeLuminance,
  asciiAlpha,
  asciiFontSize,
  asciiSteps,
  asciiTone,
  bayerThreshold,
  canvasScale,
  coverRect,
  ditherBlend,
  ditherLevels,
  ditherPatternScale,
  ditherPixelSize,
  liftInk,
  luminance,
  maskAlphas,
  paletteLut,
  pushSaturation,
  quantizeColor,
  recolor,
  samplerSize,
} from './math';

const REDRAW_MS = 72;
const CROSSFADE_MS = 150;
const MONO_FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

interface Sampler {
  width: number;
  height: number;
  /** Palette-mapped pixels. ASCII tone and ink read these. */
  data: Uint8ClampedArray;
  /** Cover-fit pixels before the palette, so Bayer can still see photo contrast. */
  raw: Uint8ClampedArray;
  low: number;
  high: number;
}

interface GlyphMetrics {
  font: string;
  width: number;
  height: number;
}

type MediaSource = HTMLImageElement | HTMLVideoElement;

/**
 * Canvas painted over a wallpaper.
 * ASCII draws the recolored picture, then the mask, then glyphs.
 * Dither draws the Bayer picture, then the mask.
 * Still images redraw 72ms after a control change.
 * Video redraws on every presented frame via requestVideoFrameCallback while it
 * is playing and on screen, with requestAnimationFrame if that callback is
 * missing or does not arrive. The loop stops when the tab is hidden, the video
 * is paused, or the stage is off screen.
 */
export class EffectLayer {
  private readonly viewCtx: CanvasRenderingContext2D | null;
  private readonly work: HTMLCanvasElement;
  private readonly from: HTMLCanvasElement;
  private readonly samplerCanvas: HTMLCanvasElement;
  private readonly ditherCanvas: HTMLCanvasElement;
  private readonly measure: CanvasRenderingContext2D | null;
  private readonly observer: ResizeObserver;
  private readonly onResize: () => void;
  private readonly onVisibility: () => void;

  private settings: EffectSettings | null = null;
  private source: MediaSource | null = null;
  private video: HTMLVideoElement | null = null;
  private videoFrameId = 0;
  private videoRafId = 0;
  private videoWatchdog = 0;
  /** Stay on requestVideoFrameCallback until a callback fails to arrive. */
  private videoMode: 'rvfc' | 'raf' = 'rvfc';
  private lastSampleTime = -1;
  private onScreen = true;
  private readonly videoListeners: Array<{ type: string; fn: () => void }> = [];
  private readonly screenObserver: IntersectionObserver;

  private sampler: Sampler | null = null;
  private samplerKey = '';
  private glyphCache: GlyphMetrics | null = null;
  private hasFrame = false;
  private fadeRaf = 0;
  private redrawTimer = 0;
  private resizeTimer = 0;
  private lastPaint = 0;
  private destroyed = false;

  constructor(
    private readonly host: HTMLElement,
    private readonly canvas: HTMLCanvasElement,
  ) {
    this.viewCtx = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
    this.work = document.createElement('canvas');
    this.from = document.createElement('canvas');
    this.samplerCanvas = document.createElement('canvas');
    this.ditherCanvas = document.createElement('canvas');
    this.measure = document.createElement('canvas').getContext('2d');
    this.observer = new ResizeObserver(() => this.queueResize());
    this.observer.observe(host);
    this.screenObserver = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      this.onScreen = entry.isIntersecting;
      if (this.onScreen) this.scheduleVideo();
      else this.cancelVideoLoop();
    });
    this.screenObserver.observe(host);
    this.onResize = () => this.queueResize();
    this.onVisibility = () => {
      if (document.hidden) this.cancelVideoLoop();
      else this.scheduleVideo();
    };
    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  setSettings(settings: EffectSettings, kind: UpdateKind): void {
    this.settings = settings;
    if (!this.source || this.destroyed) return;
    if (kind === 'discrete') this.queueDiscrete();
    else this.queueContinuous();
  }

  setSource(source: MediaSource): void {
    if (this.destroyed) return;
    this.detachVideo();
    this.source = source;
    this.samplerKey = '';
    if (source instanceof HTMLVideoElement) this.attachVideo(source);
    if (this.settings) this.queueDiscrete();
  }

  destroy(): void {
    this.destroyed = true;
    window.clearTimeout(this.redrawTimer);
    window.clearTimeout(this.resizeTimer);
    this.stopFade();
    this.detachVideo();
    this.observer.disconnect();
    this.screenObserver.disconnect();
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  private queueDiscrete(): void {
    window.clearTimeout(this.redrawTimer);
    this.redrawTimer = 0;
    this.renderNow(true);
  }

  private queueContinuous(): void {
    const elapsed = performance.now() - this.lastPaint;
    if (elapsed >= REDRAW_MS) {
      this.lastPaint = performance.now();
      this.renderNow(false);
      return;
    }
    window.clearTimeout(this.redrawTimer);
    this.redrawTimer = window.setTimeout(() => {
      this.redrawTimer = 0;
      this.lastPaint = performance.now();
      this.renderNow(false);
    }, REDRAW_MS - elapsed);
  }

  private queueResize(): void {
    window.clearTimeout(this.resizeTimer);
    this.resizeTimer = window.setTimeout(() => {
      this.resizeTimer = 0;
      if (this.settings && this.source) this.renderNow(false);
    }, REDRAW_MS);
  }

  private prefersReducedMotion(): boolean {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  private renderNow(crossfade: boolean): void {
    if (this.destroyed || !this.settings || !this.source) return;
    const fade = crossfade && this.hasFrame && !this.prefersReducedMotion();
    this.draw(fade);
    this.hasFrame = true;
  }

  private draw(crossfade: boolean): void {
    this.stopFade();
    const settings = this.settings;
    const view = this.viewCtx;
    if (!settings || !view) return;
    const rect = this.host.getBoundingClientRect();
    const cssWidth = rect.width;
    const cssHeight = rect.height;
    if (cssWidth < 2 || cssHeight < 2) return;

    const scale = canvasScale(window.devicePixelRatio || 1, cssWidth, cssHeight);
    const pixelWidth = Math.max(1, Math.round(cssWidth * scale));
    const pixelHeight = Math.max(1, Math.round(cssHeight * scale));
    let fade = crossfade;
    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      fade = false;
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
    }
    this.prepare(this.work, pixelWidth, pixelHeight);
    this.prepare(this.from, pixelWidth, pixelHeight);

    if (fade) {
      const fromCtx = this.from.getContext('2d');
      fromCtx?.setTransform(1, 0, 0, 1, 0, 0);
      fromCtx?.clearRect(0, 0, pixelWidth, pixelHeight);
      fromCtx?.drawImage(this.canvas, 0, 0);
    }

    const workCtx = this.work.getContext('2d', { willReadFrequently: true });
    if (!workCtx) return;
    workCtx.setTransform(1, 0, 0, 1, 0, 0);
    workCtx.clearRect(0, 0, pixelWidth, pixelHeight);
    workCtx.setTransform(scale, 0, 0, scale, 0, 0);

    const sampler = this.ensureSampler(settings.palette, cssWidth, cssHeight);
    if (!sampler) return;

    if (settings.filter === 'dither') {
      this.drawDither(workCtx, cssWidth, cssHeight, sampler, settings);
      this.drawMask(workCtx, cssWidth, cssHeight, settings.mask);
    } else {
      this.drawPicture(workCtx, this.work, scale, cssWidth, cssHeight, settings.palette);
      this.drawMask(workCtx, cssWidth, cssHeight, settings.mask);
      this.drawAscii(workCtx, cssWidth, cssHeight, sampler, settings);
    }

    if (fade) {
      const started = performance.now();
      const step = (now: number): void => {
        this.fadeRaf = 0;
        const t = Math.min(1, (now - started) / CROSSFADE_MS);
        this.composite(this.from, this.work, t);
        if (t < 1) this.fadeRaf = requestAnimationFrame(step);
      };
      this.fadeRaf = requestAnimationFrame(step);
      return;
    }
    this.blit(this.work);
  }

  private prepare(canvas: HTMLCanvasElement, width: number, height: number): void {
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  private stopFade(): void {
    if (this.fadeRaf) {
      cancelAnimationFrame(this.fadeRaf);
      this.fadeRaf = 0;
    }
  }

  private blit(source: HTMLCanvasElement): void {
    this.composite(source, source, 1);
  }

  private composite(before: HTMLCanvasElement, after: HTMLCanvasElement, amount: number): void {
    const ctx = this.viewCtx;
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (amount < 1) {
      ctx.globalAlpha = 1 - amount;
      ctx.drawImage(before, 0, 0);
    }
    ctx.globalAlpha = amount;
    ctx.drawImage(after, 0, 0);
    ctx.globalAlpha = 1;
  }

  private sourceSize(): { width: number; height: number } | null {
    const source = this.source;
    if (!source) return null;
    if (source instanceof HTMLVideoElement) {
      if (source.videoWidth < 1 || source.videoHeight < 1) return null;
      return { width: source.videoWidth, height: source.videoHeight };
    }
    if (source.naturalWidth < 1 || source.naturalHeight < 1) return null;
    return { width: source.naturalWidth, height: source.naturalHeight };
  }

  private ensureSampler(palette: PaletteId, cssWidth: number, cssHeight: number): Sampler | null {
    const source = this.source;
    const size = this.sourceSize();
    if (!source || !size) return null;
    const stamp = source instanceof HTMLVideoElement ? source.currentTime : 0;
    const key = `${palette}|${Math.round(cssWidth)}x${Math.round(cssHeight)}|${size.width}x${size.height}|${stamp}`;
    if (this.sampler && this.samplerKey === key) return this.sampler;

    const fitted = samplerSize(cssWidth, cssHeight);
    const canvas = this.samplerCanvas;
    canvas.width = fitted.width;
    canvas.height = fitted.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    const placed = coverRect(size.width, size.height, fitted.width, fitted.height);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(source, placed.x, placed.y, placed.w, placed.h);
    const frame = ctx.getImageData(0, 0, fitted.width, fitted.height);
    const raw = new Uint8ClampedArray(frame.data);
    const lut = paletteLut(palette);
    if (lut) recolor(frame.data, lut);
    const stats = analyzeLuminance(lut ? frame.data : raw);
    this.sampler = {
      width: fitted.width,
      height: fitted.height,
      data: frame.data,
      raw,
      low: stats.low,
      high: stats.high,
    };
    this.samplerKey = key;
    return this.sampler;
  }

  private drawPicture(
    ctx: CanvasRenderingContext2D,
    target: HTMLCanvasElement,
    scale: number,
    cssWidth: number,
    cssHeight: number,
    palette: PaletteId,
  ): void {
    const source = this.source;
    const size = this.sourceSize();
    if (!source || !size) return;
    const placed = coverRect(size.width, size.height, cssWidth, cssHeight);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, placed.x, placed.y, placed.w, placed.h);
    const lut = paletteLut(palette);
    if (!lut) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const frame = ctx.getImageData(0, 0, target.width, target.height);
    recolor(frame.data, lut);
    ctx.putImageData(frame, 0, 0);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
  }

  private drawMask(ctx: CanvasRenderingContext2D, cssWidth: number, cssHeight: number, value: number): void {
    const [top, middle, bottom] = maskAlphas('light', value);
    const gradient = ctx.createLinearGradient(0, 0, 0, cssHeight);
    gradient.addColorStop(0, `rgba(255, 255, 255, ${top})`);
    gradient.addColorStop(0.42, `rgba(255, 255, 255, ${middle})`);
    gradient.addColorStop(1, `rgba(255, 255, 255, ${bottom})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, cssWidth, cssHeight);
  }

  private drawAscii(
    ctx: CanvasRenderingContext2D,
    cssWidth: number,
    cssHeight: number,
    sampler: Sampler,
    settings: EffectSettings,
  ): void {
    const fontSize = asciiFontSize(settings.size, cssWidth);
    const font = `${fontSize}px ${MONO_FONT}`;
    const glyph = this.glyphMetrics(fontSize, font);
    const { xStep, lineHeight } = asciiSteps(settings.spacing, fontSize, glyph.width, glyph.height);
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fontKerning = 'none';
    const rendering = ctx as CanvasRenderingContext2D & { textRendering?: string };
    rendering.textRendering = 'geometricPrecision';
    const darkInk = settings.inkTone === 'dark';

    for (let y = lineHeight / 2; y <= cssHeight + lineHeight; y += lineHeight) {
      for (let x = xStep / 2; x <= cssWidth + xStep; x += xStep) {
        const color = sampleAt(sampler.data, sampler.width, sampler.height, x, y, cssWidth, cssHeight);
        const tone = asciiTone(
          luminance(color.r, color.g, color.b),
          sampler.low,
          sampler.high,
          settings.strength,
          darkInk,
        );
        if (tone <= 0.02) continue;
        const index = Math.round(tone * (ASCII_CHARS.length - 1));
        const char = ASCII_CHARS[Math.max(0, Math.min(ASCII_CHARS.length - 1, index))];
        if (char === ' ') continue;
        const ink = liftInk(color, tone, settings.strength);
        ctx.globalAlpha = asciiAlpha(tone, settings.strength);
        ctx.fillStyle = `rgb(${ink.r}, ${ink.g}, ${ink.b})`;
        ctx.fillText(char, x, y);
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawDither(
    ctx: CanvasRenderingContext2D,
    cssWidth: number,
    cssHeight: number,
    sampler: Sampler,
    settings: EffectSettings,
  ): void {
    const pixel = ditherPixelSize(settings.size, cssWidth);
    const pattern = ditherPatternScale(settings.spacing);
    const levels = ditherLevels(settings.strength);
    const blend = ditherBlend(settings.strength);
    const columns = Math.max(1, Math.ceil(cssWidth / pixel));
    const rows = Math.max(1, Math.ceil(cssHeight / pixel));
    const dither = this.ditherCanvas;
    if (dither.width !== columns || dither.height !== rows) {
      dither.width = columns;
      dither.height = rows;
    }
    const ditherCtx = dither.getContext('2d', { willReadFrequently: true });
    if (!ditherCtx) return;
    const image = ditherCtx.createImageData(columns, rows);
    const { data } = image;
    const lut = paletteLut(settings.palette);
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < columns; x += 1) {
        const threshold = bayerThreshold(x, y, pattern);
        const viewportX = Math.min(cssWidth, (x + 0.5) * pixel);
        const viewportY = Math.min(cssHeight, (y + 0.5) * pixel);
        const sample = pushSaturation(
          sampleAt(sampler.raw, sampler.width, sampler.height, viewportX, viewportY, cssWidth, cssHeight),
          settings.strength,
        );
        const quantized = quantizeColor(sample, threshold, levels, blend);
        const color = lut ? applyLut(quantized, lut) : quantized;
        const index = (y * columns + x) * 4;
        data[index] = color.r;
        data[index + 1] = color.g;
        data[index + 2] = color.b;
        data[index + 3] = 255;
      }
    }
    ditherCtx.putImageData(image, 0, 0);
    const previousSmoothing = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(dither, 0, 0, columns, rows, 0, 0, cssWidth, cssHeight);
    ctx.imageSmoothingEnabled = previousSmoothing;
  }

  private glyphMetrics(fontSize: number, font: string): { width: number; height: number } {
    if (this.glyphCache?.font === font) return this.glyphCache;
    let width = fontSize * 0.62;
    let height = fontSize;
    const ctx = this.measure;
    if (ctx) {
      ctx.font = font;
      for (const char of ASCII_CHARS) {
        if (char === ' ') continue;
        width = Math.max(width, ctx.measureText(char).width || 0);
      }
      const at = ctx.measureText('@');
      const box = (at.actualBoundingBoxAscent || 0) + (at.actualBoundingBoxDescent || 0);
      if (box > 0) height = box;
    }
    this.glyphCache = { font, width, height };
    return this.glyphCache;
  }

  private attachVideo(video: HTMLVideoElement): void {
    this.video = video;
    this.videoMode = 'rvfc';
    this.lastSampleTime = -1;
    const resume = (): void => this.scheduleVideo();
    const halt = (): void => this.cancelVideoLoop();
    const onSeeked = (): void => {
      this.lastSampleTime = -1;
      this.samplerKey = '';
      if (this.settings && !this.destroyed) this.renderNow(false);
      this.scheduleVideo();
    };
    const bindings: Array<{ type: string; fn: () => void }> = [
      { type: 'play', fn: resume },
      { type: 'playing', fn: resume },
      { type: 'loadeddata', fn: resume },
      { type: 'seeked', fn: onSeeked },
      { type: 'pause', fn: halt },
      { type: 'ended', fn: halt },
      { type: 'emptied', fn: halt },
    ];
    for (const binding of bindings) {
      video.addEventListener(binding.type, binding.fn);
      this.videoListeners.push(binding);
    }
    this.scheduleVideo();
  }

  private detachVideo(): void {
    this.cancelVideoLoop();
    if (this.video) {
      for (const listener of this.videoListeners) {
        this.video.removeEventListener(listener.type, listener.fn);
      }
    }
    this.videoListeners.length = 0;
    this.video = null;
    this.lastSampleTime = -1;
  }

  /** Playing, in view, and in a visible tab. */
  private videoIsActive(video: HTMLVideoElement | null): video is HTMLVideoElement {
    return Boolean(
      video &&
        !this.destroyed &&
        this.onScreen &&
        !document.hidden &&
        !video.paused &&
        !video.ended &&
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA,
    );
  }

  private scheduleVideo(): void {
    const video = this.video;
    if (!this.videoIsActive(video)) return;
    if (this.videoFrameId || this.videoRafId) return;
    if (this.videoMode === 'rvfc' && typeof video.requestVideoFrameCallback === 'function') {
      this.videoFrameId = video.requestVideoFrameCallback(() => {
        this.videoFrameId = 0;
        this.clearWatchdog();
        this.onVideoFrame();
      });
      this.armWatchdog(video);
      return;
    }
    this.videoRafId = requestAnimationFrame(() => {
      this.videoRafId = 0;
      this.onVideoFrame();
    });
  }

  /**
   * requestVideoFrameCallback only runs when the browser presents the video.
   * If a callback does not arrive, sample from requestAnimationFrame instead.
   */
  private armWatchdog(video: HTMLVideoElement): void {
    this.clearWatchdog();
    this.videoWatchdog = window.setTimeout(() => {
      this.videoWatchdog = 0;
      if (!this.videoFrameId || !this.videoIsActive(video)) return;
      if (typeof video.cancelVideoFrameCallback === 'function') {
        video.cancelVideoFrameCallback(this.videoFrameId);
      }
      this.videoFrameId = 0;
      this.videoMode = 'raf';
      this.scheduleVideo();
    }, 240);
  }

  private clearWatchdog(): void {
    if (!this.videoWatchdog) return;
    window.clearTimeout(this.videoWatchdog);
    this.videoWatchdog = 0;
  }

  private onVideoFrame(): void {
    const video = this.video;
    if (this.destroyed || !this.settings || !this.videoIsActive(video)) return;
    if (this.fadeRaf) {
      this.scheduleVideo();
      return;
    }
    // requestAnimationFrame runs faster than the video. Sample when media time
    // moves by about one frame so a covered video still redraws, without
    // painting the same frame twice.
    if (this.videoMode === 'raf') {
      const time = video.currentTime;
      const advanced = time >= this.lastSampleTime ? time - this.lastSampleTime : 1;
      if (this.hasFrame && advanced < 1 / 40) {
        this.scheduleVideo();
        return;
      }
      this.lastSampleTime = time;
    }
    this.samplerKey = '';
    this.renderNow(false);
    this.scheduleVideo();
  }

  private cancelVideoLoop(): void {
    this.clearWatchdog();
    const video = this.video;
    if (video && this.videoFrameId && typeof video.cancelVideoFrameCallback === 'function') {
      video.cancelVideoFrameCallback(this.videoFrameId);
    }
    if (this.videoRafId) cancelAnimationFrame(this.videoRafId);
    this.videoFrameId = 0;
    this.videoRafId = 0;
  }
}

function sampleAt(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  cssWidth: number,
  cssHeight: number,
): Rgb {
  const sx = Math.max(0, Math.min(width - 1, Math.round((x / cssWidth) * (width - 1))));
  const sy = Math.max(0, Math.min(height - 1, Math.round((y / cssHeight) * (height - 1))));
  const index = (sy * width + sx) * 4;
  return {
    r: pixels[index] || 0,
    g: pixels[index + 1] || 0,
    b: pixels[index + 2] || 0,
  };
}

/** Map a quantized pixel onto the palette by its luminance. */
function applyLut(color: Rgb, lut: Uint8Array): Rgb {
  const y = Math.max(0, Math.min(255, Math.round(color.r * 0.299 + color.g * 0.587 + color.b * 0.114)));
  const offset = y * 3;
  return { r: lut[offset], g: lut[offset + 1], b: lut[offset + 2] };
}
