import {
  hideShortsPref,
  hidePlayablesPref,
  dualSubtitlesEnabledPref,
  secondaryLanguagePref,
} from '@/lib/preferences';
import {
  getHiddenCounts,
  watchHiddenCounts,
  type HiddenCounts,
} from '@/lib/hidden-counter';

const shortsCheckbox = document.querySelector<HTMLInputElement>('#hideShorts')!;
const playablesCheckbox =
  document.querySelector<HTMLInputElement>('#hidePlayables')!;
const dualCheckbox = document.querySelector<HTMLInputElement>(
  '#dualSubtitlesEnabled',
)!;
const secondarySelect = document.querySelector<HTMLSelectElement>(
  '#secondaryLanguage',
)!;
const secondaryOther = document.querySelector<HTMLInputElement>(
  '#secondaryLanguageOther',
)!;
const status = document.querySelector<HTMLElement>('#status')!;
const shortsPill = document.querySelector<HTMLSpanElement>('#shortsHiddenCount')!;
const playablesPill = document.querySelector<HTMLSpanElement>(
  '#playablesHiddenCount',
)!;

const KNOWN_LANGS = new Set(
  Array.from(secondarySelect.options)
    .map((o) => o.value)
    .filter((v) => v !== '__other__'),
);

function flashStatus() {
  status.textContent = 'Settings saved';
  setTimeout(() => {
    status.textContent = '';
  }, 1500);
}

function showOtherInput(show: boolean) {
  secondaryOther.style.display = show ? 'block' : 'none';
}

function renderCounts(counts: HiddenCounts) {
  shortsPill.textContent = counts.shorts.toLocaleString();
  playablesPill.textContent = counts.playables.toLocaleString();
}

function setPillVisible(pill: HTMLSpanElement, visible: boolean) {
  pill.hidden = !visible;
}

async function init() {
  shortsCheckbox.checked = await hideShortsPref.getValue();
  playablesCheckbox.checked = await hidePlayablesPref.getValue();
  dualCheckbox.checked = await dualSubtitlesEnabledPref.getValue();
  const lang = await secondaryLanguagePref.getValue();
  if (KNOWN_LANGS.has(lang)) {
    secondarySelect.value = lang;
    showOtherInput(false);
  } else {
    secondarySelect.value = '__other__';
    secondaryOther.value = lang;
    showOtherInput(true);
  }
  const counts = await getHiddenCounts();
  renderCounts(counts);
  setPillVisible(shortsPill, shortsCheckbox.checked);
  setPillVisible(playablesPill, playablesCheckbox.checked);
}

shortsCheckbox.addEventListener('change', async () => {
  await hideShortsPref.setValue(shortsCheckbox.checked);
  setPillVisible(shortsPill, shortsCheckbox.checked);
  flashStatus();
});

playablesCheckbox.addEventListener('change', async () => {
  await hidePlayablesPref.setValue(playablesCheckbox.checked);
  setPillVisible(playablesPill, playablesCheckbox.checked);
  flashStatus();
});

dualCheckbox.addEventListener('change', async () => {
  await dualSubtitlesEnabledPref.setValue(dualCheckbox.checked);
  flashStatus();
});

secondarySelect.addEventListener('change', async () => {
  if (secondarySelect.value === '__other__') {
    showOtherInput(true);
    secondaryOther.focus();
    // Don't save yet — wait for the user to enter a code.
    return;
  }
  showOtherInput(false);
  await secondaryLanguagePref.setValue(secondarySelect.value);
  flashStatus();
});

secondaryOther.addEventListener('change', async () => {
  const value = secondaryOther.value.trim();
  if (!value) return;
  await secondaryLanguagePref.setValue(value);
  flashStatus();
});

watchHiddenCounts(renderCounts);

void init();
