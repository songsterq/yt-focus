// Function to hide YouTube Shorts and Playables based on preferences
function hideContent() {
    // Get current preferences
    chrome.storage.sync.get(
        {
            hideShorts: true,      // default value
            hidePlayables: true    // default value
        },
        (preferences) => {
            // Early return if nothing needs to be hidden
            if (!preferences.hideShorts && !preferences.hidePlayables) {
                return;
            }

            // Hide content in the sidebar based on preferences
            const sidebarSelectors = [];
            if (preferences.hideShorts) {
                sidebarSelectors.push(
                    'a[title="Shorts"]',  // Expanded state Shorts
                    'ytd-mini-guide-entry-renderer[aria-label="Shorts"]'  // Collapsed state Shorts
                );
            }
            if (preferences.hidePlayables) {
                sidebarSelectors.push(
                    'a[href^="/playables"]'  // Playables link (works for all languages)
                );
            }

            // Only query DOM if we have selectors to look for
            if (sidebarSelectors.length > 0) {
                sidebarSelectors.forEach(selector => {
                    const elements = document.querySelectorAll(selector);
                    elements.forEach(element => {
                        const container = element.closest('ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer');
                        if (container) {
                            container.style.display = 'none';
                        }
                    });
                });
            }

            // Hide content from the main feed and recommendations sidebar
            const hideShelfElement = (element) => {
                const title = element.querySelector('span#title');
                if (title) {
                    let shouldHide = false;

                    if (preferences.hideShorts && title.textContent.includes('Shorts')) {
                        shouldHide = true;
                    }
                    
                    if (!shouldHide && preferences.hidePlayables) {
                        // Only check for Playables link if we haven't already decided to hide
                        const playablesLink = element.querySelector('a[href^="/playables"]');
                        if (playablesLink) {
                            shouldHide = true;
                        }
                    }
                    
                    if (shouldHide) {
                        element.style.display = 'none';
                    }
                }
            };

            // Handle both rich shelf (main feed) and reel shelf (recommendations sidebar)
            const shelfElements = document.querySelectorAll('ytd-rich-shelf-renderer, ytd-reel-shelf-renderer');
            shelfElements.forEach(hideShelfElement);
        }
    );
}

// Run the function when the page loads
hideContent();

// Also run when new content is loaded (for dynamic content)
const observer = new MutationObserver(hideContent);
observer.observe(document.body, {
    childList: true,
    subtree: true
}); 