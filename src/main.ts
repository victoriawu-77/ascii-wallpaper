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
    label: 'Butterfly',
    src: asset('wallpapers/butterfly-loop.mp4'),
    thumb: asset('wallpapers/butterfly-poster.jpg'),
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
    src: asset('wallpapers/meadow-portrait.jpg'),
    thumb: asset('wallpapers/meadow-portrait.jpg'),
  },
  {
    kind: 'image',
    label: 'Horizon',
    src: asset('wallpapers/amber-landscape.jpg'),
    thumb: asset('wallpapers/amber-landscape.jpg'),
  },
  {
    kind: 'image',
    label: 'Study',
    src: asset('wallpapers/blue-abstract.jpg'),
    thumb: asset('wallpapers/blue-abstract.jpg'),
  },
];

const backdropStill = asset('wallpapers/amber-landscape.jpg');

const backdrop = document.querySelector<HTMLElement>('.hero-bg');
const stage = document.querySelector<HTMLElement>('.stage');
const photo = document.querySelector<HTMLImageElement>('#art-photo');
const video = document.querySelector<HTMLVideoElement>('#art-video');
const canvas = document.querySelector<HTMLCanvasElement>('#effect-canvas');
const art = document.querySelector<HTMLElement>('#art');
const mount = document.querySelector<HTMLElement>('#effect-panel');
const chat = document.querySelector<HTMLElement>('#chat');
const fileInput = document.querySelector<HTMLInputElement>('#wallpaper-file');
const focusToggle = document.querySelector<HTMLButtonElement>('#focus-toggle');
const focusExit = document.querySelector<HTMLButtonElement>('#focus-exit');
const wallpaperName = document.querySelector<HTMLElement>('#wallpaper-name');

if (!stage || !photo || !video || !canvas || !art || !mount || !chat || !fileInput || !focusToggle || !focusExit) {
  throw new Error('Studio markup is missing.');
}

const focusButton: HTMLButtonElement = focusToggle;
const focusClose: HTMLButtonElement = focusExit;
const artPhoto: HTMLImageElement = photo;
const artVideo: HTMLVideoElement = video;
const artFrame: HTMLElement = art;
const effectCanvas: HTMLCanvasElement = canvas;
const stageFrame: HTMLElement = stage;
const chatEntry: HTMLElement = chat;

if (backdrop) backdrop.style.backgroundImage = `url("${backdropStill}")`;

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
    fileInput.click();
  },
  onExport() {
    exportFrame();
  },
  onCopyLink() {
    void copyLink();
  },
  onFocus() {
    setFocus(!document.body.classList.contains('is-focus'));
  },
  onWallpaper(index) {
    void showWallpaper(index);
  },
});
bindChat(chatEntry);

const query = readLook(window.location.search);
if (query) panel.applyLook(query);
else layer.setSettings(panel.getSettings(), 'discrete');

let index = -1;
let requestId = 0;
let customUrl: string | null = null;

function syncChips(): void {
  panel.setWallpapers(
    wallpapers.map((item) => ({ label: item.label, thumb: item.thumb })),
    index,
  );
}

async function showWallpaper(next: number, force = false): Promise<void> {
  const resolved = (next + wallpapers.length) % wallpapers.length;
  if (!force && resolved === index) return;
  index = resolved;
  const request = ++requestId;
  const item = wallpapers[index];
  syncChips();
  if (wallpaperName) wallpaperName.textContent = item.label;
  if (item.kind === 'video') await showVideo(item, request);
  else await showImage(item, request);
}

async function showVideo(item: Wallpaper, request: number): Promise<void> {
  artPhoto.hidden = true;
  artVideo.hidden = false;
  prepareVideoElement(artVideo);
  artVideo.src = item.src;
  try {
    await artVideo.play();
  } catch {
    // Muted autoplay can wait for a gesture. The element stays ready underneath.
  }
  if (request !== requestId) return;
  if (artVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    await waitForMedia(artVideo, 'loadeddata');
  }
  if (request !== requestId) return;
  layer.setSource(artVideo);
  rememberPreview(artVideo, request);
}

async function showImage(item: Wallpaper, request: number): Promise<void> {
  releaseVideo();
  artPhoto.hidden = false;
  artPhoto.alt = `${item.label} wallpaper`;
  artPhoto.src = item.src;
  try {
    await artPhoto.decode();
  } catch {
    if (request !== requestId) return;
    return;
  }
  if (request !== requestId) return;
  layer.setSource(artPhoto);
  panel.setAssetPreview(item.src);
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
    panel.setAssetPreview(preview);
    const current = wallpapers[index];
    if (current?.custom && current.kind === 'video') {
      current.thumb = preview;
      syncChips();
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

function waitForMedia(element: HTMLVideoElement, type: string): Promise<void> {
  return new Promise((resolve) => {
    const finish = (): void => {
      element.removeEventListener(type, finish);
      element.removeEventListener('error', finish);
      window.clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(finish, 4000);
    element.addEventListener(type, finish);
    element.addEventListener('error', finish);
  });
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

function setFocus(on: boolean): void {
  document.body.classList.toggle('is-focus', on);
  focusButton.textContent = on ? 'Done' : 'Focus';
  focusButton.setAttribute('aria-pressed', String(on));
  panel.setFocusPressed(on);
  if (on && chatEntry.contains(document.activeElement)) focusButton.focus();
  chatEntry.hidden = on;
}

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  fileInput.value = '';
  if (file) void useFile(file);
});

focusButton.addEventListener('click', () => {
  setFocus(!document.body.classList.contains('is-focus'));
});
focusClose.addEventListener('click', (event) => {
  event.stopPropagation();
  setFocus(false);
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && document.body.classList.contains('is-focus')) {
    setFocus(false);
  }
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
