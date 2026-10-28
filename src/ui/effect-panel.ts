import { homeSettings, SWATCHES } from '../settings';
import type { EffectSettings, FilterId, FilterSettings, Look, PaletteId, UpdateKind } from '../types';

type SliderKey = 'strength' | 'size';

const SLIDERS: readonly { key: SliderKey; label: string }[] = [
  { key: 'strength', label: 'Strength' },
  { key: 'size', label: 'Size' },
];

export interface WallpaperChip {
  label: string;
  thumb: string;
  index: number;
}

export interface UploadState {
  active: boolean;
  thumb: string;
}

export interface PanelHooks {
  onChange: (settings: EffectSettings, kind: UpdateKind) => void;
  onUpload: () => void;
  onExport: () => void;
  onCopyLink: () => void;
  onWallpaper: (index: number) => void;
}

/**
 * Compact dock under the stage.
 * ASCII and Dither keep their own strength, size, and palette.
 */
export class EffectPanel {
  private readonly store: Record<FilterId, FilterSettings> = {
    ascii: homeSettings('ascii'),
    dither: homeSettings('dither'),
  };

  private filter: FilterId = 'ascii';
  private statusTimer = 0;
  private wallpaperItems: WallpaperChip[] = [];
  private wallpaperIndex = -1;

  constructor(
    private readonly root: HTMLElement,
    private readonly hooks: PanelHooks,
  ) {
    root.innerHTML = template();
    this.bind();
    this.paint();
  }

  getSettings(): EffectSettings {
    return { filter: this.filter, ...this.store[this.filter] };
  }

  getLook(): Look {
    const settings = this.getSettings();
    return {
      filter: settings.filter,
      palette: settings.palette,
      strength: settings.strength,
      size: settings.size,
    };
  }

  applyLook(look: Look): void {
    this.filter = look.filter;
    const next = this.store[look.filter];
    next.palette = look.palette;
    next.strength = look.strength;
    next.size = look.size;
    this.paint();
    this.hooks.onChange(this.getSettings(), 'discrete');
  }

  setStatus(message: string): void {
    const status = this.root.querySelector<HTMLElement>('#dock-status');
    if (!status) return;
    status.textContent = message;
    window.clearTimeout(this.statusTimer);
    this.statusTimer = window.setTimeout(() => {
      if (status.textContent === message) status.textContent = '';
    }, 2400);
  }

  setWallpapers(items: readonly WallpaperChip[], activeIndex: number): void {
    this.wallpaperItems = items.map((item) => ({ label: item.label, thumb: item.thumb, index: item.index }));
    this.wallpaperIndex = activeIndex;
    this.paintWallpapers();
  }

  setUpload(state: UploadState): void {
    const button = this.root.querySelector<HTMLButtonElement>('[data-action="upload"]');
    const thumb = button?.querySelector<HTMLElement>('.chip-thumb');
    if (!button || !thumb) return;
    button.setAttribute('aria-pressed', String(state.active));
    if (state.thumb) {
      thumb.style.backgroundImage = `url("${state.thumb.replace(/["\\]/g, '')}")`;
      button.classList.add('has-thumb');
    } else {
      thumb.style.backgroundImage = '';
      button.classList.remove('has-thumb');
    }
  }

  private bind(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        const next = button.dataset.filter as FilterId;
        if (next === this.filter) return;
        this.filter = next;
        this.paint();
        this.hooks.onChange(this.getSettings(), 'discrete');
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-palette]').forEach((button) => {
      button.addEventListener('click', () => {
        const palette = button.dataset.palette as PaletteId;
        if (this.store[this.filter].palette === palette) return;
        this.store[this.filter].palette = palette;
        this.paint();
        this.hooks.onChange(this.getSettings(), 'discrete');
      });
    });

    for (const slider of SLIDERS) {
      const track = this.root.querySelector<HTMLElement>(`[data-slider="${slider.key}"]`);
      if (!track) continue;
      track.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        track.setPointerCapture(event.pointerId);
        this.readPointer(slider.key, track, event.clientX);
      });
      track.addEventListener('pointermove', (event) => {
        if (!track.hasPointerCapture(event.pointerId)) return;
        this.readPointer(slider.key, track, event.clientX);
      });
      track.addEventListener('keydown', (event) => {
        const current = this.store[this.filter][slider.key];
        let next = current;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next -= event.shiftKey ? 10 : 1;
        else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next += event.shiftKey ? 10 : 1;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = 100;
        else if (event.key === 'PageDown') next -= 10;
        else if (event.key === 'PageUp') next += 10;
        else return;
        event.preventDefault();
        this.commitSlider(slider.key, next);
      });
    }

    this.root.querySelectorAll<HTMLElement>('[data-radios]').forEach((group) => {
      group.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft' && event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
          return;
        }
        const buttons = [...group.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
        if (!buttons.length) return;
        const index = buttons.findIndex((button) => button.getAttribute('aria-checked') === 'true');
        const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
        event.preventDefault();
        buttons[(index + direction + buttons.length) % buttons.length]?.click();
      });
    });

    this.root.querySelector('.wallpaper-chips')?.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest<HTMLButtonElement>('[data-wallpaper]');
      if (!button) return;
      const index = Number(button.dataset.wallpaper);
      if (!Number.isInteger(index)) return;
      this.hooks.onWallpaper(index);
    });

    this.root.querySelector('[data-action="upload"]')?.addEventListener('click', () => this.hooks.onUpload());
    this.root.querySelector('[data-action="export"]')?.addEventListener('click', () => this.hooks.onExport());
    this.root.querySelector('[data-action="link"]')?.addEventListener('click', () => this.hooks.onCopyLink());
  }

  private readPointer(key: SliderKey, track: HTMLElement, clientX: number): void {
    const rect = track.getBoundingClientRect();
    const thumb = 8;
    const travel = Math.max(1, rect.width - thumb);
    const x = Math.min(travel, Math.max(0, clientX - rect.left - thumb / 2));
    this.commitSlider(key, Math.round((x / travel) * 100));
  }

  private commitSlider(key: SliderKey, value: number): void {
    const next = Math.max(0, Math.min(100, Math.round(value)));
    if (this.store[this.filter][key] === next) return;
    this.store[this.filter][key] = next;
    this.paintSlider(key, next);
    this.hooks.onChange(this.getSettings(), 'continuous');
  }

  private paint(): void {
    const settings = this.store[this.filter];
    this.root.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((button) => {
      const on = button.dataset.filter === this.filter;
      button.setAttribute('aria-checked', String(on));
      button.tabIndex = on ? 0 : -1;
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-palette]').forEach((button) => {
      const on = button.dataset.palette === settings.palette;
      button.setAttribute('aria-checked', String(on));
      button.tabIndex = on ? 0 : -1;
    });
    this.paintSlider('strength', settings.strength);
    this.paintSlider('size', settings.size);
  }

  private paintSlider(key: SliderKey, value: number): void {
    const track = this.root.querySelector<HTMLElement>(`[data-slider="${key}"]`);
    if (!track) return;
    const fill = track.querySelector<HTMLElement>('.fill');
    const thumb = track.querySelector<HTMLElement>('.thumb');
    const valueEl = track.parentElement?.querySelector<HTMLElement>('.value');
    const fraction = value / 100;
    if (thumb) thumb.style.left = `calc((100% - 8px) * ${fraction})`;
    if (fill) fill.style.width = `calc((100% - 8px) * ${fraction} + 4px)`;
    track.setAttribute('aria-valuenow', String(value));
    track.setAttribute('aria-valuetext', String(value));
    if (valueEl) valueEl.textContent = String(value);
  }

  private paintWallpapers(): void {
    const group = this.root.querySelector<HTMLElement>('.wallpaper-chips');
    if (!group) return;
    group.replaceChildren(
      ...this.wallpaperItems.map((item) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.wallpaper = String(item.index);
        button.setAttribute('role', 'radio');
        const on = item.index === this.wallpaperIndex;
        button.setAttribute('aria-checked', String(on));
        button.tabIndex = on ? 0 : -1;
        const thumb = document.createElement('span');
        thumb.className = 'chip-thumb';
        thumb.setAttribute('aria-hidden', 'true');
        if (item.thumb) thumb.style.backgroundImage = `url("${item.thumb.replace(/["\\]/g, '')}")`;
        const label = document.createElement('span');
        label.className = 'chip-label';
        label.textContent = item.label;
        button.append(thumb, label);
        return button;
      }),
    );
  }
}

function template(): string {
  const swatches = SWATCHES.map(
    (swatch) =>
      `<button type="button" class="swatch" role="radio" data-palette="${swatch.id}" aria-label="${swatch.label}" aria-checked="false"></button>`,
  ).join('');
  return `
    <div class="dock-panel">
      <div class="dock-row wallpaper-row">
        <span class="dock-label" id="label-wallpaper">Wallpaper</span>
        <div class="wallpaper-controls">
          <div class="wallpaper-chips" role="radiogroup" aria-labelledby="label-wallpaper" data-radios></div>
          <button type="button" class="upload-chip" data-action="upload" aria-pressed="false">
            <span class="chip-thumb" aria-hidden="true"></span>
            <span class="chip-label">Your file</span>
          </button>
        </div>
      </div>
      <div class="dock-row">
        <span class="dock-label" id="label-look">Look</span>
        <div class="segment" role="radiogroup" aria-labelledby="label-look" data-radios>
          <button type="button" role="radio" data-filter="ascii" aria-checked="true">ASCII</button>
          <button type="button" role="radio" data-filter="dither" aria-checked="false">Dither</button>
        </div>
      </div>
      <div class="dock-row dock-color">
        <span class="dock-label" id="label-color">Palette</span>
        <div class="swatches" role="radiogroup" aria-labelledby="label-color" data-radios>${swatches}</div>
      </div>
      <div class="slider-grid">
        ${slider('strength', 'Strength')}
        ${slider('size', 'Size')}
      </div>
      <div class="dock-row actions-row">
        <span class="dock-label" id="label-actions">Actions</span>
        <div class="actions">
          <button type="button" data-action="export">Save PNG</button>
          <button type="button" data-action="link">Copy link</button>
        </div>
      </div>
      <p class="dock-status" id="dock-status" role="status"></p>
    </div>
  `;
}

function slider(key: SliderKey, label: string): string {
  const id = `label-${key}`;
  return `
    <div class="slider">
      <div class="slider-top">
        <span class="dock-label" id="${id}">${label}</span>
        <span class="value">0</span>
      </div>
      <div
        class="track"
        data-slider="${key}"
        role="slider"
        tabindex="0"
        aria-labelledby="${id}"
        aria-orientation="horizontal"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow="0"
      >
        <div class="fill"></div>
        <div class="mark" aria-hidden="true"></div>
        <div class="thumb"></div>
      </div>
    </div>
  `;
}
