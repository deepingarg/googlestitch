import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8080;
const KEY_PLACEHOLDER = 'your_stitch_api_key_here';

// Load .env file manually — no dotenv dependency needed
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (key && val) process.env[key] = val;
  }
}
loadEnv();

const STITCH_API_KEY = process.env.STITCH_API_KEY || '';
if (!STITCH_API_KEY || STITCH_API_KEY === KEY_PLACEHOLDER) {
  console.error('\n  WARNING: STITCH_API_KEY not set in .env\n');
}

// Build the generation prompt based on platform and variant index
function buildPrompt(description, style, platform, variantIndex) {
  if (platform === 'web') {
    const layouts = [
      'full-width hero section with headline and CTA, feature highlights row, dashboard-style content area with sidebar navigation',
      'top navbar with logo and nav links, hero banner with illustration, three-column feature cards, and footer',
    ];
    return (
      'Design a high-fidelity ' + style + ' desktop web app screen (1440x900 viewport). ' +
      'App concept: ' + description + '. ' +
      'Layout: ' + layouts[variantIndex % layouts.length] + '. ' +
      'Include realistic browser chrome, app-specific content with real labels, consistent color palette, ' +
      'all interactive elements visible. Polished pixel-perfect result that looks like a live production website.'
    );
  }
  const layouts = [
    'hero banner at top with key stats, scrollable card feed, and bottom navigation bar with 5 tabs',
    'personalized greeting header, quick-action grid of 4 buttons, horizontal scroll section, and sticky bottom tab bar',
  ];
  return (
    'Design a high-fidelity ' + style + ' mobile app home screen (iPhone portrait 390x844). ' +
    'App concept: ' + description + '. ' +
    'Layout: ' + layouts[variantIndex % layouts.length] + '. ' +
    'Include realistic status bar, app-specific content with real labels, consistent color palette, ' +
    'all interactive elements visible. Polished pixel-perfect result that looks like a shipped product.'
  );
}

// Extract the last path segment from a Stitch resource name
// e.g. "projects/123/screens/456" -> "456"
function extractLastId(nameStr) {
  if (!nameStr) return null;
  const parts = nameStr.split('/');
  return parts[parts.length - 1] || null;
}

// Pull HTML and screenshot download URLs from a Stitch screen data object
// API structure: { htmlCode: { downloadUrl }, screenshot: { downloadUrl } }
function extractUrls(data) {
  if (!data) return { htmlUrl: null, imgUrl: null };
  return {
    htmlUrl: (data.htmlCode && data.htmlCode.downloadUrl) || null,
    imgUrl:  (data.screenshot && data.screenshot.downloadUrl) || null,
  };
}

// Core generation logic — calls Stitch SDK, returns html + image for each screen
async function generateScreens(description, style, platform, count) {
  let StitchToolClient;
  try {
    const mod = await import('@google/stitch-sdk');
    StitchToolClient = mod.StitchToolClient;
  } catch {
    throw new Error('SDK not installed. Run: npm install');
  }

  if (!STITCH_API_KEY || STITCH_API_KEY === KEY_PLACEHOLDER) {
    throw new Error('API key not configured. Add STITCH_API_KEY to your .env file and restart.');
  }

  const deviceType = platform === 'web' ? 'DESKTOP' : 'MOBILE';
  const client = new StitchToolClient({ apiKey: STITCH_API_KEY });

  try {
    // Step 1 — create a project to hold the screens
    console.log('  [1/3] Creating project...');
    const projResult = await client.callTool('create_project', {
      title: description.slice(0, 60).trim(),
    });
    const projectId = extractLastId(projResult && projResult.name);
    if (!projectId) {
      throw new Error('No project ID returned. Check your API key. Response: ' + JSON.stringify(projResult));
    }
    console.log('  [1/3] Project ID: ' + projectId);

    const results = [];

    for (let i = 0; i < count; i++) {
      // Step 2 — generate screen from text prompt
      console.log('  [2/3] Generating screen ' + (i + 1) + ' of ' + count + ' (' + deviceType + ')...');
      const genResult = await client.callTool('generate_screen_from_text', {
        projectId,
        prompt: buildPrompt(description, style, platform, i),
        deviceType,
      });

      // outputComponents is an array: [0] = design system metadata, [1] = screen with HTML/screenshot
      // We search all components for the one that has design.screens
      let htmlUrl = null;
      let imgUrl  = null;
      let screenId = null;

      if (Array.isArray(genResult && genResult.outputComponents)) {
        for (const comp of genResult.outputComponents) {
          const screen = comp && comp.design && comp.design.screens && comp.design.screens[0];
          if (screen) {
            ({ htmlUrl, imgUrl } = extractUrls(screen));
            screenId = screen.id || extractLastId(screen.name);
            console.log('  [2/3] Screen found. ID=' + screenId + ' html=' + !!htmlUrl + ' img=' + !!imgUrl);
            break;
          }
        }
      }

      // Step 3 — if URLs weren't in the generate response, fetch via get_screen
      if (!htmlUrl || !imgUrl) {
        if (!screenId) screenId = extractLastId(genResult && genResult.name);
        if (!screenId) {
          throw new Error('No screen ID in generate response: ' + JSON.stringify(genResult).slice(0, 300));
        }
        console.log('  [3/3] Fetching screen assets via get_screen...');
        const screenData = await client.callTool('get_screen', {
          projectId,
          screenId,
          name: 'projects/' + projectId + '/screens/' + screenId,
        });
        ({ htmlUrl, imgUrl } = extractUrls(screenData));
      }

      if (!htmlUrl) throw new Error('No HTML download URL in API response. See server log.');
      if (!imgUrl)  throw new Error('No screenshot URL in API response. See server log.');

      console.log('  [3/3] Downloading assets...');
      const [htmlRes, imgRes] = await Promise.all([fetch(htmlUrl), fetch(imgUrl)]);
      const html   = await htmlRes.text();
      const imgBuf = Buffer.from(await imgRes.arrayBuffer());

      results.push({
        variant:       i + 1,
        platform,
        html,
        imageBase64:   imgBuf.toString('base64'),
        imageMimeType: imgRes.headers.get('content-type') || 'image/png',
      });
    }

    return results;
  } finally {
    await client.close().catch(() => {});
  }
}

// ─── HTTP helpers ───────────────────────────────────────────────────────────

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJSON(res, code, data) {
  const body = JSON.stringify(data);
  setCORS(res);
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf-8'));
}

// ─── Server ─────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  setCORS(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Serve the frontend
  if (req.method === 'GET' && (req.url === '/' || req.url === '/ui-ux-generator.html')) {
    const filePath = path.join(__dirname, 'ui-ux-generator.html');
    try {
      const html = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (err) {
      const code = err.code === 'ENOENT' ? 404 : 500;
      res.writeHead(code);
      res.end(code === 404 ? 'ui-ux-generator.html not found' : 'Internal server error');
    }
    return;
  }

  // API key health check — returns ready:true/false, never exposes the key
  if (req.method === 'GET' && req.url === '/status') {
    const ready = !!(STITCH_API_KEY && STITCH_API_KEY !== KEY_PLACEHOLDER);
    sendJSON(res, 200, { ready });
    return;
  }

  // Main generation endpoint
  if (req.method === 'POST' && req.url === '/generate') {
    let payload;
    try {
      payload = await readBody(req);
    } catch {
      sendJSON(res, 400, { error: 'Invalid JSON in request body' });
      return;
    }

    const description = (payload.description || '').trim();
    const style       = (payload.style || 'Modern and Minimal').trim();
    const platform    = payload.platform === 'web' ? 'web' : 'mobile';
    const count       = Math.max(1, Math.min(parseInt(payload.count) || 1, 2)); // clamp 1-2

    if (!description) {
      sendJSON(res, 400, { error: 'description is required' });
      return;
    }

    console.log('\n  Generating: ' + description.slice(0, 70));
    console.log('  Style: ' + style + ' | Platform: ' + platform + ' | Count: ' + count);

    try {
      const results = await generateScreens(description, style, platform, count);
      sendJSON(res, 200, { results });
    } catch (err) {
      console.error('  ERROR: ' + err.message);
      sendJSON(res, 500, { error: err.message });
    }
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('\n  ERROR: Port ' + PORT + ' is already in use.\n  Close the other server window and try again.\n');
  } else {
    console.error('\n  ERROR: ' + err.message + '\n');
  }
  process.exit(1);
});

server.listen(PORT, 'localhost', () => {
  const ready = !!(STITCH_API_KEY && STITCH_API_KEY !== KEY_PLACEHOLDER);
  console.log('\n  DesignAI Generator');
  console.log('  http://localhost:' + PORT);
  console.log('  API Key: ' + (ready ? 'OK' : 'NOT SET — edit .env and restart'));
  console.log('  Press Ctrl+C to stop\n');

  const openCmd =
    process.platform === 'win32'  ? 'start "" http://localhost:' + PORT :
    process.platform === 'darwin' ? 'open http://localhost:' + PORT :
    'xdg-open http://localhost:' + PORT;
  exec(openCmd);
});
