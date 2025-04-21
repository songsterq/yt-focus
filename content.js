// Function to hide YouTube Shorts and Playables based on preferences
function hideContent() {
    // Get current preferences
    chrome.storage.sync.get(
        {
            hideShorts: true,      // default value
            hidePlayables: true    // default value
        },
        (preferences) => {
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

            sidebarSelectors.forEach(selector => {
                const elements = document.querySelectorAll(selector);
                elements.forEach(element => {
                    const container = element.closest('ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer');
                    if (container) {
                        container.style.display = 'none';
                    }
                });
            });

            // Hide content from the main feed based on preferences
            const shelfElements = document.querySelectorAll('ytd-rich-shelf-renderer');
            shelfElements.forEach(element => {
                const title = element.querySelector('span#title');
                if (title) {
                    const isShorts = title.textContent.includes('Shorts');
                    
                    // Check for Playables by looking for the link
                    const playablesLink = element.querySelector('a[href^="/playables"]');
                    const isPlayables = !!playablesLink;
                    
                    if ((preferences.hideShorts && isShorts) || 
                        (preferences.hidePlayables && isPlayables)) {
                        element.style.display = 'none';
                    }
                }
            });
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