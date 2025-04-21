// Function to hide YouTube Shorts and Playables
function hideContent() {
    // Hide Shorts and Playables from the sidebar (both expanded and collapsed states)
    const sidebarShortsSelectors = [
        'a[title="Shorts"]',  // Expanded state Shorts
        'ytd-mini-guide-entry-renderer[aria-label="Shorts"]',  // Collapsed state Shorts
        'a[title="Playables"]',  // Expanded state Playables
    ];

    sidebarShortsSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
            const container = element.closest('ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer');
            if (container) {
                container.style.display = 'none';
            }
        });
    });

    // Hide Shorts and Playables from the main content
    const shelfElements = document.querySelectorAll('ytd-rich-shelf-renderer');
    shelfElements.forEach(element => {
        // Check if the element contains Shorts or Playables content
        const title = element.querySelector('span#title');
        if (title && (title.textContent.includes('Shorts') || title.textContent.includes('Playables'))) {
            element.style.display = 'none';
        }
    });
}

// Run the function when the page loads
hideContent();

// Also run when new content is loaded (for dynamic content)
const observer = new MutationObserver(hideContent);
observer.observe(document.body, {
    childList: true,
    subtree: true
}); 