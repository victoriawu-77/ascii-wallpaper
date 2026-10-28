import type { FilterId, FilterSettings, InkTone, Look, PaletteId } from './types';

/** Resting ASCII look: glyphs over a picture you can still see. */
export const ASCII_HOME: FilterSettings = {
  mask: 58,
  palette: 'moss',
  inkTone: 'dark',
  strength: 88,
  size: 34,
  spacing: 0,
};

/** Resting dither look: fine Bayer cells, light veil. */
export const DITHER_HOME: FilterSettings = {
  mask: 32,
  palette: 'moss',
  inkTone: 'dark',
  strength: 100,
  size: 18,
  spacing: 0,
};

export interface Preset extends Look {
  id: 'film' | 'neon' | 'ink';
  label: string;
  mask: number;
  inkTone: InkTone;
  spacing: number;
}

export const PRESETS: readonly Preset[] = [
  {
    id: 'film',
    label: 'Film',
    filter: 'dither',
    palette: 'ink',
    strength: 82,
    size: 64,
    mask: 18,
    spacing: 72,
    inkTone: 'dark',
  },
  {
    id: 'neon',
    label: 'Neon',
    filter: 'ascii',
    palette: 'tide',
    strength: 100,
    size: 20,
    mask: 24,
    spacing: 0,
    inkTone: 'light',
  },
  {
    id: 'ink',
    label: 'Ink',
    filter: 'ascii',
    palette: 'moss',
    strength: 100,
    size: 56,
    mask: 78,
    spacing: 18,
    inkTone: 'dark',
  },
];

export const SWATCHES: readonly { id: PaletteId; label: string }[] = [
  { id: 'original', label: 'Original' },
  { id: 'moss', label: 'Moss' },
  { id: 'ember', label: 'Ember' },
  { id: 'tide', label: 'Tide' },
  { id: 'ink', label: 'Ink' },
];

export function homeSettings(filter: FilterId): FilterSettings {
  return filter === 'ascii' ? { ...ASCII_HOME } : { ...DITHER_HOME };
}

export function homeLook(): Look {
  return {
    filter: 'ascii',
    palette: ASCII_HOME.palette,
    strength: ASCII_HOME.strength,
    size: ASCII_HOME.size,
  };
}

export function presetById(id: string): Preset | undefined {
  return PRESETS.find((preset) => preset.id === id);
}

export function presetMatching(look: Look): Preset | undefined {
  return PRESETS.find(
    (preset) =>
      preset.filter === look.filter &&
      preset.palette === look.palette &&
      preset.strength === look.strength &&
      preset.size === look.size,
  );
}
