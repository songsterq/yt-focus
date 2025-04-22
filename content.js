// Function to hide YouTube Shorts and Playables based on preferences
function hideContent() {
    // Get current preferences
    chrome.storage.sync.get(
        {
            hideShorts: true,      // default value
            hidePlayables: true    // default value
        },
        (preferences) => {
            // Handle sidebar elements
            // First, get all potential elements we might need to show/hide
            const shortsElements = document.querySelectorAll('a[title="Shorts"], ytd-mini-guide-entry-renderer[aria-label="Shorts"]');
            const playablesElements = document.querySelectorAll('a[href^="/playables"]');

            // Show/hide Shorts in sidebar
            shortsElements.forEach(element => {
                const container = element.closest('ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer');
                if (container) {
                    container.style.display = preferences.hideShorts ? 'none' : '';
                }
            });

            // Show/hide Playables in sidebar
            playablesElements.forEach(element => {
                const container = element.closest('ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer');
                if (container) {
                    container.style.display = preferences.hidePlayables ? 'none' : '';
                }
            });

            // Handle content in the main feed and recommendations sidebar
            const hideShelfElement = (element) => {
                const title = element.querySelector('span#title');
                if (title) {
                    let shouldHide = false;

                    // Check for Shorts
                    const isShorts = title.textContent.includes('Shorts');
                    if (isShorts && preferences.hideShorts) {
                        shouldHide = true;
                    }
                    
                    // Check for Playables
                    if (!shouldHide) {  // Only check if not already hiding
                        const playablesLink = element.querySelector('a[href^="/playables"]');
                        if (playablesLink && preferences.hidePlayables) {
                            shouldHide = true;
                        }
                    }
                    
                    // Show or hide based on our checks
                    element.style.display = shouldHide ? 'none' : '';
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

// Listen for changes in storage
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && (changes.hideShorts || changes.hidePlayables)) {
        hideContent();
    }
});

// Also run when new content is loaded (for dynamic content)
const observer = new MutationObserver(hideContent);
observer.observe(document.body, {
    childList: true,
    subtree: true
}); 