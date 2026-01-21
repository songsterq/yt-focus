// Save options to chrome.storage
function saveOptions() {
  const hideShorts = document.getElementById('hideShorts').checked;
  const hidePlayables = document.getElementById('hidePlayables').checked;
  const autoSkipAds = document.getElementById('autoSkipAds').checked;
  
  chrome.storage.sync.set(
    {
      hideShorts: hideShorts,
      hidePlayables: hidePlayables,
      autoSkipAds: autoSkipAds
    },
    () => {
      // Update status to let user know options were saved
      const status = document.getElementById('status');
      status.textContent = 'Settings saved';
      setTimeout(() => {
        status.textContent = '';
      }, 1500);
    }
  );
}

// Restore options from chrome.storage
function restoreOptions() {
  chrome.storage.sync.get(
    {
      hideShorts: true,      // default value
      hidePlayables: true,   // default value
      autoSkipAds: true      // default value
    },
    (items) => {
      document.getElementById('hideShorts').checked = items.hideShorts;
      document.getElementById('hidePlayables').checked = items.hidePlayables;
      document.getElementById('autoSkipAds').checked = items.autoSkipAds;
    }
  );
}

// Add event listeners
document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('hideShorts').addEventListener('change', saveOptions);
document.getElementById('hidePlayables').addEventListener('change', saveOptions);
document.getElementById('autoSkipAds').addEventListener('change', saveOptions); 