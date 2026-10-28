import type { FilterId, FilterSettings, Look, PaletteId } from './types';

/** Resting ASCII look: glyphs over a picture you can still see. */
export const ASCII_HOME: FilterSettings = {
  mask: 58,
  palette: 'meadow',
  inkTone: 'dark',
  strength: 88,
  size: 34,
  spacing: 0,
};

/** Resting dither look: fine Bayer cells, light veil. */
export const DITHER_HOME: FilterSettings = {
  mask: 32,
  palette: 'meadow',
  inkTone: 'dark',
  strength: 100,
  size: 18,
  spacing: 0,
};

export const SWATCHES: readonly { id: PaletteId; label: string }[] = [
  { id: 'original', label: 'Original' },
  { id: 'meadow', label: 'Meadow' },
  { id: 'blue', label: 'Blue' },
  { id: 'amber', label: 'Amber' },
  { id: 'lavender', label: 'Lavender' },
  { id: 'mono', label: 'Mono' },
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
