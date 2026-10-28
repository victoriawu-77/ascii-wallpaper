/** Local chat on the wallpaper stage. Messages never leave the browser. */
export function bindChat(root: HTMLElement): void {
  const form = required<HTMLFormElement>(root, '#chat-form');
  const input = required<HTMLInputElement>(root, '#chat-input');
  const log = required<HTMLElement>(root, '#chat-log');

  const send = (text: string): void => {
    const value = text.trim();
    if (!value) {
      input.focus();
      return;
    }
    input.value = '';
    const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 220;
    window.setTimeout(() => showReply(log, replyFor(value)), delay);
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    send(input.value);
  });
}

function showReply(log: HTMLElement, text: string): void {
  log.hidden = false;
  const item = document.createElement('p');
  item.className = 'chat-reply';
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
  if (/\b(dither|ascii|filter|look|palette|strength|size|meadow|lavender|amber|mono|blue)\b/.test(q)) {
    return 'ASCII and Dither are the two looks. Each keeps its own palette, strength, and size. Original leaves the picture alone. Meadow, Blue, Amber, Lavender, and Mono are color maps.';
  }
  if (/\b(change|switch|adjust|control|dock|upload)\b/.test(q)) {
    return 'The dock picks the wallpaper, the look, and the palette. Your file, in the Wallpaper row, adds an image or a video. You can also drop a file on the stage.';
  }
  if (/\b(wallpaper|butterfly|monarch|portrait|horizon|study|drop|video|image|file|looking)\b/.test(q)) {
    return 'Butterfly loops by default. Monarch is the other loop. Portrait, Horizon, and Study are stills. Your file adds one image or video of your own.';
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
