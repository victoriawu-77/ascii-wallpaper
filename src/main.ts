import './style.css';
import { coverRect } from './effect/math';
import { EffectLayer } from './effect/effect-layer';
import { publishLook, readLook } from './look-url';
import { bindChat } from './ui/chat-entry';
import { EffectPanel } from './ui/effect-panel';

interface Wallpaper {
  label: string;
  src: string;
  thumb: string;
  kind: 'image' | 'video';
  custom?: boolean;
}

const asset = (path: string): string => `${import.meta.env.BASE_URL}${path}`;

const wallpapers: Wallpaper[] = [
  {
    kind: 'video',
    label: 'Meadow',
    src: asset('wallpapers/meadow-loop.mp4'),
    thumb: asset('wallpapers/meadow-poster.jpg'),
  },
  {
    kind: 'video',
    label: 'Monarch',
    src: asset('wallpapers/monarch-loop.mp4'),
    thumb: asset('wallpapers/monarch-poster.jpg'),
  },
  {
    kind: 'image',
    label: 'Portrait',
    src: asset('wallpapers/portrait.jpg'),
    thumb: asset('wallpapers/portrait.jpg'),
  },
  {
    kind: 'image',
    label: 'Horizon',
    src: asset('wallpapers/horizon.jpg'),
    thumb: asset('wallpapers/horizon.jpg'),
  },
  {
    kind: 'image',
    label: 'Waves',
    src: asset('wallpapers/waves.jpg'),
    thumb: asset('wallpapers/waves.jpg'),
  },
];

const backdrop = document.querySelector<HTMLElement>('.hero-bg');
const stage = document.querySelector<HTMLElement>('.stage');
const photo = document.querySelector<HTMLImageElement>('#art-photo');
const video = document.querySelector<HTMLVideoElement>('#art-video');
const canvas = document.querySelector<HTMLCanvasElement>('#effect-canvas');
const art = document.querySelector<HTMLElement>('#art');
const mount = document.querySelector<HTMLElement>('#effect-panel');
const chat = document.querySelector<HTMLElement>('#chat');
const fileInput = document.querySelector<HTMLInputElement>('#wallpaper-file');

if (!stage || !photo || !video || !canvas || !art || !mount || !chat || !fileInput) {
  throw new Error('Studio markup is missing.');
}

const artPhoto: HTMLImageElement = photo;
const artVideo: HTMLVideoElement = video;
const artFrame: HTMLElement = art;
const effectCanvas: HTMLCanvasElement = canvas;
const stageFrame: HTMLElement = stage;
const chatEntry: HTMLElement = chat;

for (const wallpaper of wallpapers) {
  if (wallpaper.kind !== 'image') continue;
  const preload = new Image();
  preload.src = wallpaper.src;
}

prepareVideoElement(artVideo);

const layer = new EffectLayer(artFrame, effectCanvas);
const panel = new EffectPanel(mount, {
  onChange(settings, kind) {
    layer.setSettings(settings, kind);
    publishLook(panel.getLook());
  },
  onUpload() {
    const customIndex = wallpapers.findIndex((item) => item.custom);
    if (customIndex >= 0 && customIndex !== index) {
      void showWallpaper(customIndex);
      return;
    }
    fileInput.click();
  },
  onExport() {
    exportFrame();
  },
  onCopyLink() {
    void copyLink();
  },
  onWallpaper(next) {
    void showWallpaper(next);
  },
});
bindChat(chatEntry);
layer.onPaint(() => {
  artFrame.classList.remove('is-pending');
});

const query = readLook(window.location.search);
if (query) panel.applyLook(query);
else layer.setSettings(panel.getSettings(), 'discrete');

let index = -1;
let requestId = 0;
let customUrl: string | null = null;

function syncChips(): void {
  panel.setWallpapers(
    wallpapers.flatMap((item, itemIndex) =>
      item.custom ? [] : [{ label: item.label, thumb: item.thumb, index: itemIndex }],
    ),
    index,
  );
  const custom = wallpapers.find((item) => item.custom);
  const current = wallpapers[index];
  panel.setUpload({
    active: Boolean(current?.custom),
    thumb: custom?.thumb ?? '',
  });
}

function paintBackdrop(item: Wallpaper): void {
  if (!backdrop) return;
  const url = item.thumb || (item.kind === 'image' ? item.src : '');
  if (!url) return;
  backdrop.style.backgroundImage = `url("${url.replace(/["\\]/g, '')}")`;
}

async function showWallpaper(next: number, force = false): Promise<void> {
  const resolved = (next + wallpapers.length) % wallpapers.length;
  if (!force && resolved === index) return;
  index = resolved;
  const request = ++requestId;
  const item = wallpapers[index];
  syncChips();
  paintBackdrop(item);
  if (item.kind === 'video') await showVideo(item, request);
  else await showImage(item, request);
}

async function showVideo(item: Wallpaper, request: number): Promise<void> {
  artPhoto.hidden = true;
  artFrame.classList.add('is-pending');
  artFrame.setAttribute('aria-label', `${item.label} wallpaper`);
  prepareVideoElement(artVideo);
  // Keep the element in layout so iOS will decode it. The canvas covers it.
  artVideo.hidden = false;
  artVideo.src = item.src;
  void artVideo.play().catch(() => undefined);

  const poster = loadStill(item.thumb);
  const still = await poster;
  if (request !== requestId) return;
  if (still) layer.setSource(still);

  await waitForPresentedFrame(artVideo);
  if (request !== requestId) return;
  if (artVideo.videoWidth < 2) return;
  layer.setSource(artVideo);
  rememberPreview(artVideo, request);
}

async function showImage(item: Wallpaper, request: number): Promise<void> {
  releaseVideo();
  artFrame.classList.add('is-pending');
  artPhoto.hidden = true;
  artPhoto.alt = `${item.label} wallpaper`;
  artFrame.setAttribute('aria-label', `${item.label} wallpaper`);
  artPhoto.src = item.src;
  try {
    await artPhoto.decode();
  } catch {
    if (request !== requestId) return;
    if (artPhoto.naturalWidth < 2) return;
  }
  if (request !== requestId) return;
  layer.setSource(artPhoto);
}

function loadStill(url: string): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const image = new Image();
    const finish = (ok: boolean): void => resolve(ok && image.naturalWidth > 1 ? image : null);
    image.onload = () => finish(true);
    image.onerror = () => finish(false);
    image.src = url;
    if (image.complete) finish(image.naturalWidth > 1);
  });
}

function waitForPresentedFrame(video: HTMLVideoElement): Promise<void> {
  const ready = (): boolean =>
    video.videoWidth > 1 && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
  const presented = (): Promise<void> => {
    if (typeof video.requestVideoFrameCallback !== 'function') return Promise.resolve();
    return new Promise<void>((resolve) => {
      const timer = window.setTimeout(resolve, 450);
      video.requestVideoFrameCallback(() => {
        window.clearTimeout(timer);
        resolve();
      });
    });
  };
  if (ready()) return presented();
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.clearInterval(poll);
      video.removeEventListener('loadeddata', check);
      video.removeEventListener('canplay', check);
      video.removeEventListener('playing', check);
      resolve();
    };
    const check = (): void => {
      if (ready()) finish();
    };
    const timer = window.setTimeout(finish, 1800);
    const poll = window.setInterval(check, 40);
    video.addEventListener('loadeddata', check);
    video.addEventListener('canplay', check);
    video.addEventListener('playing', check);
  }).then(() => (ready() ? presented() : Promise.resolve()));
}

function releaseVideo(): void {
  artVideo.pause();
  artVideo.removeAttribute('src');
  artVideo.load();
  artVideo.hidden = true;
}

function prepareVideoElement(element: HTMLVideoElement): void {
  element.muted = true;
  element.defaultMuted = true;
  element.playsInline = true;
  element.loop = true;
  element.autoplay = true;
  element.controls = false;
  element.disablePictureInPicture = true;
  element.preload = 'auto';
  element.setAttribute('playsinline', '');
  element.setAttribute('muted', '');
}

function rememberPreview(element: HTMLVideoElement, request: number): void {
  const capture = (): void => {
    if (request !== requestId) return;
    const preview = snapshotCover(element);
    if (!preview) return;
    const current = wallpapers[index];
    if (current?.custom && current.kind === 'video') {
      current.thumb = preview;
      syncChips();
      paintBackdrop(current);
    }
  };
  capture();
  window.setTimeout(capture, 200);
}

function snapshotCover(element: HTMLVideoElement): string {
  if (element.videoWidth < 2 || element.videoHeight < 2) return '';
  try {
    const snapshot = document.createElement('canvas');
    snapshot.width = 64;
    snapshot.height = 64;
    const ctx = snapshot.getContext('2d');
    if (!ctx) return '';
    const placed = coverRect(element.videoWidth, element.videoHeight, snapshot.width, snapshot.height);
    ctx.drawImage(element, placed.x, placed.y, placed.w, placed.h);
    return snapshot.toDataURL('image/jpeg', 0.85);
  } catch {
    return '';
  }
}

async function useFile(file: File): Promise<void> {
  const kind = file.type.startsWith('video/') ? 'video' : file.type.startsWith('image/') ? 'image' : null;
  if (!kind) {
    panel.setStatus('Use an image or a video.');
    return;
  }
  const nextUrl = URL.createObjectURL(file);
  const retiredUrl = customUrl;
  customUrl = nextUrl;
  const entry: Wallpaper = {
    kind,
    label: 'Your file',
    src: nextUrl,
    thumb: kind === 'image' ? nextUrl : '',
    custom: true,
  };
  const existing = wallpapers.findIndex((item) => item.custom);
  if (existing >= 0) wallpapers[existing] = entry;
  else wallpapers.push(entry);
  await showWallpaper(wallpapers.findIndex((item) => item.custom), true);
  if (retiredUrl) URL.revokeObjectURL(retiredUrl);
  panel.setStatus(kind === 'video' ? 'Playing your video.' : 'Showing your image.');
}

function exportFrame(): void {
  try {
    const url = effectCanvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = url;
    link.download = `aster-${panel.getSettings().filter}.png`;
    link.click();
    panel.setStatus('Saved a PNG of this frame.');
  } catch {
    panel.setStatus('This frame could not be saved.');
  }
}

async function copyLink(): Promise<void> {
  const url = publishLook(panel.getLook());
  try {
    await navigator.clipboard.writeText(url);
    panel.setStatus('Link copied.');
  } catch {
    panel.setStatus('Link updated in the address bar.');
  }
}

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  fileInput.value = '';
  if (file) void useFile(file);
});

stageFrame.addEventListener('dragover', (event) => {
  const transfer = event.dataTransfer;
  if (!transfer) return;
  const incoming = [...transfer.items].some((item) => item.kind === 'file');
  if (!incoming) return;
  event.preventDefault();
  transfer.dropEffect = 'copy';
  stageFrame.classList.add('is-dropping');
});

stageFrame.addEventListener('dragleave', (event) => {
  const next = event.relatedTarget;
  if (next instanceof Node && stageFrame.contains(next)) return;
  stageFrame.classList.remove('is-dropping');
});

stageFrame.addEventListener('drop', (event) => {
  event.preventDefault();
  stageFrame.classList.remove('is-dropping');
  const file = event.dataTransfer?.files?.[0];
  if (file) void useFile(file);
});

window.addEventListener('pointerdown', () => {
  const item = wallpapers[index];
  if (!item || item.kind !== 'video' || artVideo.hidden || !artVideo.paused) return;
  void artVideo.play().catch(() => undefined);
});

void showWallpaper(0);
