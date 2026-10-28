/** Local chat on the wallpaper stage. Messages never leave the browser. */

const PLACEHOLDER_LINES = [
  'Let the light settle on the wings…',
  'A meadow holding still for a moment…',
  'Trace the pale edge of a wing…',
  'Where the field turns gold at dusk…',
  'Ask the light what it keeps…',
  'Soft wings over a quiet meadow…',
  'Hold this brightness a little longer…',
  'A hush of green, then open sky…',
] as const;

export function bindChat(root: HTMLElement): void {
  const form = required<HTMLFormElement>(root, '#chat-form');
  const input = required<HTMLInputElement>(root, '#chat-input');
  const log = required<HTMLElement>(root, '#chat-log');

  bindPlaceholder(input);

  const send = (text: string): void => {
    const value = text.trim();
    if (!value) {
      input.focus();
      return;
    }
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 220;
    window.setTimeout(() => showReply(log, replyFor(value)), delay);
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    send(input.value);
  });
}

function bindPlaceholder(input: HTMLInputElement): void {
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let line = 0;
  let count = 0;
  let deleting = false;
  let timer = 0;

  const idle = (): boolean => input.value === '' && document.activeElement !== input;

  const halt = (): void => {
    window.clearTimeout(timer);
    timer = 0;
  };

  const tick = (): void => {
    timer = 0;
    if (motion.matches || !idle()) return;
    const text = PLACEHOLDER_LINES[line];
    if (!deleting) {
      count = Math.min(text.length, count + 1);
      input.placeholder = text.slice(0, count);
      if (count >= text.length) {
        deleting = true;
        timer = window.setTimeout(tick, 1500);
      } else {
        timer = window.setTimeout(tick, 46);
      }
      return;
    }
    count = Math.max(0, count - 1);
    input.placeholder = text.slice(0, count);
    if (count === 0) {
      deleting = false;
      line = (line + 1) % PLACEHOLDER_LINES.length;
      timer = window.setTimeout(tick, 320);
    } else {
      timer = window.setTimeout(tick, 26);
    }
  };

  const sync = (): void => {
    halt();
    if (motion.matches) {
      input.placeholder = PLACEHOLDER_LINES[0];
      return;
    }
    if (!idle()) return;
    if (count === 0 && !deleting) input.placeholder = '';
    timer = window.setTimeout(tick, 360);
  };

  input.addEventListener('focus', sync);
  input.addEventListener('blur', sync);
  input.addEventListener('input', sync);
  motion.addEventListener('change', sync);
  sync();
}

function showReply(log: HTMLElement, text: string): void {
  log.hidden = false;
  const item = document.createElement('p');
  item.className = 'chat-reply glass';
  item.textContent = text;
  log.replaceChildren(item);
}

function replyFor(text: string): string {
  const q = text.toLowerCase();
  if (/\b(save|png|download|export|frame)\b/.test(q)) {
    return 'Save PNG in the dock downloads this frame. Copy link keeps the look, palette, strength, and size in the address bar.';
  }
  if (/\b(link|share|url)\b/.test(q)) {
    return 'Copy link writes this look into the address bar. Opening that URL brings the same filter, palette, strength, and size back.';
  }
  const asksLook = /\b(palette|swatch|ascii|dither|look|filter|strength|size)\b/.test(q);
  if (
    /\b(wallpaper|monarch|portrait|horizon|butterfly|flower|field|drop|video|image|file|looking)\b/.test(q) ||
    (/\b(meadow|waves)\b/.test(q) && !asksLook)
  ) {
    return 'Meadow loops by default, a field of yellow flowers under a tree. Monarch is the butterfly loop. Portrait, Horizon, and Waves are stills. The Meadow palette is a separate green color map. Your file adds one image or video of your own.';
  }
  if (asksLook || /\b(meadow|lavender|amber|mono|blue|waves)\b/.test(q)) {
    return 'ASCII and Dither are the two looks. Each keeps its own palette, strength, and size. Original leaves the picture alone. Meadow, Blue, Amber, Lavender, and Mono are color maps.';
  }
  if (/\b(change|switch|adjust|control|dock|upload)\b/.test(q)) {
    return 'The dock picks the wallpaper, the look, and the palette. Your file, in the Wallpaper row, adds an image or a video. You can also drop a file on the stage.';
  }
  if (/\b(hello|hi|hey|help|start|aster)\b/.test(q)) {
    return 'Hello. Ask about the wallpaper, ASCII and Dither, or how to save a frame.';
  }
  return 'Ask about the wallpaper, ASCII and Dither, or how to save a frame.';
}

function required<T extends Element>(root: ParentNode, selector: string): T {
  const node = root.querySelector<T>(selector);
  if (!node) throw new Error(`Missing ${selector}`);
  return node;
}
