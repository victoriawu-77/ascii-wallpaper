import type { FilterId, FilterSettings, Look, PaletteId } from './types';

/** ASCII: mask 90, shadows, strength 100, size 37. Glyphs on washed paper. */
export const ASCII_HOME: FilterSettings = {
  mask: 90,
  palette: 'meadow',
  inkTone: 'dark',
  strength: 100,
  size: 37,
  spacing: 0,
};

/** Dither: mask 88, strength 100, size 15. */
export const DITHER_HOME: FilterSettings = {
  mask: 88,
  palette: 'meadow',
  inkTone: 'dark',
  strength: 100,
  size: 15,
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
