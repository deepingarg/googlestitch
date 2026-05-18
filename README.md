# DesignAI — UI/UX Screen Generator

Generate high-fidelity mobile and web UI screens from a text description. Powered by the Google Stitch SDK — designs are rendered as real HTML/CSS and exported as PNG images.

---

## Table of Contents

- [How It Works](#how-it-works)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Deploy to Vercel](#deploy-to-vercel)
- [Security — Read This First](#security--read-this-first)
- [Getting Your API Key](#getting-your-api-key)
- [Project Structure](#project-structure)
- [Configuration](#configuration)
- [Running the App](#running-the-app)
- [Features](#features)
- [Troubleshooting](#troubleshooting)
- [How the Code Works](#how-the-code-works)

---

## How It Works

```
Browser (ui-ux-generator.html)
    │
    │  POST /generate  {description, style, platform, count}
    ▼
Node.js server (server.js : port 8080)
    │
    │  Google Stitch SDK (@google/stitch-sdk)
    │   1. create_project         → projectId
    │   2. generate_screen_from_text → HTML + screenshot URLs
    │   3. fetch HTML + PNG from CDN
    │
    │  Returns {html, imageBase64, ...} to browser
    ▼
Browser renders HTML in <iframe> (sharp, live preview)
Download Image → html2canvas captures iframe at 2× retina → PNG
```

The API key **never leaves your server**. The browser only talks to `localhost:8080`.

---

## Prerequisites

| Requirement | Version | Check |
|---|---|---|
| Node.js | v18 or later | `node --version` |
| npm | v8 or later | `npm --version` |
| Google Stitch API key | free | [stitch.withgoogle.com](https://stitch.withgoogle.com) |

---

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
cd YOUR_REPO
```

### 2. Install dependencies

```bash
npm install
```

This installs `@google/stitch-sdk` (the only dependency).

### 3. Set up your API key

```bash
# Copy the example env file
cp .env.example .env
```

Open `.env` and replace the placeholder with your real key:

```
STITCH_API_KEY=AQ.your_actual_key_here
```

> **Never commit `.env` to Git.** It is already in `.gitignore`.

### 4. Start the server

**Windows:**
```
Double-click  "START - UI Generator.bat"
```

**Mac / Linux:**
```bash
npm start
# or
node server.js
```

The browser opens automatically at `http://localhost:8080`.

---

## Deploy to Vercel

The repo includes everything needed to host DesignAI on Vercel for free (Hobby plan). The API key stays server-side inside Vercel's encrypted environment variables — it never reaches the browser.

> **Important — function timeout:** Generating one screen typically takes 15–30 seconds. Vercel Hobby plan has a **10-second** function timeout, which is not enough. You need **Vercel Pro** (60-second timeout) for reliable generation. The `maxDuration: 60` setting in `vercel.json` activates automatically on Pro.

### Steps

**1. Push your code to GitHub** (if you haven't already):

```bash
git add .
git commit -m "Add Vercel deployment"
git push
```

**2. Import the project on Vercel:**

- Go to [vercel.com](https://vercel.com) → **Add New Project**
- Click **Import** next to your GitHub repository
- Leave all build settings at their defaults — Vercel auto-detects the `api/` folder and `public/` folder

**3. Add your API key as an environment variable:**

- In the Vercel project dashboard → **Settings → Environment Variables**
- Add a new variable:
  - **Name:** `STITCH_API_KEY`
  - **Value:** your key from [stitch.withgoogle.com](https://stitch.withgoogle.com) (starts with `AQ.`)
  - **Environments:** Production, Preview, Development (tick all three)
- Click **Save**

**4. Deploy:**

- Go to **Deployments** → click **Redeploy** (or just push a new commit)
- Vercel builds and deploys in ~30 seconds
- Your app is live at `https://your-project.vercel.app`

### How the Vercel version differs from local

| | Local (`npm start`) | Vercel |
|---|---|---|
| Frontend | `ui-ux-generator.html` at `localhost:8080` | `index.html` served by Vercel CDN |
| API key | `.env` file, loaded at server startup | Vercel environment variable, never in code |
| `/generate` | `server.js` HTTP handler | `api/generate.js` serverless function |
| `/status` | `server.js` HTTP handler | `api/status.js` serverless function |
| Timeout | No limit | 60 s (Pro) / 10 s (Hobby — too short) |

Both versions share the same generation logic and the same security model: the API key is always server-side only.

---

## Security — Read This First

### API key is server-side only

The Stitch API key is loaded from `.env` at server startup and used only inside `server.js`. It is **never**:
- Sent to the browser
- Included in the HTML page
- Logged in full to the console
- Exposed via any API endpoint

The `/status` endpoint only returns `{ ready: true/false }` — not the key itself.

### .gitignore protects your secrets

The `.gitignore` excludes:

```
node_modules/    ← large, generated — never commit
.env             ← your API key — NEVER commit
*.log
.DS_Store
Thumbs.db
```

### For new contributors

When someone clones this repo they will **not** have a `.env` file. They must:
1. Get their own API key from [stitch.withgoogle.com](https://stitch.withgoogle.com)
2. Run `cp .env.example .env`
3. Paste their key into `.env`

The server will warn clearly on startup if the key is missing:
```
WARNING: STITCH_API_KEY not set in .env
```

### Local-only server

The server binds to `localhost` only (not `0.0.0.0`). It cannot be reached from other machines on your network. Do not change this for production without adding authentication.

---

## Getting Your API Key

1. Go to [stitch.withgoogle.com](https://stitch.withgoogle.com)
2. Sign in with your Google account
3. Navigate to **Settings → API Keys**
4. Click **Create API Key**
5. Copy the key (starts with `AQ.`)
6. Paste it into your `.env` file as `STITCH_API_KEY=AQ....`

The key is free. Rate limits apply per Google's terms.

---

## Project Structure

```
.
├── server.js                  # Local Node.js HTTP server (npm start)
├── ui-ux-generator.html       # Frontend served by server.js locally
├── index.html                 # Frontend served by Vercel (same as ui-ux-generator.html, /api URLs)
├── api/
│   ├── generate.js            # Vercel serverless function — POST /api/generate
│   └── status.js              # Vercel serverless function — GET /api/status
├── vercel.json                # Vercel deployment config (60s timeout for generate)
├── package.json               # Project metadata and dependencies
├── package-lock.json          # Locked dependency versions
├── .env                       # Your API key — NOT committed to git
├── .env.example               # Template for .env — safe to commit
├── .gitignore                 # Excludes .env, node_modules, etc.
├── START - UI Generator.bat   # Windows one-click launcher (local only)
└── node_modules/              # Installed packages — NOT committed to git
    └── @google/stitch-sdk/    # v0.0.3
```

---

## Configuration

All configuration lives in `.env`:

| Variable | Required | Description |
|---|---|---|
| `STITCH_API_KEY` | Yes | Google Stitch API key (get at stitch.withgoogle.com) |

To change the port, edit line 8 of `server.js`:
```js
const PORT = 8080;
```

---

## Running the App

### Windows
Double-click **START - UI Generator.bat**. A terminal window opens showing the server log. Close it to stop the server.

### Mac / Linux
```bash
npm start
```
Or `node server.js`. Open `http://localhost:8080` in your browser.

### npm scripts
```bash
npm start    # starts node server.js
```

---

## Features

| Feature | Detail |
|---|---|
| **Mobile designs** | iPhone 390×844 — uses Stitch `MOBILE` device type |
| **Web designs** | Desktop 1440×900 — uses Stitch `DESKTOP` device type |
| **Live preview** | Design HTML rendered in a scaled `<iframe>` |
| **Download image** | html2canvas captures the iframe at 2× retina — matches preview exactly |
| **Download HTML** | Full HTML/CSS source from Stitch, open in any browser |
| **Full screen** | Opens live interactive design in a new tab |
| **8 visual styles** | Modern Minimal, Dark Mode, Glassmorphism, Colorful, Material You, iOS Style, Neumorphism, Bold Playful |
| **Generation animation** | Animated device mockup while AI generates the design |

---

## Troubleshooting

### Server won't start — "Port 8080 is already in use"
Another process is on port 8080. Either:
- Kill it: open Task Manager → find `node.exe` → End Task
- Or change `PORT` in `server.js` to another number (e.g. `8081`) and restart

### "Server not running" in the browser status pill
The Node server isn't running. Start it with the `.bat` file or `npm start`.

### "API key not configured" warning
Your `.env` file is missing or has the placeholder value. Steps:
1. Check the file exists: look for `.env` in the project folder (enable "Show hidden files" in Windows Explorer)
2. Open it in Notepad and confirm it looks like: `STITCH_API_KEY=AQ.your_key_here`
3. Restart the server after saving

### Nothing happens after clicking Generate
Open browser DevTools (F12) → Console tab. Any error message will appear there. Common causes:
- Server not running → start it
- Description field is empty → type something first

### Generated design looks different from the download
The download uses `html2canvas` to capture the live iframe — it should match exactly. If it doesn't, it may be because `html2canvas` couldn't access a cross-origin font. In that case the download automatically falls back to the original screenshot from the API.

### "No project ID" or "No screen ID" error
This usually means the API key is invalid or has expired. Get a fresh key from [stitch.withgoogle.com](https://stitch.withgoogle.com).

### `node_modules` is missing after cloning
Run `npm install` in the project folder.

### Windows: double-clicking `.bat` shows an error immediately and closes
Right-click the `.bat` → **Run as administrator**, or open a Command Prompt in the folder and run `node server.js` directly to see the full error message.

### Mac: `node: command not found`
Node.js is not installed. Download from [nodejs.org](https://nodejs.org) — choose the LTS version.

---

## How the Code Works

### server.js

Pure Node.js HTTP server — no Express, no extra frameworks.

**Startup flow:**
1. `loadEnv()` reads `.env` and sets `process.env.STITCH_API_KEY`
2. Server listens on `localhost:8080`
3. On Windows, auto-opens the browser

**Endpoints:**
- `GET /` or `GET /ui-ux-generator.html` → serves the HTML page
- `GET /status` → returns `{ ready: true/false }` based on whether key is set
- `POST /generate` → calls Stitch SDK and returns results

**Generate flow inside `generateScreens()`:**
```
1. new StitchToolClient({ apiKey })
2. callTool('create_project', { title })          → get projectId from response.name
3. callTool('generate_screen_from_text', { projectId, prompt, deviceType })
   → response.outputComponents is an array:
     [0] = designSystem metadata
     [1] = { design: { screens: [{ htmlCode, screenshot, name }] } }
4. Extract htmlCode.downloadUrl and screenshot.downloadUrl
5. fetch() both URLs → return html text + image base64 to browser
```

> **Key insight:** `outputComponents[0]` is always the design system, `outputComponents[1]` contains the actual screen. The code searches all components for one with `design.screens` to be safe.

**Prompt building (`buildPrompt`):**
- Mobile: targets iPhone 390×844, includes status bar and bottom nav
- Web: targets 1440×900 desktop, includes navbar and hero sections
- Each variant index cycles through different layout templates for variety

### ui-ux-generator.html

Self-contained single-page app served by the Node server.

**Key decisions:**
- **No API key in browser** — all requests go to `localhost:8080`
- **iframe preview** — Stitch HTML loaded as a Blob URL, scaled with CSS `transform: scale()` to fit the card width while preserving sharpness
- **Download via html2canvas** — captures the existing rendered iframe at 2× scale, not a separate render — guarantees what you see is what you download
- **Fallback download** — if html2canvas fails (font CORS, etc.), falls back to the Stitch PNG screenshot automatically

---

## Contributing

1. Fork the repo
2. Create a branch: `git checkout -b feature/my-feature`
3. Set up your `.env` with your own API key
4. Make changes
5. Test: start the server, generate a design, download it
6. Commit: `git commit -m "Add my feature"`
7. Push and open a Pull Request

**Never commit `.env` or `node_modules/`** — the `.gitignore` prevents this by default, but be careful if you use `git add -f`.
