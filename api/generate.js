// Vercel serverless function — POST /api/generate
// Calls the Google Stitch SDK server-side so the API key never reaches the browser.

const KEY_PLACEHOLDER = 'your_stitch_api_key_here';
const STITCH_API_KEY  = process.env.STITCH_API_KEY || '';

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

async function generateScreens(description, style, platform, count) {
  let StitchToolClient;
  try {
    const mod = await import('@google/stitch-sdk');
    StitchToolClient = mod.StitchToolClient;
  } catch (err) {
    throw new Error('SDK not installed or failed to load: ' + (err && err.message));
  }

  if (!STITCH_API_KEY || STITCH_API_KEY === KEY_PLACEHOLDER) {
    throw new Error('API key not configured. Add STITCH_API_KEY to Vercel environment variables.');
  }

  const deviceType = platform === 'web' ? 'DESKTOP' : 'MOBILE';
  const client = new StitchToolClient({ apiKey: STITCH_API_KEY });

  try {
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
      console.log('  [2/3] Generating screen ' + (i + 1) + ' of ' + count + ' (' + deviceType + ')...');
      const genResult = await client.callTool('generate_screen_from_text', {
        projectId,
        prompt: buildPrompt(description, style, platform, i),
        deviceType,
      });

      let htmlUrl  = null;
      let imgUrl   = null;
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

      if (!htmlUrl) throw new Error('No HTML download URL in API response.');
      if (!imgUrl)  throw new Error('No screenshot URL in API response.');

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let payload;
  try {
    // Vercel parses JSON body automatically when Content-Type is application/json
    payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    res.status(400).json({ error: 'Invalid JSON in request body' });
    return;
  }

  const description = (payload.description || '').trim();
  const style       = (payload.style || 'Modern and Minimal').trim();
  const platform    = payload.platform === 'web' ? 'web' : 'mobile';
  const count       = 1; // Vercel: cap at 1 — Stitch generation can take 30-60s per screen

  if (!description) {
    res.status(400).json({ error: 'description is required' });
    return;
  }

  console.log('\n  Generating: ' + description.slice(0, 70));
  console.log('  Style: ' + style + ' | Platform: ' + platform + ' | Count: ' + count);

  try {
    const results = await generateScreens(description, style, platform, count);
    res.status(200).json({ results });
  } catch (err) {
    console.error('  ERROR: ' + err.message);
    res.status(500).json({ error: err.message });
  }
}
