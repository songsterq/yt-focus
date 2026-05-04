import * as sel from '../selectors';
import type { CaptionTrack, SecondarySelection } from './types';

const ROW_FLAG = 'data-yt-focus-row';
const OWN_FLAG = 'data-yt-focus-own';

const SUPPORTED_TARGET_LANGS: Array<{ code: string; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'zh-Hans', label: 'Chinese (Simplified)' },
  { code: 'zh-Hant', label: 'Chinese (Traditional)' },
  { code: 'ru', label: 'Russian' },
  { code: 'vi', label: 'Vietnamese' },
  { code: 'hi', label: 'Hindi' },
  { code: 'ar', label: 'Arabic' },
  { code: 'it', label: 'Italian' },
];

export type MenuCallbacks = {
  getTracks(): CaptionTrack[];
  getPrimary(): CaptionTrack | null;
  getSecondary(): SecondarySelection;
  setSecondary(sel: SecondarySelection): void;
};

export type MenuHandle = { stop(): void };

function trackLabel(track: CaptionTrack | null): string {
  if (!track) return 'Off';
  return track.kind === 'asr'
    ? `${track.languageName} (auto)`
    : track.languageName;
}

function secondaryLabel(s: SecondarySelection): string {
  if (s.type === 'off') return 'Off';
  if (s.type === 'native') return trackLabel(s.track);
  const lang = SUPPORTED_TARGET_LANGS.find((l) => l.code === s.targetLang);
  return `Auto-translate → ${lang?.label ?? s.targetLang}`;
}

function makeRow(opts: {
  label: string;
  value?: string;
  hasArrow?: boolean;
  onClick?: (e: MouseEvent) => void;
  ariaChecked?: boolean;
}): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'ytp-menuitem';
  row.setAttribute('role', opts.hasArrow ? 'menuitem' : 'menuitemradio');
  row.setAttribute('tabindex', '0');
  if (opts.ariaChecked !== undefined) {
    row.setAttribute('aria-checked', opts.ariaChecked ? 'true' : 'false');
  }
  if (opts.hasArrow) row.setAttribute('aria-haspopup', 'true');

  const icon = document.createElement('div');
  icon.className = 'ytp-menuitem-icon';

  const label = document.createElement('div');
  label.className = 'ytp-menuitem-label';
  label.textContent = opts.label;

  const content = document.createElement('div');
  content.className = 'ytp-menuitem-content';
  if (opts.value !== undefined) content.textContent = opts.value;
  // Don't append a manual chevron — YouTube's CSS renders one via ::after for
  // items with aria-haspopup="true", and a duplicate looks redundant.

  row.append(icon, label, content);
  if (opts.onClick) {
    row.addEventListener('click', opts.onClick);
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        opts.onClick!(e as unknown as MouseEvent);
      }
    });
  }
  return row;
}

function makeBackHeader(label: string, onClick: () => void): HTMLDivElement {
  // Mirror YouTube's panel header structure (.ytp-panel-header + .ytp-panel-title)
  // so we inherit YT's bold title font and bottom divider.
  const header = document.createElement('div');
  header.className = 'ytp-panel-header';

  const button = document.createElement('button');
  button.className = 'ytp-button ytp-panel-title';
  button.setAttribute('aria-haspopup', 'true');
  button.setAttribute('tabindex', '0');

  // Chevron-left icon, sized and shaped like YT's own back-arrow icons.
  const svgNs = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNs, 'svg');
  svg.setAttribute('width', '36');
  svg.setAttribute('height', '36');
  svg.setAttribute('viewBox', '0 0 36 36');
  svg.style.verticalAlign = 'middle';
  const poly = document.createElementNS(svgNs, 'polygon');
  poly.setAttribute('fill', '#fff');
  poly.setAttribute(
    'points',
    '21.4,26 22.8,24.6 16.2,18 22.8,11.4 21.4,10 13.4,18',
  );
  svg.appendChild(poly);
  button.appendChild(svg);
  button.appendChild(document.createTextNode(label));

  button.addEventListener('click', (e) => {
    // Stop bubbling so YT's "click outside menu" handler doesn't see this
    // click as outside the menu (the target gets removed from the DOM
    // moments later when restorePanel runs).
    e.stopPropagation();
    // Defer the wrapper removal one tick so the click event finishes
    // propagating against an element that is still in the DOM.
    setTimeout(onClick, 0);
  });

  header.appendChild(button);
  return header;
}

// Find YouTube's Subtitles/CC top-level entry. The label is localized and YT
// sometimes wraps the label/count in spans, so we match against the row's
// full textContent plus aria-label. If we can't find it (very rare locale not
// covered, or the row hasn't rendered yet), the caller falls back to appending
// at the end and we'll re-run on the next mutation.
const SUBTITLES_RE =
  /subtitles?|captions?|字幕|subtítulo|sous-titre|untertitel|legenda|субтитр|자막/i;

function findSubtitlesRow(panel: HTMLElement): HTMLElement | null {
  const items = panel.querySelectorAll<HTMLElement>('.ytp-menuitem');
  for (const item of items) {
    if (item.hasAttribute(ROW_FLAG)) continue;
    const haystack = `${item.textContent ?? ''} ${item.getAttribute('aria-label') ?? ''}`;
    if (SUBTITLES_RE.test(haystack)) return item;
  }
  return null;
}

export function injectMenu(cb: MenuCallbacks): MenuHandle {
  const menu = document.querySelector<HTMLElement>(sel.CC_SETTINGS_MENU);
  if (!menu) return { stop() {} };

  let topPanel: HTMLElement | null = null;
  let originalChildren: HTMLElement[] | null = null;

  const findTopPanel = (): HTMLElement | null => {
    // Identify by content: the top-level panel is the one containing
    // YouTube's "Subtitles/CC" row. `.ytp-panel-menu` also matches sub-panels
    // (e.g., the language list), so a positional querySelector would leak our
    // row into whichever panel is active.
    const panels = menu.querySelectorAll<HTMLElement>(sel.CC_SETTINGS_PANEL);
    for (const panel of panels) {
      if (findSubtitlesRow(panel)) return panel;
    }
    return null;
  };

  const ensureRow = () => {
    // Don't touch the panel while our sub-picker is open — its children are
    // mid-edit and ours sits at the end.
    if (originalChildren) return;
    const panel = findTopPanel();
    if (!panel) return;
    topPanel = panel;

    let row = panel.querySelector<HTMLElement>(`[${ROW_FLAG}]`);
    if (row) {
      const contentEl = row.querySelector('.ytp-menuitem-content');
      if (contentEl?.firstChild) {
        contentEl.firstChild.nodeValue = secondaryLabel(cb.getSecondary());
      }
    } else {
      row = makeRow({
        label: 'Secondary subtitle',
        value: secondaryLabel(cb.getSecondary()),
        hasArrow: true,
        onClick: openSecondaryPanel,
      });
      row.setAttribute(ROW_FLAG, '1');
    }

    // Re-position on each call. YouTube renders some top-level items lazily,
    // so the anchor row can shift over time.
    const subtitlesRow = findSubtitlesRow(panel);
    if (!subtitlesRow) return;
    const parent = subtitlesRow.parentElement;
    if (!parent) return;
    const desiredNext = subtitlesRow.nextSibling;
    const alreadyInPlace =
      row.parentElement === parent && row.previousSibling === subtitlesRow;
    if (!alreadyInPlace) {
      parent.insertBefore(row, desiredNext);
    }
  };

  const openSecondaryPanel = () => {
    const panel = topPanel ?? findTopPanel();
    if (!panel) return;
    topPanel = panel;
    if (panel.querySelector(`[${OWN_FLAG}]`)) return;

    originalChildren = Array.from(panel.children) as HTMLElement[];
    for (const c of originalChildren) c.style.display = 'none';

    const wrapper = document.createElement('div');
    wrapper.setAttribute(OWN_FLAG, '1');
    // Belt-and-braces: keep clicks inside our wrapper from reaching any
    // window-level "outside menu" handler YouTube might register.
    const swallow = (e: Event) => e.stopPropagation();
    wrapper.addEventListener('click', swallow);
    wrapper.addEventListener('mousedown', swallow);
    wrapper.addEventListener('pointerdown', swallow);
    renderSecondaryPicker(wrapper);
    panel.appendChild(wrapper);
  };

  const restorePanel = () => {
    if (!topPanel) return;
    const wrapper = topPanel.querySelector(`[${OWN_FLAG}]`);
    wrapper?.remove();
    if (originalChildren) {
      for (const c of originalChildren) c.style.display = '';
      originalChildren = null;
    }
    ensureRow();
  };

  // restorePanel removes our wrapper, so any caller invoked from a click
  // handler must defer it to the next tick — see makeBackHeader for the
  // full reasoning.
  const restorePanelDeferred = () => setTimeout(restorePanel, 0);

  const renderSecondaryPicker = (wrapper: HTMLElement) => {
    wrapper.innerHTML = '';
    const tracks = cb.getTracks();
    const current = cb.getSecondary();

    wrapper.appendChild(makeBackHeader('Secondary subtitle', restorePanel));
    wrapper.appendChild(
      makeRow({
        label: 'Off',
        ariaChecked: current.type === 'off',
        onClick: () => {
          cb.setSecondary({ type: 'off' });
          restorePanelDeferred();
        },
      }),
    );
    for (const t of tracks) {
      const checked =
        current.type === 'native' && current.track.vssId === t.vssId;
      wrapper.appendChild(
        makeRow({
          label: trackLabel(t),
          ariaChecked: checked,
          onClick: () => {
            cb.setSecondary({ type: 'native', track: t });
            restorePanelDeferred();
          },
        }),
      );
    }
    wrapper.appendChild(
      makeRow({
        label: 'Auto-translate …',
        hasArrow: true,
        onClick: () => renderTranslatePicker(wrapper, current),
      }),
    );
  };

  const renderTranslatePicker = (
    wrapper: HTMLElement,
    current: SecondarySelection,
  ) => {
    wrapper.innerHTML = '';
    wrapper.appendChild(
      makeBackHeader('Auto-translate', () => renderSecondaryPicker(wrapper)),
    );
    const sourceTrack = cb.getPrimary();
    if (!sourceTrack) {
      const empty = document.createElement('div');
      empty.className = 'ytp-menuitem';
      empty.textContent = 'No source track available';
      empty.style.padding = '8px 12px';
      wrapper.appendChild(empty);
      return;
    }
    for (const lang of SUPPORTED_TARGET_LANGS) {
      const checked =
        current.type === 'translate' && current.targetLang === lang.code;
      wrapper.appendChild(
        makeRow({
          label: lang.label,
          ariaChecked: checked,
          onClick: () => {
            cb.setSecondary({
              type: 'translate',
              sourceTrack,
              targetLang: lang.code,
            });
            restorePanelDeferred();
          },
        }),
      );
    }
  };

  const visibilityObserver = new MutationObserver(() => {
    const visible = !menu.hasAttribute('aria-hidden')
      ? menu.style.display !== 'none' && !menu.classList.contains('ytp-popup-hidden')
      : menu.getAttribute('aria-hidden') !== 'true';
    if (visible) {
      ensureRow();
    } else {
      if (topPanel?.querySelector(`[${OWN_FLAG}]`)) restorePanel();
    }
  });
  visibilityObserver.observe(menu, {
    attributes: true,
    attributeFilter: ['style', 'class', 'aria-hidden'],
  });
  ensureRow();

  const subtreeObserver = new MutationObserver(() => {
    // Always re-run: the row might be missing OR mispositioned because YT
    // inserted new top-level items above it.
    ensureRow();
  });
  subtreeObserver.observe(menu, { childList: true, subtree: true });

  return {
    stop() {
      visibilityObserver.disconnect();
      subtreeObserver.disconnect();
      restorePanel();
      const row = menu.querySelector(`[${ROW_FLAG}]`);
      row?.remove();
    },
  };
}
