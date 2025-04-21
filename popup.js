// Save options to chrome.storage
function saveOptions() {
  const hideShorts = document.getElementById('hideShorts').checked;
  const hidePlayables = document.getElementById('hidePlayables').checked;
  
  chrome.storage.sync.set(
    {
      hideShorts: hideShorts,
      hidePlayables: hidePlayables
    },
    () => {
      // Update status to let user know options were saved
      const status = document.getElementById('status');
      status.textContent = 'Settings saved';
      setTimeout(() => {
        status.textContent = '';
      }, 1500);

      // Notify content script that settings have changed
      chrome.tabs.query({url: '*://*.youtube.com/*'}, function(tabs) {
        tabs.forEach(function(tab) {
          chrome.tabs.reload(tab.id);
        });
      });
    }
  );
}

// Restore options from chrome.storage
function restoreOptions() {
  chrome.storage.sync.get(
    {
      hideShorts: true,      // default value
      hidePlayables: true    // default value
    },
    (items) => {
      document.getElementById('hideShorts').checked = items.hideShorts;
      document.getElementById('hidePlayables').checked = items.hidePlayables;
    }
  );
}

// Add event listeners
document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('hideShorts').addEventListener('change', saveOptions);
document.getElementById('hidePlayables').addEventListener('change', saveOptions); 