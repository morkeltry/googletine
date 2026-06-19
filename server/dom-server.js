#!/usr/bin/env node
// YouTube DOM Server - Serves rendered YouTube pages via DOM forwarding

import express from 'express';
import puppeteer from 'puppeteer';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const PORT = 60123;
const app = express();

app.use(express.json());

// Create output directory for saved HTML
const OUTPUT_DIR = join(process.cwd(), 'output');
if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Helper function for delays
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Global browser and page instances
let browser;
let page;

// Configuration
const FIX_LINKS = true; // Replace relative YouTube links with absolute URLs

/**
 * Get VISITOR_PRIVACY_METADATA cookie value
 */
function getPrivacyMetadata(cookies) {
    const cookie = cookies.find(c => c.name === 'VISITOR_PRIVACY_METADATA');
    return cookie ? cookie.value : null;
}

/**
 * Extract video titles from current page
 */
async function extractVideoTitles() {
    const titles = await page.evaluate(() => {
        const results = [];
        const titleElements = document.querySelectorAll('#video-title, h3, a#video-title');

        titleElements.forEach(el => {
            const title = el.textContent?.trim();
            if (title && title.length > 5 && !results.includes(title)) {
                results.push(title);
            }
        });

        return results.slice(0, 10);
    });

    return titles;
}

/**
 * Navigate and wait for page to fully load
 */
async function navigateAndWait(url) {
    console.log(`Navigating to: ${url}`);

    const cookies = await page.cookies();
    const privacyCookie = getPrivacyMetadata(cookies);
    console.log(`Before request - VISITOR_PRIVACY_METADATA: ${privacyCookie ? privacyCookie.substring(0, 30) + '...' : 'null'}`);

    await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 30000
    });

    console.log('Waiting for JS to complete...');
    await page.waitForFunction(() => {
        return document.readyState === 'complete' &&
               typeof window.ytInitialData !== 'undefined';
    }, { timeout: 15000 }).catch(() => {});

    await delay(2000);
    console.log('Page loaded');

    const afterCookies = await page.cookies();
    const afterPrivacy = getPrivacyMetadata(afterCookies);
    console.log(`After request - VISITOR_PRIVACY_METADATA: ${afterPrivacy ? afterPrivacy.substring(0, 30) + '...' : 'null'}`);

    return afterCookies;
}

/**
 * Wait for YouTube search results to load
 */
async function waitForSearchResults() {
    console.log('⏳ Waiting for search results to load...');

    // Wait for key YouTube search result elements
    try {
        await page.waitForSelector('ytd-video-renderer, ytd-grid-video-renderer, ytd-rich-item-renderer', {
            timeout: 10000
        });
        console.log('   ✅ Search results loaded');
    } catch (e) {
        console.log('   ⚠️ Timeout waiting for results, using fallback...');

        // Fallback: wait for any content
        await delay(3000);

        // Check if any yt-specific elements are present
        const hasContent = await page.evaluate(() => {
            return document.querySelector('ytd-video-renderer') ||
                   document.querySelector('ytd-grid-video-renderer') ||
                   document.querySelector('ytd-rich-item-renderer') ||
                   document.querySelector('ytd-thumbnail') ||
                   document.body.textContent.length > 1000;
        });

        if (hasContent) {
            console.log('   ✅ Content detected');
        } else {
            console.log('   ⚠️ Limited content detected');
        }
    }
}

/**
 * Capture the rendered DOM, remove consent elements, fix links, and save to file
 */
async function captureAndSaveDOM(v, q) {
    console.log('📄 Capturing rendered DOM...');

    const dom = await page.evaluate(() => {
        return document.documentElement.outerHTML;
    });

    console.log(`   Captured ${dom.length} bytes of HTML`);

    // Fix relative YouTube links to absolute URLs
    let processedDom = dom;
    if (FIX_LINKS) {
        processedDom = processedDom.replace(/href="\/watch\?v=([^"]+)"/gi, 'href="https://www.youtube.com/watch?v=$1"');
        processedDom = processedDom.replace(/href="\/shorts\/([^"]+)"/gi, 'href="https://www.youtube.com/shorts/$1"');
        console.log(`Fixed YouTube links to absolute URLs`);
    }

    // Inject inline JS to remove consent elements after page load and every 30 seconds
    const cleanupScript = `
    <script>
    (function() {
        function removeConsentElements() {
            const backdrop = document.querySelector('tp-yt-iron-overlay-backdrop');
            if (backdrop) backdrop.remove();

            const lightbox = document.querySelector('ytd-consent-bump-v2-lightbox');
            if (lightbox) lightbox.remove();

            console.log('Removed consent elements');
        }

        // Run immediately
        removeConsentElements();

        // Run every 30 seconds
        setInterval(removeConsentElements, 30000);
    })();
    </script>
    `;

    // Insert the script before closing body tag
    processedDom = processedDom.replace('</body>', cleanupScript + '</body>');

    // Save to file for later analysis
    const filename = `${v}-${q}-${Date.now()}.html`;
    const filepath = join(OUTPUT_DIR, filename);
    writeFileSync(filepath, processedDom);
    console.log(`Saved to: ${filename}`);

    return processedDom;
}

/**
 * Capture cookies from the page
 */
async function captureCookies(stepName) {
    const cookies = await page.cookies();
    console.log(`🍪 Captured ${cookies.length} cookies (${stepName})`);

    // Log key cookies
    const keyCookies = ['VISITOR_PRIVACY_METADATA', 'VISITOR_INFO1_LIVE', 'YSC', '__Secure-YEC', '__Secure-YENID', 'SOCS', 'CONSENT'];
    console.log('   Key cookies:');
    for (const name of keyCookies) {
        const cookie = cookies.find(c => c.name === name);
        if (cookie) {
            const value = cookie.value.substring(0, 30) + (cookie.value.length > 30 ? '...' : '');
            console.log(`     ${name}: ${value}`);
        }
    }

    return cookies;
}

/**
 * Universal request function
 * @param {string} v - Video identifier (for naming saved files)
 * @param {string} q - Search term
 * @param {number} waitMs - Optional wait time before this request (milliseconds)
 */
async function processYouTubeRequest(v, q, waitMs = 0) {
    if (waitMs > 0) {
        console.log(`=== WAITING ${waitMs}ms ===\n`);
        await delay(waitMs);
    }

    console.log(`🔎 Processing: ${v} (search: "${q}")`);

    try {
        // Step 1: Navigate to YouTube homepage
        console.log('   1. Navigating to YouTube homepage...');
        await page.goto('https://www.youtube.com', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });

        // Step 2: Check for consent dialog (already handled during init, but check again)
        console.log('   2. Checking for consent dialog...');
        await handleConsent();

        // Step 3: Navigate to search results
        const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
        console.log(`   3. Navigating to search: ${searchUrl}`);
        await page.goto(searchUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });

        // Step 4: Wait for content to load
        console.log('   4. Waiting for content to load...');
        await waitForSearchResults();

        // Step 5: Capture cookies and DOM
        console.log('   5. Capturing cookies and DOM...');
        await captureCookies(q);
        const titles = await extractVideoTitles();
        console.log('\n   === VIDEO TITLES ===');
        titles.forEach((title, i) => {
            console.log(`   ${i + 1}. ${title}`);
        });
        console.log('   ===================\n');

        const dom = await captureAndSaveDOM(v, q);

        console.log(`✅ Complete: ${v} - ${dom.length} bytes\n`);
        return dom;

    } catch (error) {
        console.error(`❌ Error processing "${q}": ${error.message}\n`);
        throw error;
    }
}

/**
 * Handle consent dialog - find and click accept button
 */
async function handleConsent() {
    console.log('🔍 Looking for consent button...');

    // Wait a moment for the page to fully render
    await delay(2000);

    const CONSENT_SELECTORS = [
        'button[aria-label*="Accept"]',
        'button[aria-label*="accept"]',
        'button:has-text("Accept")',
        'button:has-text("Accept & Continue")',
        'button:has-text("I agree")',
        'ytd-button-overlay',
        '#yDmbB',
    ];

    for (const selector of CONSENT_SELECTORS) {
        try {
            const button = await page.$(selector);

            if (button) {
                const isVisible = await button.isIntersectingViewport();
                if (isVisible) {
                    const text = await button.evaluate(el => el.textContent || '').trim();
                    console.log(`   Found button: "${text}" (${selector})`);

                    await button.scrollIntoView();
                    await delay(500);
                    await button.click();

                    // Wait for navigation or changes
                    try {
                        await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 5000 });
                    } catch (e) {
                        // AJAX-based consent, wait a bit longer
                        await delay(2000);
                    }

                    console.log('   ✅ Consent button clicked');
                    return true;
                }
            }
        } catch (e) {
            // Continue to next selector
        }
    }

    console.log('   ℹ️ No consent button found (might already be accepted)');
    return false;
}

/**
 * Initialize browser
 */
async function initializeBrowser() {
    console.log('🚀 Launching browser...\n');
    console.log('=== INITIALIZING BROWSER ===\n');

    browser = await puppeteer.launch({
        headless: 'new',
        defaultViewport: { width: 1920, height: 1080 },
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

    // Navigate to YouTube homepage first to establish session
    console.log('📍 Navigating to YouTube homepage...\n');
    await page.goto('https://www.youtube.com', {
        waitUntil: 'networkidle2',
        timeout: 30000
    });

    // Handle consent dialog
    console.log('🔍 Checking for consent dialog...');
    await handleConsent();

    // Wait for content to load
    await delay(2000);

    console.log('\n=== INITIALIZATION REQUESTS ===\n');

    // Request 1: cats (immediate)
    await processYouTubeRequest('init-1', 'cats');

    console.log('=== INITIALIZATION COMPLETE ===\n');
}

/**
 * Navigate to a URL, wait for content, extract titles, and return DOM
 */
async function navigateAndRender(url) {
    console.log(`\n📋 Processing request for: ${url}`);

    // Extract search term from URL for naming
    const urlObj = new URL(url);
    const searchParams = new URLSearchParams(urlObj.search);
    const searchTerm = searchParams.get('search_query') || 'homepage';

    await navigateAndWait(url);

    const titles = await extractVideoTitles();
    console.log('\n=== VIDEO TITLES FOR REQUEST ===');
    titles.forEach((title, i) => {
        console.log(`${i + 1}. ${title}`);
    });
    console.log('==================================\n');

    return await captureAndSaveDOM('req', searchTerm);
}

// Request endpoint - returns rendered YouTube page
app.get('/request', async (req, res) => {
    const url = req.query.url || 'https://www.youtube.com';
    console.log(`[${new Date().toISOString()}] 📥 Received request for: ${url}`);

    try {
        const dom = await navigateAndRender(url);

        res.setHeader('Content-Type', 'text/html');
        res.send(dom);
        console.log(`[${new Date().toISOString()}] ✅ Success: ${dom.length} bytes\n`);

    } catch (error) {
        res.status(500).json({ error: error.message });
        console.log(`[${new Date().toISOString()}] ❌ Error: ${error.message}\n`);
    }
});

// Health check
app.get('/health', async (req, res) => {
    const browserStatus = browser ? 'running' : 'not initialized';
    res.json({
        status: 'ok',
        browser: browserStatus,
        timestamp: new Date().toISOString()
    });
});

// Start server
async function startServer() {
    await initializeBrowser();

    app.listen(PORT, () => {
        console.log('========================================');
        console.log(`YouTube DOM Server listening on port ${PORT}`);
        console.log('========================================');
        console.log(`GET  http://localhost:${PORT}/request?url=<youtube-url>`);
        console.log(`GET  http://localhost:${PORT}/health`);
        console.log(`Output directory: ${OUTPUT_DIR}`);
        console.log('========================================\n');
    });
}

startServer().catch(err => {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
});
