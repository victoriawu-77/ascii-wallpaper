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
    append(log, 'user', value);
    input.value = '';
    const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 280;
    window.setTimeout(() => append(log, 'bot', replyFor(value)), delay);
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    send(input.value);
  });

  root.querySelectorAll<HTMLButtonElement>('[data-starter]').forEach((chip) => {
    chip.addEventListener('click', () => {
      send(chip.dataset.starter || chip.textContent || '');
    });
  });
}

function append(log: HTMLElement, role: 'user' | 'bot', text: string): void {
  const item = document.createElement('p');
  item.className = role === 'user' ? 'bubble bubble-user' : 'bubble bubble-bot';
  item.textContent = text;
  log.append(item);
  log.scrollTop = log.scrollHeight;
}

function replyFor(text: string): string {
  const q = text.toLowerCase();
  if (/\b(save|png|download|export|frame)\b/.test(q)) {
    return 'Save PNG in the dock downloads this frame. Copy link keeps the filter, palette, strength, and size in the address bar.';
  }
  if (/\b(link|share|url)\b/.test(q)) {
    return 'Copy link writes this look into the address bar. Opening that URL brings the same filter, palette, strength, and size back.';
  }
  if (/\b(focus|enlarge|hide)\b/.test(q)) {
    return 'Focus hides this chat and enlarges the wallpaper. Done, or the Escape key, brings the chat back.';
  }
  if (/\b(dither|ascii|filter|palette|strength|size|film|neon|ink|preset)\b/.test(q)) {
    return 'ASCII and Dither are the two filters. Each one keeps its own palette, strength, and size. Film, Neon, and Ink set a whole look at once.';
  }
  if (/\b(change|switch|adjust|control|dock)\b/.test(q)) {
    return 'The dock under the stage changes the wallpaper, the filter, the palette, strength, and size. Drop a file on the stage, or choose Your file.';
  }
  if (/\b(wallpaper|butterfly|monarch|portrait|horizon|study|upload|drop|video|image|look|looking)\b/.test(q)) {
    return 'This is a wallpaper redrawn in the browser. Butterfly loops by default. Monarch is the other loop. Portrait, Horizon, and Study are stills.';
  }
  if (/\b(hello|hi|hey|help|start|aster)\b/.test(q)) {
    return 'Hello. Ask about the wallpaper, the ASCII and Dither filters, or how to save a frame.';
  }
  return 'I can explain this wallpaper, the ASCII and Dither filters, and how to save a frame. Try "How do I change it?"';
}

function required<T extends Element>(root: ParentNode, selector: string): T {
  const node = root.querySelector<T>(selector);
  if (!node) throw new Error(`Missing ${selector}`);
  return node;
}
