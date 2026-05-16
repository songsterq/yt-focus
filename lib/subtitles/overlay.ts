import * as sel from '../selectors';

const OVERLAY_CLASS = 'yt-focus-dual-overlay';
const TEXT_CLASS = 'yt-focus-dual-text';
const INJECTED_CLASS = 'yt-focus-dual-injected';

export type OverlayHandle = {
  setText(text: string): void;
  setVisible(visible: boolean): void;
  destroy(): void;
};

type RenderMode = 'inject' | 'external';

function detectRenderMode(cap: HTMLElement): RenderMode {
  // Detect per-frame from the live DOM rather than from track metadata —
  // tracks[0].kind doesn't always match what YT is actually rendering.
  // Primary signal: YT marks roll-up caption windows with the explicit
  // class `ytp-caption-window-rollup`. Fallback: any time the caption box
  // shows multiple lines simultaneously (accumulated via either multiple
  // .captions-text siblings or multiple .caption-visual-line children),
  // treat it as rolling — injecting into the bottom line would let the
  // primary's upward growth keep displacing the secondary.
  if (cap.classList.contains('ytp-caption-window-rollup')) return 'external';
  if (cap.querySelectorAll('.captions-text').length > 1) return 'external';
  if (cap.querySelectorAll('.caption-visual-line').length > 1) return 'external';
  return 'inject';
}

type Position =
  | { mode: 'anchored'; top: number; left: number }
  | { mode: 'fallback' };

const DEFAULT_FONT_FAMILY =
  'YouTube Noto, Roboto, "Arial Unicode Ms", Arial, Helvetica, Verdana, "PT Sans Caption", sans-serif';
const DEFAULT_FONT_SIZE = 'clamp(14px, 2.4vw, 28px)';
const DEFAULT_TEXT_BG = 'rgba(8, 8, 8, 0.75)';
const DEFAULT_WINDOW_BG = 'rgba(0, 0, 0, 0)';
const DEFAULT_PADDING = '0.05em 0.4em';

// Style properties mirrored from YouTube's caption segments. Reading these
// via getComputedStyle() picks up the user's CC settings (font, size, color,
// edge style, text background) including any live changes.
const SEG_PROPS = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'lineHeight',
  'color',
  'backgroundColor',
  'textShadow',
  'padding',
] as const;

type SegStyle = Record<(typeof SEG_PROPS)[number], string>;

function findCaptionWindow(player: HTMLElement): HTMLElement | null {
  // YouTube's draggable caption box. Absent when captions are off. If
  // multiple windows exist (multi-track edge case), prefer the last
  // visible one in DOM order — typically the bottommost on screen.
  const all = player.querySelectorAll<HTMLElement>(sel.NATIVE_CAPTION_WINDOW);
  for (let i = all.length - 1; i >= 0; i--) {
    const el = all[i];
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return el;
  }
  return null;
}

function findCaptionSegment(player: HTMLElement): HTMLElement | null {
  return player.querySelector<HTMLElement>('.ytp-caption-segment');
}

function readSegStyle(seg: HTMLElement): SegStyle {
  const c = window.getComputedStyle(seg);
  return {
    fontFamily: c.fontFamily,
    fontSize: c.fontSize,
    fontWeight: c.fontWeight,
    fontStyle: c.fontStyle,
    lineHeight: c.lineHeight,
    color: c.color,
    backgroundColor: c.backgroundColor,
    textShadow: c.textShadow,
    padding: c.padding,
  };
}

function segStylesEqual(a: SegStyle | null, b: SegStyle): boolean {
  if (!a) return false;
  for (const p of SEG_PROPS) if (a[p] !== b[p]) return false;
  return true;
}

function computePosition(player: HTMLElement, el: HTMLElement): Position {
  const captionWindow = findCaptionWindow(player);
  if (!captionWindow) return { mode: 'fallback' };

  const playerRect = player.getBoundingClientRect();
  if (playerRect.width === 0 || playerRect.height === 0) {
    return { mode: 'fallback' };
  }
  const capRect = captionWindow.getBoundingClientRect();
  const ourHeight = el.offsetHeight || 30;
  const gap = 4;

  // Anchor above the caption window so the rolling primary's downward
  // growth never pushes the secondary off the bottom of the player.
  let top = capRect.top - playerRect.top - gap - ourHeight;
  if (top < 0) {
    top = capRect.bottom - playerRect.top + gap;
  }
  top = Math.max(0, Math.min(top, playerRect.height - ourHeight));
  const left = capRect.left + capRect.width / 2 - playerRect.left;

  return { mode: 'anchored', top, left };
}

function findLastPrimarySegment(cap: HTMLElement): HTMLElement | null {
  // Last segment in DOM order = bottommost line's text container. We inject
  // inside this element (as a child after a <br>) so our secondary inherits
  // all of YT's inline-styled font/color/text-shadow/background for free.
  const segments = cap.querySelectorAll<HTMLElement>('.ytp-caption-segment');
  return segments[segments.length - 1] ?? null;
}

export function mountOverlay(player: HTMLElement): OverlayHandle {
  // Remove a stale overlay if HMR or a botched teardown left one.
  const stale = player.querySelector(`.${OVERLAY_CLASS}`);
  if (stale) stale.remove();
  // Same for any orphaned injected line from a previous session.
  for (const el of player.querySelectorAll(`.${INJECTED_CLASS}`)) el.remove();

  // Outer "window" mirrors .caption-window (positioning + window background).
  const win = document.createElement('div');
  win.className = OVERLAY_CLASS;
  Object.assign(win.style, {
    position: 'absolute',
    left: '50%',
    bottom: '8%',
    transform: 'translateX(-50%)',
    maxWidth: '90%',
    textAlign: 'center',
    pointerEvents: 'none',
    zIndex: '40',
    display: 'none',
    backgroundColor: DEFAULT_WINDOW_BG,
  } as CSSStyleDeclaration);

  // Inner span mirrors .ytp-caption-segment (font, color, text background,
  // edge style, padding). box-decoration-break: clone keeps the per-character
  // background hugging each line on wrap, matching YouTube's look.
  const span = document.createElement('span');
  span.className = TEXT_CLASS;
  Object.assign(span.style, {
    whiteSpace: 'pre-wrap',
    fontFamily: DEFAULT_FONT_FAMILY,
    fontSize: DEFAULT_FONT_SIZE,
    color: '#fff',
    backgroundColor: DEFAULT_TEXT_BG,
    padding: DEFAULT_PADDING,
    lineHeight: '1.3',
    boxDecorationBreak: 'clone',
    WebkitBoxDecorationBreak: 'clone',
  } as Partial<CSSStyleDeclaration>);

  win.appendChild(span);
  player.appendChild(win);

  let text = '';
  let visible = false;
  let stopped = false;
  let raf = 0;
  let lastMode: 'anchored' | 'fallback' | null = null;
  let lastTop = -1;
  let lastLeft = -1;
  let lastSegStyle: SegStyle | null = null;
  let lastWindowBg: string | null = null;
  let injected: HTMLElement | null = null;
  let injectedInto: HTMLElement | null = null;

  const removeInjected = () => {
    if (!injected) return;
    // Remove our preceding <br> if it's still attached just before the span.
    const prev = injected.previousSibling;
    if (prev instanceof HTMLElement && prev.classList.contains(INJECTED_CLASS)) {
      prev.remove();
    }
    injected.remove();
    injected = null;
    injectedInto = null;
  };

  const applyStyles = () => {
    const seg = findCaptionSegment(player);
    if (seg) {
      const next = readSegStyle(seg);
      if (!segStylesEqual(lastSegStyle, next)) {
        for (const p of SEG_PROPS) span.style[p] = next[p];
        lastSegStyle = next;
      }
    }
    const cw = findCaptionWindow(player);
    if (cw) {
      const bg = window.getComputedStyle(cw).backgroundColor;
      if (bg !== lastWindowBg) {
        win.style.backgroundColor = bg;
        lastWindowBg = bg;
      }
    }
  };

  const applyPosition = () => {
    const pos = computePosition(player, win);
    if (pos.mode === 'fallback') {
      if (lastMode !== 'fallback') {
        win.style.top = 'auto';
        win.style.bottom = '8%';
        win.style.left = '50%';
        win.style.transform = 'translateX(-50%)';
        lastMode = 'fallback';
        lastTop = -1;
        lastLeft = -1;
      }
      return;
    }
    if (
      lastMode !== 'anchored' ||
      lastTop !== pos.top ||
      lastLeft !== pos.left
    ) {
      win.style.bottom = 'auto';
      win.style.top = `${pos.top}px`;
      win.style.left = `${pos.left}px`;
      win.style.transform = 'translateX(-50%)';
      lastMode = 'anchored';
      lastTop = pos.top;
      lastLeft = pos.left;
    }
  };

  const reconcileInject = (cap: HTMLElement) => {
    // Append our line INSIDE YT's last .ytp-caption-segment (after a <br>),
    // so YT's inline styles on that segment — font, color, text-shadow,
    // background — apply to our text "for free".
    if (!visible || !text) {
      removeInjected();
      return;
    }
    const primarySeg = findLastPrimarySegment(cap);
    if (!primarySeg) {
      removeInjected();
      return;
    }
    if (
      !injected ||
      injectedInto !== primarySeg ||
      injected.parentElement !== primarySeg ||
      !injected.classList.contains(INJECTED_CLASS)
    ) {
      removeInjected();
      const br = document.createElement('br');
      br.className = INJECTED_CLASS;
      const inner = document.createElement('span');
      inner.className = `${TEXT_CLASS} ${INJECTED_CLASS}`;
      primarySeg.appendChild(br);
      primarySeg.appendChild(inner);
      injected = inner;
      injectedInto = primarySeg;
    }
    if (injected.textContent !== text) injected.textContent = text;
  };

  const reconcileExternal = () => {
    // External overlay (used for rolling captions, anchored above the YT
    // caption window) or for the CC-off fallback at the player bottom.
    if (span.textContent !== text) span.textContent = text;
    win.style.display = visible && text ? 'inline-block' : 'none';
    if (visible && text) {
      applyStyles();
      applyPosition();
    }
  };

  const reconcile = () => {
    const cap = findCaptionWindow(player);
    if (cap && detectRenderMode(cap) === 'inject') {
      win.style.display = 'none';
      reconcileInject(cap);
      return;
    }
    // No caption-window (CC off) or rolling captions detected → external.
    removeInjected();
    reconcileExternal();
  };

  const tick = () => {
    if (stopped) return;
    reconcile();
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return {
    setText(next: string) {
      text = next;
      reconcile();
    },
    setVisible(next: boolean) {
      visible = next;
      reconcile();
    },
    destroy() {
      stopped = true;
      cancelAnimationFrame(raf);
      removeInjected();
      win.remove();
    },
  };
}
