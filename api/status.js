// Vercel serverless function — GET /api/status
// Returns { ready: true/false } based on whether the API key is configured.
// The key itself is never exposed.

const KEY_PLACEHOLDER = 'your_stitch_api_key_here';

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const key   = process.env.STITCH_API_KEY || '';
  const ready = !!(key && key !== KEY_PLACEHOLDER);
  res.status(200).json({ ready });
}
