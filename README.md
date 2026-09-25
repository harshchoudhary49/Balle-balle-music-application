# Anant Music Streaming — a Hindi songs radio

A simple, single-purpose app: one cohesive design, no mood grid, no theme
switcher — just a small curated station of well-known Hindi film songs,
always ready to play.

## How playback actually works

Songs stream through **YouTube's own official embedded player** (the
`iframe_api`) — the same approach the reference site (Deluxe Saloon) uses.
Nothing is downloaded, scraped, or re-hosted on this server; the app just
loads a real, official YouTube video ID into YouTube's own player and hides
the video chrome, showing only the custom play/pause/seek controls. This is
why playback is real and reliable, unlike the previous version's dependency
on an indie-artist network that often didn't have the actual song you wanted.

## Why this fixes "can't search every song"

The earlier version searched an open but independent-artist music network,
which simply doesn't carry mainstream Hindi/Bollywood tracks — no amount of
query-tuning could fix that gap. This version flips the approach: it ships a
small, hand-verified list of real, well-known songs (each YouTube video ID
was looked up and checked against an official label/production-house upload
before being added), and search is scoped honestly to *that list* — so
search now always works correctly, because it's not pretending to cover more
than it does. Growing the station is just adding more verified entries to
`SONGS` in `server/server.js`.

## What's in the station right now

| Song | Film | Singer(s) | Year |
|---|---|---|---|
| Tum Hi Ho | Aashiqui 2 | Arijit Singh | 2013 |
| Kal Ho Naa Ho | Kal Ho Naa Ho | Sonu Nigam | 2003 |
| Chaiyya Chaiyya | Dil Se | Sukhwinder Singh, Sapna Awasthi | 1998 |
| Kesariya | Brahmāstra | Arijit Singh | 2022 |
| Tum Se Hi | Jab We Met | Mohit Chauhan | 2007 |
| Channa Mereya | Ae Dil Hai Mushkil | Arijit Singh | 2016 |

Song credits are factual metadata pulled from film soundtrack listings — no
lyrics or copyrighted text are stored or displayed anywhere in the app.

## About the visuals

The uploaded artwork and Deluxe Saloon's own illustration are both someone
else's copyrighted work, so neither is reproduced here. Instead the backdrop
is an **original evening skyline scene** — gradient sunset sky, a glowing
sun, layered rooftop silhouettes, and a simple gramophone silhouette — built
from scratch as inline SVG in `client/script.js` (`SCENE_SVG`).

## Project structure

```
balle-balle/
  server/
    server.js       Express server: serves /api/songs and the frontend
    package.json
  client/
    index.html       The whole UI (one page, no theme switching)
    style.css         One cohesive warm/radio-style aesthetic
    script.js         YouTube IFrame Player integration + song list + search
  README.md
```

## Running it in VS Code

Requires **Node.js 18+**.

```bash
cd server
npm install
npm start
```

Then open **http://localhost:5000**.

## Adding more songs

Open `server/server.js` and add an entry to the `SONGS` array:

```js
{ id: "s7", title: "Song Name", movie: "Film Name", singer: "Singer Name",
  composer: "Composer Name", year: 2020, youtubeId: "REAL_VIDEO_ID" }
```

Get `youtubeId` from the `v=` parameter of a real `youtube.com/watch?v=...`
URL for an official upload — don't guess or reuse an unrelated ID, since the
player will simply try to load whatever ID is there.

## Honest limits

- This is a small, hand-picked station, not a full streaming catalog. That's
  a deliberate trade-off for "search actually works" over "pretend to search
  everything."
- Getting a truly open-ended "search and play any song" experience needs
  either a paid license from a service like Spotify/Apple Music, or wiring
  up YouTube's official Data API with your own API key so search queries can
  return real video IDs dynamically — happy to help build that next if you
  get a key.
