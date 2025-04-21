// Function to hide YouTube Shorts
function hideShorts() {
    // Hide Shorts from the sidebar
    const sidebarShorts = document.querySelector('a[title="Shorts"]');
    if (sidebarShorts) {
        const shortsContainer = sidebarShorts.closest('ytd-guide-entry-renderer');
        if (shortsContainer) {
            shortsContainer.style.display = 'none';
        }
    }

    // Hide Shorts from the main content
    const shortsElements = document.querySelectorAll('ytd-rich-shelf-renderer');
    shortsElements.forEach(element => {
        // Check if the element contains Shorts content
        const title = element.querySelector('span#title');
        if (title && title.textContent.includes('Shorts')) {
            element.style.display = 'none';
        }
    });
}

// Run the function when the page loads
hideShorts();

// Also run when new content is loaded (for dynamic content)
const observer = new MutationObserver(hideShorts);
observer.observe(document.body, {
    childList: true,
    subtree: true
}); 