const express = require("express");
const path = require("path");
const mongoose = require("mongoose");

const app = express();
app.use(express.json()); // Middleware to parse JSON bodies

const PORT = process.env.PORT || 5000;
const jwt = require("jsonwebtoken");
const User = require("./models/User");
const Playlist = require("./models/Playlist");

// Secret key for JWT (in production, use process.env.JWT_SECRET)
const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/balle_balle")
  .then(() => console.log("Connected to MongoDB successfully"))
  .catch(err => console.error("MongoDB connection error:", err));
const YOUTUBE_SEARCH_API = "YouTube Data API v3";
const ITUNES_SEARCH_API = "iTunes Search API";
const PLACEHOLDER_KEYS = ["PASTE_YOUR_KEY_HERE", "YOUR_REAL_KEY", "your_youtube_data_api_v3_key"];

function hasUsableYoutubeKey() {
  const key = process.env.YOUTUBE_API_KEY;
  return Boolean(key && !PLACEHOLDER_KEYS.includes(key));
}

const SONGS = [
  { id: "s1", title: "Tum Hi Ho", movie: "Aashiqui 2", singer: "Arijit Singh", composer: "Mithoon", year: 2013, youtubeId: "WWZxDA81JFk" },
  { id: "s2", title: "Kal Ho Naa Ho", movie: "Kal Ho Naa Ho", singer: "Sonu Nigam", composer: "Shankar-Ehsaan-Loy", year: 2003, youtubeId: "g0eO74UmRBs" },
  { id: "s3", title: "Chaiyya Chaiyya", movie: "Dil Se", singer: "Sukhwinder Singh, Sapna Awasthi", composer: "A. R. Rahman", year: 1998, youtubeId: "9yGukg6SSZ4" },
  { id: "s4", title: "Kesariya", movie: "Brahmāstra", singer: "Arijit Singh", composer: "Pritam", year: 2022, youtubeId: "BddP6PYo2gs" },
  { id: "s5", title: "Tum Se Hi", movie: "Jab We Met", singer: "Mohit Chauhan", composer: "Pritam", year: 2007, youtubeId: "mt9xg0mmt28" },
  { id: "s6", title: "Channa Mereya", movie: "Ae Dil Hai Mushkil", singer: "Arijit Singh", composer: "Pritam", year: 2016, youtubeId: "284Ov7ysmfA" },
];

app.get("/api/songs", (req, res) => {
  res.json({ songs: SONGS });
});

app.get("/api/search", async (req, res) => {
  const query = String(req.query.q || "").trim();
  if (!query) return res.json({ songs: [] });

  try {
    const youtubeApiKey = process.env.YOUTUBE_API_KEY;

    if (hasUsableYoutubeKey()) {
      const youtubeUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&regionCode=IN&maxResults=25&q=${encodeURIComponent(query)}&key=${encodeURIComponent(youtubeApiKey)}`;
      const youtubeResponse = await fetch(youtubeUrl);
      if (!youtubeResponse.ok) throw new Error(`YouTube returned ${youtubeResponse.status}`);
      const youtubeData = await youtubeResponse.json();
      const songs = (youtubeData.items || [])
        .filter((item) => item.id && item.id.videoId)
        .map((item) => ({
          id: `youtube-${item.id.videoId}`,
          title: item.snippet.title,
          movie: "YouTube",
          singer: item.snippet.channelTitle,
          year: item.snippet.publishedAt ? new Date(item.snippet.publishedAt).getFullYear() : "",
          youtubeId: item.id.videoId,
          external: true,
        }));
      return res.json({ songs, provider: YOUTUBE_SEARCH_API });
    }

    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&country=IN&media=music&entity=song&limit=25`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`iTunes returned ${response.status}`);
    const data = await response.json();
    const songs = (data.results || []).map((song) => ({
      id: `itunes-${song.trackId}`,
      title: song.trackName,
      movie: song.collectionName || "Single",
      singer: song.artistName,
      year: song.releaseDate ? new Date(song.releaseDate).getFullYear() : "",
      artworkUrl: song.artworkUrl100,
      previewUrl: song.previewUrl,
      external: true,
    }));
    res.json({ songs, provider: ITUNES_SEARCH_API });
  } catch {
    res.status(502).json({ error: "Music search is temporarily unavailable." });
  }
});

// --- Authentication Routes ---
app.post("/api/auth/signup", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: "Please provide all fields" });
    }

    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ error: "Username or email already exists" });
    }

    const user = await User.create({ username, email, password });
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "30d" });

    res.status(201).json({ token, user: { id: user._id, username: user.username, email: user.email } });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ error: "Server error during signup: " + err.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Please provide email and password" });
    }

    // Select password because we set it to select:false in the schema
    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "30d" });
    res.json({ token, user: { id: user._id, username: user.username, email: user.email } });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error during login" });
  }
});

// --- Auth Middleware ---
const protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1];
  }
  if (!token) return res.status(401).json({ error: "Not authorized, no token" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = await User.findById(decoded.id).select("-password");
    next();
  } catch (error) {
    res.status(401).json({ error: "Not authorized, token failed" });
  }
};

// --- Playlist Routes ---
app.get("/api/playlists", protect, async (req, res) => {
  try {
    const playlists = await Playlist.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json({ playlists });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch playlists" });
  }
});

app.post("/api/playlists", protect, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Playlist name is required" });

    const playlist = await Playlist.create({ name, user: req.user._id, songs: [] });
    res.status(201).json({ playlist });
  } catch (err) {
    res.status(500).json({ error: "Failed to create playlist" });
  }
});

app.post("/api/playlists/:id/songs", protect, async (req, res) => {
  try {
    const { song } = req.body;
    if (!song) return res.status(400).json({ error: "Song data is required" });

    const playlist = await Playlist.findOne({ _id: req.params.id, user: req.user._id });
    if (!playlist) return res.status(404).json({ error: "Playlist not found" });

    // Prevent duplicate songs in playlist
    if (!playlist.songs.find(s => s.id === song.id)) {
      playlist.songs.push(song);
      await playlist.save();
    }
    
    res.json({ playlist });
  } catch (err) {
    res.status(500).json({ error: "Failed to add song to playlist" });
  }
});

app.delete("/api/playlists/:id/songs/:songId", protect, async (req, res) => {
  try {
    const playlist = await Playlist.findOne({ _id: req.params.id, user: req.user._id });
    if (!playlist) return res.status(404).json({ error: "Playlist not found" });

    playlist.songs = playlist.songs.filter(s => s.id !== req.params.songId);
    await playlist.save();
    
    res.json({ playlist });
  } catch (err) {
    res.status(500).json({ error: "Failed to remove song" });
  }
});

app.use(express.static(path.join(__dirname, "..", "client")));

app.listen(PORT, () => {
  const provider = hasUsableYoutubeKey() ? YOUTUBE_SEARCH_API : ITUNES_SEARCH_API;
  console.log(`\n  Anant Music Streaming is running: http://localhost:${PORT}`);
  console.log(`  Search provider: ${provider}\n`);
});
