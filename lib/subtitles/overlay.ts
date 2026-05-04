const OVERLAY_CLASS = 'yt-focus-dual-overlay';

export type OverlayHandle = {
  setText(text: string): void;
  setVisible(visible: boolean): void;
  destroy(): void;
};

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

  const apply = () => {
    el.textContent = text;
    el.style.display = visible && text ? 'block' : 'none';
  };

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
      el.remove();
    },
  };
}
