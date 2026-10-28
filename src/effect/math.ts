import type { PaletteId, Rgb } from '../types';

/** Characters run from blank to solid. Index 0 and 1 are spaces. */
export const ASCII_CHARS = '  .,:;-=+xX08S#&@';

export const BAYER_4X4: readonly (readonly number[])[] = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

const PALETTE_STOPS = [0, 0.4, 0.74, 1] as const;

const PALETTES: Record<Exclude<PaletteId, 'original'>, readonly string[]> = {
  meadow: ['#2B361F', '#677D45', '#AEBA78', '#E5E1BD'],
  blue: ['#192A4D', '#326AC5', '#A2C2F1', '#EDF3FC'],
  amber: ['#3C200F', '#A74C15', '#EF9A46', '#F7E7CA'],
  lavender: ['#292144', '#6552AB', '#B3A5E4', '#F0ECFB'],
  mono: ['#151515', '#575757', '#A6A6A6', '#ECECEC'],
};

const LIGHT_MASK = [54, 20, 38] as const;
const DARK_MASK = [44, 20, 50] as const;

const lutCache = new Map<PaletteId, Uint8Array>();

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampByte(value: number): number {
  return Math.round(clamp(value, 0, 255));
}

/** range(v, a, b) = a + (b - a) * v / 100 */
export function range(value: number, start: number, end: number): number {
  return start + ((end - start) * clamp(value, 0, 100)) / 100;
}

export function luminance(red: number, green: number, blue: number): number {
  return (red * 0.299 + green * 0.587 + blue * 0.114) / 255;
}

export function smoothstep(value: number): number {
  const x = clamp(value, 0, 1);
  return x * x * (3 - 2 * x);
}

/**
 * Levels curve. Black point is 0.22s and white point is 1 - 0.08s.
 * tone = leveled * (1 - s) + smoothstep(leveled) * s.
 */
export function applyToneCurve(tone: number, strength: number): number {
  const amount = clamp(strength, 0, 100) / 100;
  const blackPoint = amount * 0.22;
  const whitePoint = 1 - amount * 0.08;
  const leveled = clamp((tone - blackPoint) / Math.max(0.01, whitePoint - blackPoint), 0, 1);
  return leveled * (1 - amount) + smoothstep(leveled) * amount;
}

/** Mix raw luminance with a stretch between the 8th and 92nd percentile. */
export function asciiTone(
  luma: number,
  low: number,
  high: number,
  strength: number,
  darkInk: boolean,
): number {
  const raw = darkInk ? 1 - luma : luma;
  const span = high - low;
  if (span < 0.025) {
    return applyToneCurve(raw, strength);
  }
  const normalized = darkInk
    ? clamp((high - luma) / span, 0, 1)
    : clamp((luma - low) / span, 0, 1);
  const mix = 0.72 + (clamp(strength, 0, 100) / 100) * 0.14;
  return applyToneCurve(raw * (1 - mix) + normalized * mix, strength);
}

export function asciiAlpha(tone: number, strength: number): number {
  const amount = clamp(strength, 0, 100) / 100;
  return clamp((0.12 + 0.7 * tone) * (0.72 + 0.28 * amount), 0.06, 0.94);
}

export function asciiFontSize(size: number, boxWidth: number): number {
  const maxSize = boxWidth < 720 ? 22 : 24;
  return Math.round(range(size, 7, maxSize));
}

export function asciiSteps(
  spacing: number,
  fontSize: number,
  glyphWidth: number,
  glyphHeight: number,
): { xStep: number; lineHeight: number } {
  const xStep = Math.max(range(spacing, 8, 24), glyphWidth * 1.08);
  const lineHeight = Math.max(
    range(spacing, 9, 26),
    (glyphHeight || fontSize) * 1.12,
    fontSize * 1.04,
  );
  return {
    xStep: Math.max(1, xStep),
    lineHeight: Math.max(1, lineHeight),
  };
}

export function ditherPixelSize(size: number, boxWidth: number): number {
  const maxSize = boxWidth < 720 ? 7 : 9;
  return Math.max(2, Math.round(range(size, 2, maxSize)));
}

export function ditherPatternScale(spacing: number): number {
  return Math.max(1, Math.round(range(spacing, 1, 4)));
}

export function ditherLevels(strength: number): number {
  return Math.max(2, Math.round(range(strength, 8, 2)));
}

export function ditherBlend(strength: number): number {
  return range(strength, 0.32, 1);
}

export function bayerThreshold(x: number, y: number, patternScale: number): number {
  const scale = Math.max(1, patternScale);
  const row = BAYER_4X4[Math.floor(y / scale) % 4];
  const cell = row[Math.floor(x / scale) % 4];
  return (cell + 0.5) / 16;
}

function rgbToHsv(color: Rgb): { h: number; s: number; v: number } {
  const red = color.r / 255;
  const green = color.g / 255;
  const blue = color.b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;
  if (delta > 0) {
    if (max === red) hue = ((green - blue) / delta) % 6;
    else if (max === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    hue = (hue * 60 + 360) % 360;
  }
  return { h: hue, s: max > 0 ? delta / max : 0, v: max };
}

function hsvToRgb(hsv: { h: number; s: number; v: number }): Rgb {
  const chroma = hsv.v * hsv.s;
  const sector = hsv.h / 60;
  const second = chroma * (1 - Math.abs((sector % 2) - 1));
  let red = 0;
  let green = 0;
  let blue = 0;
  if (sector < 1) {
    red = chroma;
    green = second;
  } else if (sector < 2) {
    red = second;
    green = chroma;
  } else if (sector < 3) {
    green = chroma;
    blue = second;
  } else if (sector < 4) {
    green = second;
    blue = chroma;
  } else if (sector < 5) {
    red = second;
    blue = chroma;
  } else {
    red = chroma;
    blue = second;
  }
  const match = hsv.v - chroma;
  return {
    r: clampByte((red + match) * 255),
    g: clampByte((green + match) * 255),
    b: clampByte((blue + match) * 255),
  };
}

/** Lift HSV value toward white and push saturation so the glyph stays readable. */
export function liftInk(color: Rgb, tone: number, strength: number): Rgb {
  const amount = clamp(strength, 0, 100) / 100;
  const hsv = rgbToHsv(color);
  const brightness = clamp(0.24 + amount * 0.18 + tone * 0.24, 0, 1);
  const saturationBoost = clamp(0.16 + amount * 0.2, 0, 1.2);
  return hsvToRgb({
    h: hsv.h,
    s: clamp(hsv.s * (1 + saturationBoost), 0, 1),
    v: hsv.v + (1 - hsv.v) * brightness,
  });
}

/** Push saturation away from gray before the Bayer quantize. */
export function pushSaturation(color: Rgb, strength: number): Rgb {
  const amount = clamp(strength, 0, 100) / 100;
  const boost = 1 + clamp(0.06 + amount * 0.18, 0, 1.2);
  const luma = color.r * 0.299 + color.g * 0.587 + color.b * 0.114;
  return {
    r: clampByte(luma + (color.r - luma) * boost),
    g: clampByte(luma + (color.g - luma) * boost),
    b: clampByte(luma + (color.b - luma) * boost),
  };
}

export function quantizeChannel(value: number, threshold: number, levels: number): number {
  const steps = Math.max(2, Math.round(levels) || 2);
  const scaled = (clamp(value, 0, 255) / 255) * (steps - 1);
  const lower = Math.floor(scaled);
  const index = Math.min(steps - 1, lower + (scaled - lower > clamp(threshold, 0, 1) ? 1 : 0));
  return (index / (steps - 1)) * 255;
}

export function quantizeColor(color: Rgb, threshold: number, levels: number, mix: number): Rgb {
  const blend = clamp(mix, 0, 1);
  const quantize = (channel: number): number => {
    const quantized = quantizeChannel(channel, threshold, levels);
    return Math.round(channel + (quantized - channel) * blend);
  };
  return { r: quantize(color.r), g: quantize(color.g), b: quantize(color.b) };
}

function hexToRgb(color: string): Rgb {
  const value = Number.parseInt(color.slice(1), 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

/** 256-entry lookup built from stops at 0, 0.4, 0.74, and 1. Null keeps the photo. */
export function paletteLut(palette: PaletteId): Uint8Array | null {
  if (palette === 'original') return null;
  const cached = lutCache.get(palette);
  if (cached) return cached;
  const stops = PALETTES[palette].map(hexToRgb);
  const lut = new Uint8Array(256 * 3);
  for (let index = 0; index < 256; index += 1) {
    const t = index / 255;
    let segment = 0;
    while (segment < PALETTE_STOPS.length - 2 && t > PALETTE_STOPS[segment + 1]) {
      segment += 1;
    }
    const start = PALETTE_STOPS[segment];
    const end = PALETTE_STOPS[segment + 1];
    const amount = end === start ? 0 : (t - start) / (end - start);
    const from = stops[segment];
    const to = stops[segment + 1];
    lut[index * 3] = clampByte(from.r + (to.r - from.r) * amount);
    lut[index * 3 + 1] = clampByte(from.g + (to.g - from.g) * amount);
    lut[index * 3 + 2] = clampByte(from.b + (to.b - from.b) * amount);
  }
  lutCache.set(palette, lut);
  return lut;
}

export function recolor(data: Uint8ClampedArray, lut: Uint8Array): void {
  for (let index = 0; index < data.length; index += 4) {
    const y = clampByte(data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114);
    const offset = y * 3;
    data[index] = lut[offset];
    data[index + 1] = lut[offset + 1];
    data[index + 2] = lut[offset + 2];
  }
}

/** About 12,000 evenly spaced samples. Low is the 8th percentile, high the 92nd. */
export function analyzeLuminance(data: Uint8ClampedArray): { low: number; high: number } {
  const pixelCount = Math.floor(data.length / 4);
  if (pixelCount < 1) return { low: 0.1, high: 0.9 };
  const stride = Math.max(1, Math.floor(pixelCount / 12000));
  const samples: number[] = [];
  for (let pixel = 0; pixel < pixelCount; pixel += stride) {
    const index = pixel * 4;
    const alpha = clamp(data[index + 3] / 255, 0, 1);
    const red = data[index] * alpha + 255 * (1 - alpha);
    const green = data[index + 1] * alpha + 255 * (1 - alpha);
    const blue = data[index + 2] * alpha + 255 * (1 - alpha);
    samples.push(luminance(red, green, blue));
  }
  samples.sort((first, second) => first - second);
  const last = samples.length - 1;
  return {
    low: clamp(samples[Math.round(last * 0.08)] ?? 0.1, 0, 1),
    high: clamp(samples[Math.round(last * 0.92)] ?? 0.9, 0, 1),
  };
}

/**
 * Mask stops at the top, 42%, and the bottom.
 * Light pages use white at 54/20/38. Dark pages use black at 44/20/50.
 * stop = v<=50 ? base*(v/50)^1.08 : base+(100-base)*((v-50)/50)^1.08
 */
export function maskAlphas(page: 'light' | 'dark', value: number): [number, number, number] {
  const bases = page === 'dark' ? DARK_MASK : LIGHT_MASK;
  return bases.map((base) => maskStop(base, value)) as [number, number, number];
}

function maskStop(basePercent: number, value: number): number {
  const base = clamp(basePercent, 0, 100);
  const amount = clamp(value, 0, 100);
  const curved = amount <= 50
    ? base * Math.pow(amount / 50, 1.08)
    : base + (100 - base) * Math.pow((amount - 50) / 50, 1.08);
  return clamp(curved / 100, 0, 1);
}

export function canvasScale(devicePixelRatio: number, width: number, height: number): number {
  const boxWidth = Math.max(1, width);
  const boxHeight = Math.max(1, height);
  const budget = Math.sqrt((2048 * 2048) / (boxWidth * boxHeight));
  return clamp(Math.min(devicePixelRatio || 1, budget, 1.6), 1, 1.6);
}

/** Sampling canvas, about 480px on the long side, same aspect as the box. */
export function samplerSize(boxWidth: number, boxHeight: number): { width: number; height: number } {
  const width = Math.max(1, boxWidth);
  const height = Math.max(1, boxHeight);
  const scale = 480 / Math.max(width, height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function coverRect(
  sourceWidth: number,
  sourceHeight: number,
  destWidth: number,
  destHeight: number,
): { x: number; y: number; w: number; h: number } {
  const scale = Math.max(destWidth / sourceWidth, destHeight / sourceHeight);
  const width = sourceWidth * scale + 1;
  const height = sourceHeight * scale + 1;
  return {
    x: (destWidth - width) / 2,
    y: (destHeight - height) / 2,
    w: width,
    h: height,
  };
}
