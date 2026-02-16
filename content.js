// AdSkipManager: Dedicated module for detecting and skipping ads
const AdSkipManager = (() => {
    let adModuleObserver = null;
    let skipCheckInterval = null;
    let isInitialized = false;

    const SKIP_BUTTON_SELECTORS = [
        '.ytp-skip-ad-button',
        '.ytp-ad-skip-button',
        '.ytp-ad-skip-button-modern'
    ].join(', ');

    const AD_MODULE_SELECTORS = [
        '.ytp-ad-module',
        '#movie_player .ytp-ad-module'
    ];

    function trySkipAd() {
        console.log('[AdSkipManager] Attempting to skip ad...');
        chrome.storage.sync.get({ autoSkipAds: true }, (preferences) => {
            if (preferences.autoSkipAds) {
                const skipButton = document.querySelector(SKIP_BUTTON_SELECTORS);
                if (skipButton) {
                    console.log('[AdSkipManager] Skip button found:', {
                        type: typeof skipButton,
                        tagName: skipButton.tagName,
                        className: skipButton.className,
                        id: skipButton.id,
                        disabled: skipButton.disabled,
                        visible: skipButton.offsetParent !== null,
                        display: window.getComputedStyle(skipButton).display,
                        pointerEvents: window.getComputedStyle(skipButton).pointerEvents,
                        element: skipButton
                    });
                    
                    // Highlight the button with a border
                    skipButton.style.border = '3px solid #ff0000';
                    skipButton.style.boxShadow = '0 0 10px rgba(255, 0, 0, 0.8)';
                    skipButton.style.outline = '2px solid #ff0000';
                    skipButton.style.outlineOffset = '2px';
                    
                    // Try multiple click methods
                    console.log('[AdSkipManager] Attempting click method 1: .click()');
                    skipButton.click();
                    
                    // Try dispatching a click event
                    console.log('[AdSkipManager] Attempting click method 2: dispatchEvent');
                    const clickEvent = new MouseEvent('click', {
                        bubbles: true,
                        cancelable: true,
                        view: window
                    });
                    skipButton.dispatchEvent(clickEvent);
                    
                    // Try mousedown + mouseup
                    console.log('[AdSkipManager] Attempting click method 3: mousedown + mouseup');
                    skipButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
                    skipButton.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
                } else {
                    console.log('[AdSkipManager] Skip button not found');
                }
            } else {
                console.log('[AdSkipManager] Auto-skip ads is disabled');
            }
        });
    }

    function hasAdContent(adModule) {
        return adModule && adModule.children.length > 0;
    }

    function startSkipCheckInterval() {
        if (skipCheckInterval) {
            return;
        }
        console.log('[AdSkipManager] Starting ad check interval');
        skipCheckInterval = setInterval(trySkipAd, 500);
    }

    function stopSkipCheckInterval() {
        if (skipCheckInterval) {
            console.log('[AdSkipManager] Stopping ad check interval');
            clearInterval(skipCheckInterval);
            skipCheckInterval = null;
        }
    }

    function attachAdModuleObserver(adModule) {
        if (adModuleObserver) {
            return;
        }

        adModuleObserver = new MutationObserver(() => {
            if (hasAdContent(adModule)) {
                console.log('[AdSkipManager] Ad content detected by observer');
                trySkipAd();
                startSkipCheckInterval();
            } else {
                console.log('[AdSkipManager] Ad content no longer detected by observer');
                stopSkipCheckInterval();
            }
        });

        adModuleObserver.observe(adModule, {
            childList: true,
            subtree: true
        });
    }

    function findAndAttachToAdModule() {
        if (adModuleObserver) {
            return true;
        }

        for (const selector of AD_MODULE_SELECTORS) {
            const adModule = document.querySelector(selector);
            if (adModule) {
                attachAdModuleObserver(adModule);
                return true;
            }
        }
        return false;
    }

    function init(mainObserverCallback) {
        if (isInitialized) {
            return;
        }
        isInitialized = true;

        findAndAttachToAdModule();
    }

    function onMutation() {
        if (!adModuleObserver) {
            findAndAttachToAdModule();
        }
    }

    return {
        init,
        onMutation,
        trySkipAd
    };
})();

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

            // Handle ytd-reel-shelf-renderer (Shorts in recommendations sidebar)
            if (preferences.hideShorts) {
                const reelShelves = document.querySelectorAll('ytd-reel-shelf-renderer');
                reelShelves.forEach(element => {
                    element.style.display = 'none';
                });
            }

            // Handle ytd-rich-shelf-renderer (Shorts/Playables in main feed)
            const hideRichShelfElement = (element) => {
                // Try to find title element (can be span#title or yt-formatted-string#title)
                const title = element.querySelector('span#title, yt-formatted-string#title');
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

            const richShelfElements = document.querySelectorAll('ytd-rich-shelf-renderer');
            richShelfElements.forEach(hideRichShelfElement);
        }
    );
}

// Run the function when the page loads
hideContent();
AdSkipManager.init();

// Listen for changes in storage
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync') {
        if (changes.hideShorts || changes.hidePlayables) {
            hideContent();
        }
        if (changes.autoSkipAds) {
            AdSkipManager.trySkipAd();
        }
    }
});

// Also run when new content is loaded (for dynamic content)
const observer = new MutationObserver(() => {
    hideContent();
    AdSkipManager.onMutation();
});
observer.observe(document.body, {
    childList: true,
    subtree: true
}); 