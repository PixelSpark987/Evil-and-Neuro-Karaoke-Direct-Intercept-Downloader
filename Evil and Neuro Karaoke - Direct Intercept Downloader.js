// ==UserScript==
// @name         ENK - Direct Intercept Downloader
// @description  Intercepts and renames individual track downloads on evilkaraoke.com
// @version      2026-10-16_05
// @namespace    http://tampermonkey.net/
// @downloadURL  https://raw.githubusercontent.com/PixelSpark987/Evil-and-Neuro-Karaoke-Direct-Intercept-Downloader/refs/heads/main/Evil%20and%20Neuro%20Karaoke%20-%20Direct%20Intercept%20Downloader.js
// @updateURL    https://raw.githubusercontent.com/PixelSpark987/Evil-and-Neuro-Karaoke-Direct-Intercept-Downloader/refs/heads/main/Evil%20and%20Neuro%20Karaoke%20-%20Direct%20Intercept%20Downloader.js
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
        { field: "CoverBy", match: "Neuro v1", replacement: "Neuro-sama - Version 1" },
        { field: "CoverBy", match: "Neuro v2", replacement: "Neuro-sama - Version 2" },
        { field: "CoverBy", match: "Neuro & Vedal", replacement: "Neuro-sama and Vedal987" },
        { field: "CoverBy", match: "Vedal & Neuro", replacement: "Vedal987 and Neuro-sama" },
        { field: "CoverBy", match: "Evil & Vedal", replacement: "Evil Neuro and Vedal987" },
        { field: "CoverBy", match: "Vedal & Evil", replacement: "Vedal987 and Evil Neuro" },
        { field: "CoverBy", match: "Neuro & MinikoMew", replacement: "Neuro-sama and Miniko Mew" },
        { field: "CoverBy", match: "MinikoMew & Neuro", replacement: "Miniko Mew and Neuro-sama" },
        { field: "CoverBy", match: "Evil & MinikoMew", replacement: "Evil Neuro and Miniko Mew" },
        { field: "CoverBy", match: "MinikoMew & Evil", replacement: "Miniko Mew and Evil Neuro" },
        { field: "CoverBy", match: "Neuro & Cerber", replacement: "Neuro-sama and CerberVT" },
        { field: "CoverBy", match: "Cerber & Neuro", replacement: "CerberVT and Neuro-sama" },
        { field: "CoverBy", match: "Evil & Miyune", replacement: "Evil Neuro and Miyune" },
        { field: "CoverBy", match: "Miyune & Evil", replacement: "Miyune and Evil Neuro" },
        { field: "CoverBy", match: "Neuro & Miyune", replacement: "Neuro-sama and Miyune" },
        { field: "CoverBy", match: "Miyune & Neuro", replacement: "Miyune and Neuro-sama" },
        { field: "CoverBy", match: "Neuro & Annytf", replacement: "Neuro-sama and AnnyTF" },
        { field: "CoverBy", match: "Annytf & Neuro", replacement: "AnnyTF and Neuro-sama" },
    ];

    let lastActiveTrackItem = null;
    let pendingFilename = null;

    /**
     * Hook document.createElement to catch dynamically generated download links
     * and inject our custom filename across all browsers (including mobile).
     */
    const originalCreateElement = document.createElement;
    document.createElement = function(tagName) {
        const el = originalCreateElement.call(document, tagName);
        if (tagName.toLowerCase() === 'a') {
            const originalSetAttribute = el.setAttribute;
            el.setAttribute = function(name, value) {
                if (name === 'download' && pendingFilename) {
                    value = pendingFilename + ".mp3";
                    pendingFilename = null;
                }
                return originalSetAttribute.call(this, name, value);
            };

            Object.defineProperty(el, 'download', {
                set(val) {
                    if (pendingFilename) {
                        val = pendingFilename + ".mp3";
                        pendingFilename = null;
                    }
                    el.setAttribute('download', val);
                },
                get() {
                    return el.getAttribute('download');
                }
            });
        }
        return el;
    };

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
     * Checks if a button is a download button across list and detail views.
     */
    function isDownloadButton(btn) {
        if (!btn || btn.tagName !== 'BUTTON') return false;
        if (btn.classList.contains('download-btn')) return true;
        if (btn.getAttribute('title') === 'Download') return true;
        if (btn.querySelector('path[d*="M5,20h14v-2H5V20z"]')) return true;
        return false;
    }

    /**
     * Parses the track metadata from the DOM element, applies rules, and generates the final filename.
     */
    function generateFilename(trackItem) {
        const fullTitle = trackItem.querySelector('.track-title, .song-title')?.textContent.trim() || "";
        let artist = trackItem.querySelector('.track-artist')?.textContent.trim() || "";
        
        let rawDate = trackItem.querySelector('.track-stream-date')?.getAttribute('title') ||
                        trackItem.querySelector('.track-stream-date')?.textContent.trim() || "";

        if (!rawDate) {
            const textNodes = trackItem.textContent || "";
            const dateMatch = textNodes.match(/(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}/i);
            if (dateMatch) {
                rawDate = dateMatch[0];
            }
        }

        const date = formatDate(rawDate);

        // Extract song title and cover artist from patterns like "Madonna - Material Girl (Neuro)"
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
     * Prepares custom filename queue and triggers visual feedback when download buttons/menu items are clicked.
     */
    document.addEventListener('click', function(event) {
        const moreBtn = event.target.closest('button.more-btn');
        if (moreBtn) {
            lastActiveTrackItem = moreBtn.closest('.cover-list-item, .song-info');
            return;
        }

        const clickedBtn = event.target.closest('button');
        const menuDownloadItem = event.target.closest('.mud-menu-item');

        let isDownloadAction = false;
        let targetElement = null;

        if (clickedBtn && isDownloadButton(clickedBtn)) {
            isDownloadAction = true;
            targetElement = clickedBtn;
        } else if (menuDownloadItem) {
            const text = menuDownloadItem.textContent || "";
            if (text.includes("Download")) {
                isDownloadAction = true;
                targetElement = menuDownloadItem;
            }
        }

        if (!isDownloadAction) return;

        const trackItem = targetElement.closest('.cover-list-item, .song-info') || lastActiveTrackItem;
        if (!trackItem) return;

        // Queue up the custom filename so our document.createElement hook catches it
        pendingFilename = generateFilename(trackItem);

        // Provide visual feedback: dim the clicked download button/item for 500ms
        const originalOpacity = targetElement.style.opacity;
        targetElement.style.transition = 'opacity 0.1s ease';
        targetElement.style.opacity = '0.3';
        setTimeout(() => {
            targetElement.style.opacity = originalOpacity;
        }, 500);

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
