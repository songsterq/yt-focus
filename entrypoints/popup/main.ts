import { hideShortsPref, hidePlayablesPref } from '@/lib/preferences';

const shortsCheckbox = document.querySelector<HTMLInputElement>('#hideShorts')!;
const playablesCheckbox =
  document.querySelector<HTMLInputElement>('#hidePlayables')!;
const status = document.querySelector<HTMLElement>('#status')!;

function flashStatus() {
  status.textContent = 'Settings saved';
  setTimeout(() => {
    status.textContent = '';
  }, 1500);
}

async function init() {
  shortsCheckbox.checked = await hideShortsPref.getValue();
  playablesCheckbox.checked = await hidePlayablesPref.getValue();
}

shortsCheckbox.addEventListener('change', async () => {
  await hideShortsPref.setValue(shortsCheckbox.checked);
  flashStatus();
});

playablesCheckbox.addEventListener('change', async () => {
  await hidePlayablesPref.setValue(playablesCheckbox.checked);
  flashStatus();
});

void init();
