// Vercel serverless function — POST /api/screenshot
// Re-renders the Stitch HTML at 2× device pixel ratio using headless Chromium.
// This gives a sharp, retina-quality PNG — much better than the 1× Stitch screenshot.

import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let payload;
  try {
    payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    res.status(400).json({ error: 'Invalid JSON' });
    return;
  }

  const w = Math.round(Number(payload.width)  || 390);
  const h = Math.round(Number(payload.height) || 844);
  const { html } = payload;
  if (!html) { res.status(400).json({ error: 'html is required' }); return; }

  let browser;
  try {
    // Pass window size via args so Chromium always allocates enough space
    const args = [
      ...chromium.args,
      `--window-size=${w * 2},${h * 2}`,
    ];

    browser = await puppeteer.launch({
      args,
      executablePath: await chromium.executablePath(),
      headless:       chromium.headless,
      defaultViewport: null,   // disable default — we'll set it on the page
    });

    const page = await browser.newPage();

    // Set viewport explicitly on the page at 2× device pixel ratio
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });

    // networkidle2 waits for Google Fonts / Material Icons to finish loading
    await page.setContent(html, { waitUntil: 'networkidle2', timeout: 25000 });

    // Clip exactly to viewport so we always get the right dimensions
    const screenshot = await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width: w, height: h },
    });

    console.log(`[screenshot] ${w}×${h} @2× → ${screenshot.length} bytes`);

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', 'attachment; filename="design.png"');
    res.send(Buffer.from(screenshot));
  } catch (err) {
    console.error('Screenshot error:', err.message);
    res.status(500).json({ error: 'Screenshot failed: ' + err.message });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
