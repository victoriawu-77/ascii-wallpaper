export type FilterId = 'ascii' | 'dither';

export type PaletteId = 'original' | 'meadow' | 'blue' | 'amber' | 'lavender' | 'mono';

/** Dark ink reads the shadows. Light ink reads the highlights. */
export type InkTone = 'dark' | 'light';

export interface FilterSettings {
  mask: number;
  palette: PaletteId;
  inkTone: InkTone;
  strength: number;
  size: number;
  spacing: number;
}

export interface EffectSettings extends FilterSettings {
  filter: FilterId;
}

/** The shareable part of a look. */
export interface Look {
  filter: FilterId;
  palette: PaletteId;
  strength: number;
  size: number;
}

/** Slider drags stay live. Filter and palette changes cross-fade. */
export type UpdateKind = 'continuous' | 'discrete';

export interface Rgb {
  r: number;
  g: number;
  b: number;
}
