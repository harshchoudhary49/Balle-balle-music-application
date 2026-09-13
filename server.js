/**
 * Balle Balle backend
 * --------------------
 * Talks to the open Audius music network (https://audius.org) to power
 * real search and real audio streaming - no API key required, no scraping,
 * fully within Audius's public app API.
 *
 * Endpoints:
 *   GET  /api/search?q=<text>&limit=20     -> search real tracks by name/artist
 *   GET  /api/mood/:key                    -> curated tracks for a mood/theme
 *   GET  /api/trending                     -> trending tracks right now
 *   GET  /api/stream/:trackId              -> redirects to a verified playable stream
 *
 * Also serves the frontend from ../client so the whole app runs on one port.
 */

const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 5000;
const APP_NAME = "BalleBalleMusicApp";

// ---- Audius node resolution -------------------------------------------------
// Audius is a decentralized network of independently-run nodes. Any single
// node can be slow or briefly down, so instead of trusting one cached node we
// keep a small pool and try several before giving up - this is the main fix
// for "some songs won't play": a dead node used to kill every track it served.
const FALLBACK_NODES = [
  "https://discoveryprovider.audius.co",
  "https://discoveryprovider2.audius.co",
  "https://discoveryprovider3.audius.co",
  "https://audius-dn1.tikilabs.com",
  "https://dn1.monophonic.digital",
  "https://audius-metadata-1.figment.io",
  "https://discoveryprovider.altego.net",
];

let nodePool = [];
let poolExpiresAt = 0;

async function getNodePool() {
  if (nodePool.length && Date.now() < poolExpiresAt) return nodePool;
  try {
    const r = await fetch("https://api.audius.co", { signal: AbortSignal.timeout(4000) });
    const j = await r.json();
    const nodes = Array.isArray(j.data) ? j.data : [];
    if (nodes.length) {
      // shuffle so we don't hammer the same "first" node every time
      nodePool = shuffle([...nodes]);
      poolExpiresAt = Date.now() + 5 * 60 * 1000;
      return nodePool;
    }
  } catch (err) {
    console.warn("[balle-balle] registry lookup failed, using fallback nodes:", err.message);
  }
  nodePool = shuffle([...FALLBACK_NODES]);
  poolExpiresAt = Date.now() + 60 * 1000;
  return nodePool;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Tries each node in the pool (up to `maxTries`) until one answers successfully.
async function audiusFetch(pathAndQuery, maxTries = 4) {
  const pool = await getNodePool();
  const candidates = [...new Set([...pool, ...FALLBACK_NODES])];
  let lastErr;
  for (const node of candidates.slice(0, maxTries)) {
    try {
      const r = await fetch(`${node}${pathAndQuery}`, { signal: AbortSignal.timeout(7000) });
      if (!r.ok) throw new Error(`Upstream responded ${r.status}`);
      return await r.json();
    } catch (err) {
      lastErr = err;
      continue;
    }
  }
  throw lastErr || new Error("No discovery node responded");
}

function simplifyTrack(t) {
  const artwork = t.artwork || {};
  return {
    id: t.id,
    title: t.title,
    artist: (t.user && (t.user.name || t.user.handle)) || "Unknown artist",
    artwork: artwork["480x480"] || artwork["150x150"] || artwork["1000x1000"] || null,
    duration: typeof t.duration === "number" ? t.duration : null,
    genre: t.genre || null,
    mood: t.mood || null,
    playCount: t.play_count || 0,
  };
}

// Some tracks on Audius are gated (follow-gated, pay-gated, etc.) and will
// never stream for an anonymous app request. We filter those out server-side
// so the frontend only ever lists songs that can actually play.
function isPubliclyStreamable(t) {
  if (t.stream_conditions) return false; // gated (pay/follow/etc.)
  if (t.access && t.access.stream === false) return false;
  if (t.is_streamable === false) return false;
  if (t.is_delete) return false;
  return true;
}

// ---- Mood -> search query mapping ------------------------------------------
const MOODS = {
  love: { query: "love ballad romantic", label: "Love" },
  fight: { query: "fight battle aggressive epic", label: "Fight" },
  war: { query: "war historic epic cinematic", label: "Historic War" },
  revenge: { query: "revenge dark cinematic intense", label: "Revenge" },
  chill: { query: "lofi chill relax calm", label: "Chill" },
  eighties: { query: "80s synthwave retro", label: "80s" },
  nineties: { query: "90s hip hop throwback", label: "90s" },
  workout: { query: "workout gym energy pump", label: "Workout" },
  focus: { query: "focus ambient instrumental", label: "Focus" },
  bhangra: { query: "bhangra punjabi dance", label: "Balle Balle" },
};

app.get("/api/moods", (req, res) => {
  res.json({ moods: Object.entries(MOODS).map(([key, v]) => ({ key, label: v.label })) });
});

async function searchTracks(query, limit) {
  const j = await audiusFetch(
    `/v1/tracks/search?query=${encodeURIComponent(query)}&app_name=${APP_NAME}&limit=${limit}`
  );
  return (j.data || []).filter(isPubliclyStreamable).map(simplifyTrack);
}

app.get("/api/search", async (req, res) => {
  const q = (req.query.q || "").trim();
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
  if (!q) return res.json({ tracks: [] });

  try {
    // ask for extra results since gated tracks get filtered out
    const tracks = await searchTracks(q, Math.min(limit * 2, 60));
    res.json({ tracks: tracks.slice(0, limit) });
  } catch (err) {
    console.error("[balle-balle] search failed:", err.message);
    res.status(502).json({ error: "Could not reach the music network. Try again in a moment.", tracks: [] });
  }
});

app.get("/api/mood/:key", async (req, res) => {
  const mood = MOODS[req.params.key];
  if (!mood) return res.status(404).json({ error: "Unknown mood", tracks: [] });

  try {
    const tracks = await searchTracks(mood.query, 40);
    res.json({ tracks: tracks.slice(0, 25), mood: req.params.key, label: mood.label });
  } catch (err) {
    console.error("[balle-balle] mood fetch failed:", err.message);
    res.status(502).json({ error: "Could not reach the music network. Try again in a moment.", tracks: [] });
  }
});

app.get("/api/trending", async (req, res) => {
  try {
    const j = await audiusFetch(`/v1/tracks/trending?app_name=${APP_NAME}&limit=30`);
    const tracks = (j.data || []).filter(isPubliclyStreamable).map(simplifyTrack);
    res.json({ tracks: tracks.slice(0, 12) });
  } catch (err) {
    console.error("[balle-balle] trending fetch failed:", err.message);
    res.status(502).json({ error: "Could not reach the music network. Try again in a moment.", tracks: [] });
  }
});

// Verifies a stream URL actually responds before sending the browser to it,
// trying multiple nodes in turn. This is the second half of the playback fix.
app.get("/api/stream/:id", async (req, res) => {
  const id = encodeURIComponent(req.params.id);
  const pool = await getNodePool();
  const candidates = [...new Set([...pool, ...FALLBACK_NODES])].slice(0, 6);

  for (const node of candidates) {
    const url = `${node}/v1/tracks/${id}/stream?app_name=${APP_NAME}`;
    try {
      const check = await fetch(url, {
        method: "GET",
        headers: { Range: "bytes=0-1" },
        signal: AbortSignal.timeout(5000),
      });
      if (check.ok || check.status === 206) {
        return res.redirect(url);
      }
    } catch (err) {
      continue; // try next node
    }
  }
  res.status(502).send("This track isn't available to stream right now.");
});

// ---- static frontend --------------------------------------------------------
app.use(express.static(path.join(__dirname, "..", "client")));

app.listen(PORT, () => {
  console.log(`\n  Balle Balle is running: http://localhost:${PORT}\n`);
});
