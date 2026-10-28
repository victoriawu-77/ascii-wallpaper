import { homeLook } from './settings';
import type { FilterId, Look, PaletteId } from './types';

const FILTERS: readonly FilterId[] = ['ascii', 'dither'];
const PALETTES: readonly PaletteId[] = ['original', 'moss', 'ember', 'tide', 'ink'];

export function readLook(search: string): Look | null {
  const params = new URLSearchParams(search);
  if (!params.has('filter') && !params.has('palette') && !params.has('strength') && !params.has('size')) {
    return null;
  }
  const fallback = homeLook();
  return {
    filter: oneOf(params.get('filter'), FILTERS, fallback.filter),
    palette: oneOf(params.get('palette'), PALETTES, fallback.palette),
    strength: unit(params.get('strength'), fallback.strength),
    size: unit(params.get('size'), fallback.size),
  };
}

/** Write the look into the address bar and return the absolute URL. */
export function publishLook(look: Look): string {
  const url = new URL(window.location.href);
  url.searchParams.set('filter', look.filter);
  url.searchParams.set('palette', look.palette);
  url.searchParams.set('strength', String(look.strength));
  url.searchParams.set('size', String(look.size));
  const next = `${url.pathname}${url.search}${url.hash}`;
  if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== next) {
    history.replaceState(null, '', next);
  }
  return url.toString();
}

function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  const normalized = value?.trim().toLowerCase();
  return allowed.find((item) => item === normalized) ?? fallback;
}

function unit(value: string | null, fallback: number): number {
  if (value === null || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) return fallback;
  return parsed;
}
