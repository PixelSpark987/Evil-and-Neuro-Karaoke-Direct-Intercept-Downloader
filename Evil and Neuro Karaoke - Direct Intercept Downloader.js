// ==UserScript==
// @name         Evil and Neuro Karaoke - Direct Intercept Downloader
// @namespace    http://tampermonkey.net/
// @version      2026-10-15_04
// @description  Intercepts and renames individual track downloads on evilkaraoke.com
// @match        *://evilkaraoke.com/*
// @match        *://*.evilkaraoke.com/*
// @match        *://neurokaraoke.com/*
// @match        *://*.neurokaraoke.com/*
// @match        *://twinskaraoke.com/*
// @match        *://*.twinskaraoke.com/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // =========================================================================
    // USER CONFIGURATION
    // Configure your template string and conditional override rules right here.
    // =========================================================================
    const TEMPLATE_STRING = "{Artist} - {Title} - {CoverBy} Vocal Cover - {Date}";

    // Each rule maps a target field ('CoverBy', 'Artist', 'Title'), match condition, and replacement.
    const CONDITIONAL_OVERRIDES = [
        { field: "CoverBy", match: "Evil", replacement: "Evil Neuro" },
        { field: "CoverBy", match: "Neuro", replacement: "Neuro-sama" },
        { field: "CoverBy", match: "Evil & Neuro", replacement: "Evil Neuro and Neuro-sama" },
        { field: "CoverBy", match: "Neuro & Evil", replacement: "Neuro-sama and Evil Neuro" },
    ];

    let lastActiveTrackItem = null;

    /**
     * Inject custom CSS to make track action buttons permanently visible.
     */
    function injectAlwaysVisibleStyles() {
        const style = document.createElement('style');
        style.innerHTML = `
            .cover-list-item .track-actions {
                opacity: 1 !important;
                visibility: visible !important;
                display: flex !important;
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Automatically attempts to click the "Sign In" navigation button if present.
     */
    function autoClickSignIn() {
        const navLinks = document.querySelectorAll('.mud-nav-link');
        for (const link of navLinks) {
            const textSpan = link.querySelector('.mud-nav-link-text span');
            if (textSpan && textSpan.textContent.trim() === "Sign In") {
                link.click();
                break;
            }
        }
    }

    /**
     * Sanitizes strings to make them safe for filesystem filenames.
     */
    function sanitizeFilename(name) {
        return name.replace(/[\\/:*?"<>|]/g, "_").trim();
    }

    /**
     * Formats raw stream date strings like "Jun 10, 2026" or "2026-06-10".
     */
    function formatDate(dateStr) {
        if (!dateStr) return "";
        const cleanStr = dateStr.replace(/^Streamed on /i, "").trim();
        const parsedDate = new Date(cleanStr);
        if (isNaN(parsedDate.getTime())) return cleanStr;
        return parsedDate.toISOString().split('T')[0]; // Output: YYYY-MM-DD
    }

    /**
     * Parses the track metadata from the DOM element, applies rules, and generates the final filename.
     */
    function generateFilename(trackItem) {
        const fullTitle = trackItem.querySelector('.track-title')?.textContent.trim() || "";
        let artist = trackItem.querySelector('.track-artist')?.textContent.trim() || "";
        const rawDate = trackItem.querySelector('.track-stream-date')?.getAttribute('title') ||
                        trackItem.querySelector('.track-stream-date')?.textContent.trim() || "";

        const date = formatDate(rawDate);

        // Extract song title and cover artist from patterns like "Last Dinosaurs - Zoom (Evil)"
        let title = fullTitle;
        let coverBy = artist;

        const titleMatch = fullTitle.match(/^(.*?)\s*-\s*(.*?)\s*\((.*?)\)$/);
        if (titleMatch) {
            artist = titleMatch[1].trim();
            title = titleMatch[2].trim();
            coverBy = titleMatch[3].trim();
        }

        // Apply conditional overrides
        CONDITIONAL_OVERRIDES.forEach(rule => {
            if (rule.field === "CoverBy" && coverBy === rule.match) coverBy = rule.replacement;
            if (rule.field === "Artist" && artist === rule.match) artist = rule.replacement;
            if (rule.field === "Title" && title === rule.match) title = rule.replacement;
        });

        // Replace template placeholders
        let filename = TEMPLATE_STRING
            .replace("{Artist}", artist)
            .replace("{Title}", title)
            .replace("{CoverBy}", coverBy)
            .replace("{Date}", date);

        return sanitizeFilename(filename);
    }

    /**
     * Intercepts download clicks from both direct buttons and detached context menus.
     */
    document.addEventListener('click', async function(event) {
        // Track the parent song item whenever the "More options" button is clicked
        const moreBtn = event.target.closest('button.more-btn');
        if (moreBtn) {
            lastActiveTrackItem = moreBtn.closest('.cover-list-item');
            return;
        }

        const downloadBtn = event.target.closest('button.download-btn');
        const menuDownloadItem = event.target.closest('.mud-menu-item');

        let isDownloadAction = false;
        let targetElement = null;

        if (downloadBtn) {
            isDownloadAction = true;
            targetElement = downloadBtn;
        } else if (menuDownloadItem) {
            const text = menuDownloadItem.textContent || "";
            if (text.includes("Download")) {
                isDownloadAction = true;
                targetElement = menuDownloadItem;
            }
        }

        if (!isDownloadAction) return;

        // Resolve track item via direct DOM hierarchy or fallback to the last opened context menu target
        const trackItem = targetElement.closest('.cover-list-item') || lastActiveTrackItem;
        if (!trackItem) return;

        // Prevent default site popup/download trigger
        event.preventDefault();
        event.stopPropagation();

        const customFilename = generateFilename(trackItem);

        // Give visual feedback on the track item
        trackItem.style.opacity = '0.7';

        try {
            // Locate target media link or trigger network fetch
            const audioEl = trackItem.querySelector('audio') || document.querySelector('audio');
            let mediaUrl = audioEl ? audioEl.src : null;

            if (!mediaUrl) {
                const tempLink = document.createElement('a');
                tempLink.download = customFilename + ".mp3";
                tempLink.click();
                return;
            }

            const response = await fetch(mediaUrl);
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);

            const tempLink = document.createElement('a');
            tempLink.href = blobUrl;
            tempLink.download = customFilename + ".mp3";
            document.body.appendChild(tempLink);
            tempLink.click();
            document.body.removeChild(tempLink);

            setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
        } catch (err) {
            console.error("Custom download failed, falling back to default:", err);
        } finally {
            trackItem.style.opacity = '1';
        }
    }, true);

    // Initialise style injection and sign-in automation on load
    function init() {
        injectAlwaysVisibleStyles();
        autoClickSignIn();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Also use a light mutation observer just in case the sign-in sidebar/nav renders asynchronously
    const observer = new MutationObserver(() => {
        autoClickSignIn();
    });
    observer.observe(document.body, { childList: true, subtree: true });

})();
