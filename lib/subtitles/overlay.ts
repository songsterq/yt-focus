import * as sel from '../selectors';

const OVERLAY_CLASS = 'yt-focus-dual-overlay';

export type OverlayHandle = {
  setText(text: string): void;
  setVisible(visible: boolean): void;
  destroy(): void;
};

type Position =
  | { mode: 'anchored'; top: number; left: number }
  | { mode: 'fallback' };

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

  let top = capRect.bottom - playerRect.top + gap;
  // If anchoring below would overflow the player bottom, anchor above instead.
  if (top + ourHeight > playerRect.height) {
    top = capRect.top - playerRect.top - gap - ourHeight;
  }
  top = Math.max(0, Math.min(top, playerRect.height - ourHeight));
  const left = capRect.left + capRect.width / 2 - playerRect.left;

  return { mode: 'anchored', top, left };
}

export function mountOverlay(player: HTMLElement): OverlayHandle {
  // Remove a stale overlay if HMR or a botched teardown left one.
  const stale = player.querySelector(`.${OVERLAY_CLASS}`);
  if (stale) stale.remove();

  const el = document.createElement('div');
  el.className = OVERLAY_CLASS;
  Object.assign(el.style, {
    position: 'absolute',
    left: '50%',
    bottom: '8%',
    transform: 'translateX(-50%)',
    maxWidth: '90%',
    textAlign: 'center',
    color: '#fff',
    fontFamily: 'YouTube Noto, Roboto, "Arial Unicode Ms", Arial, Helvetica, Verdana, "PT Sans Caption", sans-serif',
    fontSize: 'clamp(14px, 2.4vw, 28px)',
    lineHeight: '1.3',
    textShadow: '0 0 4px rgba(0,0,0,0.85), 0 0 2px rgba(0,0,0,0.85)',
    pointerEvents: 'none',
    zIndex: '40',
    whiteSpace: 'pre-wrap',
    display: 'none',
  } as CSSStyleDeclaration);

  player.appendChild(el);

  let text = '';
  let visible = false;
  let stopped = false;
  let raf = 0;
  let lastMode: 'anchored' | 'fallback' | null = null;
  let lastTop = -1;
  let lastLeft = -1;

  const applyPosition = () => {
    const pos = computePosition(player, el);
    if (pos.mode === 'fallback') {
      if (lastMode !== 'fallback') {
        el.style.top = 'auto';
        el.style.bottom = '8%';
        el.style.left = '50%';
        el.style.transform = 'translateX(-50%)';
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
      el.style.bottom = 'auto';
      el.style.top = `${pos.top}px`;
      el.style.left = `${pos.left}px`;
      el.style.transform = 'translateX(-50%)';
      lastMode = 'anchored';
      lastTop = pos.top;
      lastLeft = pos.left;
    }
  };

  const apply = () => {
    el.textContent = text;
    el.style.display = visible && text ? 'block' : 'none';
    if (visible && text) applyPosition();
  };

  const tick = () => {
    if (stopped) return;
    if (visible && text) applyPosition();
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return {
    setText(next: string) {
      text = next;
      apply();
    },
    setVisible(next: boolean) {
      visible = next;
      apply();
    },
    destroy() {
      stopped = true;
      cancelAnimationFrame(raf);
      el.remove();
    },
  };
}
