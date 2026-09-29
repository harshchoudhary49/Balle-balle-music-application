(function () {
  "use strict";

  const SCENE_SVG = `
    <svg class="scene-svg" viewBox="0 0 800 320" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#FFD68A"/>
          <stop offset="55%" stop-color="#E85D3D" stop-opacity="0.8"/>
          <stop offset="100%" stop-color="#1B0F0A"/>
        </linearGradient>
        <radialGradient id="sunGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#FFF7E8" stop-opacity="0.9"/>
          <stop offset="100%" stop-color="#FFB74D" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="800" height="320" fill="url(#skyGrad)"/>
      <circle cx="600" cy="120" r="90" fill="url(#sunGlow)"/>
      <circle cx="600" cy="120" r="30" fill="#FFB74D"/>
      <!-- distant rooftop skyline -->
      <g fill="#000" opacity="0.35">
        <rect x="0" y="185" width="60" height="90"/>
        <rect x="70" y="160" width="45" height="115"/>
        <path d="M92 160 a22 22 0 0 1 44 0 Z" transform="translate(-22,0)"/>
        <rect x="130" y="200" width="55" height="75"/>
        <rect x="640" y="170" width="60" height="105"/>
        <rect x="710" y="195" width="50" height="80"/>
        <path d="M712 195 a25 25 0 0 1 50 0 Z"/>
        <rect x="770" y="150" width="30" height="125"/>
      </g>
      <!-- nearer rooftop row -->
      <g fill="#000" opacity="0.55">
        <rect x="0" y="235" width="90" height="45"/>
        <rect x="100" y="220" width="70" height="60"/>
        <rect x="600" y="230" width="80" height="50"/>
        <rect x="690" y="215" width="60" height="65"/>
        <path d="M690 215 a30 30 0 0 1 60 0 Z"/>
      </g>
      <!-- ground -->
      <rect x="0" y="272" width="800" height="48" fill="#000" opacity="0.75"/>
      <!-- simple gramophone silhouette -->
      <g transform="translate(360,230)" fill="#000" opacity="0.85">
        <rect x="-6" y="18" width="46" height="26" rx="4"/>
        <path d="M40,18 C68,18 78,-2 96,-16 C86,-14 74,-10 64,4 C58,-6 60,-20 76,-30 C56,-26 40,-8 40,18 Z"/>
        <circle cx="90" cy="-20" r="16"/>
      </g>
    </svg>
  `;

  let songs = [];
  let currentIndex = -1;
  let player = null;
  let playerReady = false;
  let pendingPlayIndex = null;
  let progressTimer = null;
  let displayedSongs = [];
  let previewAudio = null;
  let currentSearchId = null;
  let searchRequestId = 0;
  let playerInitializing = false;
  
  let toastTimer = null;
  function showToast(message) {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove("show");
    }, 3000);
  }

  function fmt(sec) {
    if (sec == null || !isFinite(sec) || sec < 0) return "0:00";
    sec = Math.floor(sec);
    const m = Math.floor(sec / 60), s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function songRowHTML(song, index) {
    const isPlaying = song.external ? song.id === currentSearchId : index === currentIndex;
    return `
      <div class="song-row ${isPlaying ? "playing" : ""}" data-id="${escapeHtml(song.id)}" data-index="${song.external ? "" : index}" data-external="${Boolean(song.external)}">
        <span class="s-idx">${isPlaying ? "▶" : index + 1}</span>
        <span>
          <p class="s-title">${escapeHtml(song.title)}</p>
          <p class="s-meta">${escapeHtml(song.movie)} · ${escapeHtml(song.singer)}</p>
        </span>
        <span class="s-year">${song.year}</span>
        <span class="s-play"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7L8 5Z"/></svg></span>
        <button class="s-add" title="Add to Playlist">+</button>
      </div>
    `;
  }

  function renderList(filterTerm) {
    const term = (filterTerm || "").trim().toLowerCase();
    const filtered = term
      ? songs.filter((s) =>
          s.title.toLowerCase().includes(term) ||
          s.movie.toLowerCase().includes(term) ||
          s.singer.toLowerCase().includes(term)
        )
      : songs;

    displayedSongs = filtered;
    renderSongs(filtered);
  }

  function renderSongs(filtered) {
    const box = document.getElementById("songList");
    if (!filtered.length) {
      box.innerHTML = `<div class="empty-state"><p>No songs found.</p></div>`;
      return;
    }
    box.innerHTML = filtered.map((song, index) => songRowHTML(song, index)).join("");
  }

  function updateNowPlaying() {
    const s = songs[currentIndex];
    document.getElementById("npTitle").textContent = s ? s.title : "Loading the station…";
    document.getElementById("npMeta").textContent = s ? `${s.movie} · ${s.singer} · ${s.year}` : "—";
    document.querySelectorAll(".song-row").forEach(row => {
      const isExternal = row.dataset.external === "true";
      const isPlaying = isExternal
        ? row.dataset.id === currentSearchId
        : Number(row.dataset.index) === currentIndex;
      row.classList.toggle("playing", isPlaying);
      const idxEl = row.querySelector(".s-idx");
      idxEl.textContent = isPlaying ? "▶" : idxEl.textContent;
    });
  }

  function playIndex(index) {
    if (index < 0 || index >= songs.length) return;
    if (previewAudio) previewAudio.pause();
    currentSearchId = null;
    currentIndex = index;
    updateNowPlaying();
    if (!playerReady) {
      pendingPlayIndex = index;
      return;
    }
    player.loadVideoById(songs[index].youtubeId);
  }

  function playSearchSong(song) {
    if (!song.previewUrl && !song.youtubeId) return;
    if (previewAudio) previewAudio.pause();
    currentSearchId = song.id;
    currentIndex = -1;
    document.getElementById("npTitle").textContent = song.title;
    document.getElementById("npMeta").textContent = `${song.movie} · ${song.singer} · ${song.year}`;
    if (song.youtubeId) {
      if (playerReady) {
        player.loadVideoById(song.youtubeId);
      }
    } else {
      if (playerReady) player.pauseVideo();
      previewAudio = new Audio(song.previewUrl);
      previewAudio.loop = false;
      previewAudio.addEventListener("play", () => setPlayIcon(true));
      previewAudio.addEventListener("pause", () => setPlayIcon(false));
      previewAudio.addEventListener("ended", () => {
        setPlayIcon(false);
        playNextSearchSong();
      });
      previewAudio.addEventListener("error", () => setPlayIcon(false));
      previewAudio.play().catch(() => setPlayIcon(false));
      startProgressLoop();
    }
    renderSongs(displayedSongs);
  }

  function playNextSearchSong() {
    const currentResultIndex = displayedSongs.findIndex(item => item.id === currentSearchId);
    const nextResult = displayedSongs[(currentResultIndex + 1) % displayedSongs.length];
    if (nextResult) playSearchSong(nextResult);
  }

  function next() {
    if (!songs.length) return;
    playIndex((currentIndex + 1) % songs.length);
    if (playerReady) player.playVideo();
  }

  function prev() {
    if (!songs.length) return;
    playIndex((currentIndex - 1 + songs.length) % songs.length);
    if (playerReady) player.playVideo();
  }

  function togglePlay() {
    const currentSearchSong = displayedSongs.find(song => song.id === currentSearchId);
    if (currentIndex === -1 && currentSearchSong) {
      if (currentSearchSong.youtubeId && playerReady) {
        const state = player.getPlayerState();
        if (state === YT.PlayerState.PLAYING) player.pauseVideo();
        else player.playVideo();
      } else if (previewAudio) {
        if (previewAudio.paused) previewAudio.play().catch(() => {});
        else previewAudio.pause();
      }
      return;
    }
    if (!playerReady) return;
    const state = player.getPlayerState();
    if (state === YT.PlayerState.PLAYING) {
      player.pauseVideo();
    } else if (currentIndex === -1) {
      playIndex(0);
      player.playVideo();
    } else {
      player.playVideo();
    }
  }

  function setPlayIcon(isPlaying) {
    document.getElementById("playIcon").style.display = isPlaying ? "none" : "";
    document.getElementById("pauseIcon").style.display = isPlaying ? "" : "none";
  }

  function startProgressLoop() {
    clearInterval(progressTimer);
    progressTimer = setInterval(() => {
      const currentSearchSong = displayedSongs.find(song => song.id === currentSearchId);
      const usingPreview = currentSearchSong && !currentSearchSong.youtubeId && previewAudio;
      if (!usingPreview && !playerReady) return;
      const dur = usingPreview ? (previewAudio.duration || 0) : (player.getDuration() || 0);
      const cur = usingPreview ? (previewAudio.currentTime || 0) : (player.getCurrentTime() || 0);
      document.getElementById("curTime").textContent = fmt(cur);
      document.getElementById("durTime").textContent = fmt(dur);
      const seek = document.getElementById("seek");
      if (!seek.matches(":active") && dur > 0) {
        seek.value = (cur / dur) * 100;
      }
    }, 500);
  }
 
  window.onYouTubeIframeAPIReady = function () {
    if (player || playerInitializing) return;
    playerInitializing = true;
    player = new YT.Player("ytplayer", {
      height: "0",
      width: "0",
      playerVars: {
        autoplay: 0,
        playsinline: 1,
        controls: 0,
        rel: 0,
        origin: window.location.origin,
      },
      events: {
        onReady: () => {
          playerReady = true;
          startProgressLoop();
          if (pendingPlayIndex !== null) {
            player.loadVideoById(songs[pendingPlayIndex].youtubeId);
            pendingPlayIndex = null;
          } else if (songs.length && currentIndex === -1) {
            playIndex(0);
          }
        },
        onStateChange: (e) => {
          if (e.data === YT.PlayerState.PLAYING) setPlayIcon(true);
          if (e.data === YT.PlayerState.PAUSED) setPlayIcon(false);
          if (e.data === YT.PlayerState.ENDED) {
            if (currentSearchId) playNextSearchSong();
            else next();
          }
        },
        onError: () => {
          setPlayIcon(false);
          document.getElementById("npMeta").textContent = "This track cannot be played in the embedded player.";
        },
      },
    });
  };

  if (window.YT && window.YT.Player) window.onYouTubeIframeAPIReady();

  document.getElementById("playBtn").addEventListener("click", togglePlay);
  document.getElementById("nextBtn").addEventListener("click", next);
  document.getElementById("prevBtn").addEventListener("click", prev);
  document.getElementById("seek").addEventListener("input", (e) => {
    const currentSearchSong = displayedSongs.find(song => song.id === currentSearchId);
    const usingPreview = currentSearchSong && !currentSearchSong.youtubeId && previewAudio;
    if (usingPreview) {
      const dur = previewAudio.duration || 0;
      if (dur) previewAudio.currentTime = (Number(e.target.value) / 100) * dur;
      return;
    }
    if (!playerReady) return;
    const dur = player.getDuration() || 0;
    player.seekTo((Number(e.target.value) / 100) * dur, true);
  });

  document.addEventListener("click", async (e) => {
    // Add to playlist click
    const addBtn = e.target.closest(".s-add");
    if (addBtn) {
      const row = addBtn.closest("[data-id]");
      const song = displayedSongs.find(item => item.id === row.dataset.id) || currentViewPlaylist?.songs.find(item => item.id === row.dataset.id);
      openPlaylistSelector(song);
      return;
    }
    
    // Remove from playlist click
    const delBtn = e.target.closest(".s-delete");
    if (delBtn) {
      const row = delBtn.closest("[data-id]");
      const songId = row.dataset.id;
      if (currentViewPlaylist && confirm("Remove this song from playlist?")) {
        try {
          const token = localStorage.getItem("token");
          const res = await fetch(`/api/playlists/${currentViewPlaylist._id}/songs/${songId}`, {
            method: "DELETE",
            headers: { "Authorization": `Bearer ${token}` }
          });
          if (res.ok) {
            currentViewPlaylist.songs = currentViewPlaylist.songs.filter(s => s.id !== songId);
            renderPlaylistEditor(currentViewPlaylist);
            fetchPlaylists(); // update background state
            showToast("Removed from playlist");
          }
        } catch(err) {
          showToast("Failed to remove song");
        }
      }
      return;
    }

    // Play song click
    const row = e.target.closest("[data-id]");
    if (row) {
      // Find in currently displayed list
      const songListToSearch = currentViewPlaylist ? currentViewPlaylist.songs : displayedSongs;
      const song = songListToSearch.find(item => item.id === row.dataset.id);
      if (!song) return;
      if (song.external || currentViewPlaylist) {
        // We handle playlist songs as external playing for now since we just play them ad-hoc
        const playableSong = {...song, external: true}; 
        playSearchSong(playableSong);
      } else {
        playIndex(songs.indexOf(song));
        if (playerReady) player.playVideo();
      }
    }
  });

  document.getElementById("searchInput").addEventListener("input", async (e) => {
    const term = e.target.value.trim();
    if (!term) {
      renderList("");
      return;
    }

    const requestId = ++searchRequestId;
    document.getElementById("songList").innerHTML = `<div class="empty-state"><p>Searching for "${escapeHtml(term)}"…</p></div>`;
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
      if (!response.ok) throw new Error("Search request failed");
      const data = await response.json();
      if (requestId !== searchRequestId) return;
      displayedSongs = data.songs || [];
      renderSongs(displayedSongs);
    } catch {
      if (requestId === searchRequestId) {
        document.getElementById("songList").innerHTML = `<div class="empty-state"><p>Search is temporarily unavailable.</p></div>`;
      }
    }
  });

  document.getElementById("scene").innerHTML = SCENE_SVG;

  fetch("/api/songs")
    .then(r => r.json())
    .then(data => {
      songs = data.songs || [];
      displayedSongs = songs;
      renderList("");
      updateNowPlaying();
      if (songs.length && playerReady && currentIndex === -1) playIndex(0);
    })
    .catch(() => {
      document.getElementById("songList").innerHTML =
        `<div class="empty-state"><p>Couldn't load the song list. Make sure the server is running.</p></div>`;
    });

  // --- Auth Modal Logic ---
  const authModal = document.getElementById("authModal");
  const openAuthBtn = document.getElementById("openAuthBtn");
  const closeAuthBtn = document.getElementById("closeAuthBtn");
  const authSwitchBtn = document.getElementById("authSwitchBtn");
  
  const authTitle = document.getElementById("authTitle");
  const authSubtitle = document.getElementById("authSubtitle");
  const usernameGroup = document.getElementById("usernameGroup");
  const authSubmitBtn = document.getElementById("authSubmitBtn");
  const authSwitchText = document.getElementById("authSwitchText");
  const authForm = document.getElementById("authForm");

  let isLogin = true;

  function toggleAuthMode() {
    isLogin = !isLogin;
    if (isLogin) {
      authTitle.textContent = "Welcome Back";
      authSubtitle.textContent = "Login to access your playlists";
      usernameGroup.style.display = "none";
      document.getElementById("authUsername").removeAttribute("required");
      authSubmitBtn.textContent = "Login";
      authSwitchText.textContent = "Don't have an account?";
      authSwitchBtn.textContent = "Sign up";
    } else {
      authTitle.textContent = "Create Account";
      authSubtitle.textContent = "Sign up to save your favorite songs";
      usernameGroup.style.display = "flex";
      document.getElementById("authUsername").setAttribute("required", "true");
      authSubmitBtn.textContent = "Sign Up";
      authSwitchText.textContent = "Already have an account?";
      authSwitchBtn.textContent = "Login";
    }
  }

  openAuthBtn.addEventListener("click", () => {
    authModal.classList.add("active");
  });

  closeAuthBtn.addEventListener("click", () => {
    authModal.classList.remove("active");
  });

  authModal.addEventListener("click", (e) => {
    if (e.target === authModal) {
      authModal.classList.remove("active");
    }
  });

  authSwitchBtn.addEventListener("click", toggleAuthMode);

  authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const email = document.getElementById("authEmail").value.trim();
    const password = document.getElementById("authPassword").value;
    
    let url = "/api/auth/login";
    let body = { email, password };
    
    if (!isLogin) {
      const username = document.getElementById("authUsername").value.trim();
      url = "/api/auth/signup";
      body = { username, email, password };
    }
    
    try {
      authSubmitBtn.disabled = true;
      authSubmitBtn.textContent = "Please wait...";
      
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        alert(data.error || "Authentication failed");
        authSubmitBtn.disabled = false;
        authSubmitBtn.textContent = isLogin ? "Login" : "Sign Up";
        return;
      }
      
      // Success! Store token and fetch playlists
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      
      authModal.classList.remove("active");
      checkAuth();
      
    } catch (err) {
      alert("Network error occurred");
      authSubmitBtn.disabled = false;
      authSubmitBtn.textContent = isLogin ? "Login" : "Sign Up";
    }
  });

  // --- Playlists Logic ---
  let userPlaylists = [];
  const playlistsSection = document.getElementById("playlistsSection");
  const playlistList = document.getElementById("playlistList");
  const createPlaylistBtn = document.getElementById("createPlaylistBtn");
  
  const playlistModal = document.getElementById("playlistModal");
  const closePlaylistBtn = document.getElementById("closePlaylistBtn");
  const playlistOptions = document.getElementById("playlistOptions");
  const playlistSongTitle = document.getElementById("playlistSongTitle");
  
  const allSongsSection = document.getElementById("allSongsSection");
  const playlistEditorSection = document.getElementById("playlistEditorSection");
  const backToSongsBtn = document.getElementById("backToSongsBtn");
  const editorPlaylistName = document.getElementById("editorPlaylistName");
  const editorPlaylistMeta = document.getElementById("editorPlaylistMeta");
  const editorSongList = document.getElementById("editorSongList");
  
  let songToAdd = null;
  let currentViewPlaylist = null;

  backToSongsBtn.addEventListener("click", () => {
    currentViewPlaylist = null;
    playlistEditorSection.style.display = "none";
    allSongsSection.style.display = "block";
    playlistsSection.style.display = "block";
  });

  function checkAuth() {
    const token = localStorage.getItem("token");
    const userStr = localStorage.getItem("user");
    if (token && userStr) {
      const user = JSON.parse(userStr);
      openAuthBtn.textContent = user.username;
      playlistsSection.style.display = "block";
      fetchPlaylists();
    } else {
      playlistsSection.style.display = "none";
    }
  }

  async function fetchPlaylists() {
    const token = localStorage.getItem("token");
    if (!token) return;
    
    try {
      const res = await fetch("/api/playlists", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const data = await res.json();
      userPlaylists = data.playlists || [];
      renderPlaylists();
    } catch (err) {
      console.error(err);
    }
  }

  function renderPlaylists() {
    if (!userPlaylists.length) {
      playlistList.innerHTML = `<div class="empty-state"><p>You haven't created any playlists yet.</p></div>`;
      return;
    }
    
    playlistList.innerHTML = userPlaylists.map((pl, idx) => {
      let coverHtml = `🎶`;
      if (pl.songs.length > 0) {
        const firstSong = pl.songs[0];
        if (firstSong.artworkUrl) {
          coverHtml = `<img src="${firstSong.artworkUrl}" alt="cover">`;
        } else if (firstSong.youtubeId) {
          coverHtml = `<img src="https://img.youtube.com/vi/${firstSong.youtubeId}/hqdefault.jpg" alt="cover">`;
        }
      }
      return `
        <div class="playlist-card" data-idx="${idx}">
          <div class="playlist-cover">${coverHtml}</div>
          <p class="playlist-title" title="${escapeHtml(pl.name)}">${escapeHtml(pl.name)}</p>
          <p class="playlist-meta">${pl.songs.length} song(s)</p>
        </div>
      `;
    }).join("");
    
    // Add click listeners to cards
    playlistList.querySelectorAll(".playlist-card").forEach(card => {
      card.addEventListener("click", () => {
        const pl = userPlaylists[card.dataset.idx];
        renderPlaylistEditor(pl);
      });
    });
  }

  function renderPlaylistEditor(playlist) {
    currentViewPlaylist = playlist;
    allSongsSection.style.display = "none";
    playlistsSection.style.display = "none";
    playlistEditorSection.style.display = "block";
    
    editorPlaylistName.textContent = playlist.name;
    editorPlaylistMeta.textContent = `${playlist.songs.length} song(s)`;
    
    if (playlist.songs.length === 0) {
      editorSongList.innerHTML = `<div class="empty-state"><p>No songs in this playlist yet.</p></div>`;
      return;
    }
    
    editorSongList.innerHTML = playlist.songs.map((song, index) => {
      const isPlaying = song.id === currentSearchId;
      return `
        <div class="song-row ${isPlaying ? "playing" : ""}" data-id="${escapeHtml(song.id)}" data-external="true">
          <span class="s-idx">${isPlaying ? "▶" : index + 1}</span>
          <span>
            <p class="s-title">${escapeHtml(song.title)}</p>
            <p class="s-meta">${escapeHtml(song.movie)} · ${escapeHtml(song.singer)}</p>
          </span>
          <span class="s-year">${song.year || ""}</span>
          <span class="s-play"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7L8 5Z"/></svg></span>
          <button class="s-delete" title="Remove from Playlist">✕</button>
        </div>
      `;
    }).join("");
  }

  // --- Beautiful Playlist Name Dialog Modal ---
  function openPlaylistNameDialog(title = "Create Playlist", subtitle = "Give your playlist a memorable name") {
    return new Promise((resolve) => {
      const modal = document.getElementById("newPlaylistModal");
      const form = document.getElementById("newPlaylistForm");
      const input = document.getElementById("playlistNameInput");
      const closeBtn = document.getElementById("closeNewPlaylistBtn");
      const cancelBtn = document.getElementById("cancelNewPlaylistBtn");
      const titleEl = document.getElementById("newPlaylistTitle");
      const subtitleEl = document.getElementById("newPlaylistSubtitle");
      const submitBtn = document.getElementById("savePlaylistBtn");

      if (titleEl) titleEl.textContent = title;
      if (subtitleEl) subtitleEl.textContent = subtitle;
      if (submitBtn) submitBtn.textContent = "Create Playlist";

      input.value = "";
      modal.classList.add("active");
      setTimeout(() => input.focus(), 60);

      function cleanup() {
        modal.classList.remove("active");
        form.removeEventListener("submit", handleSubmit);
        closeBtn.removeEventListener("click", handleCancel);
        cancelBtn.removeEventListener("click", handleCancel);
        modal.removeEventListener("click", handleBackdrop);
        window.removeEventListener("keydown", handleKey);
      }

      function handleSubmit(e) {
        e.preventDefault();
        const val = input.value.trim();
        cleanup();
        resolve(val || null);
      }

      function handleCancel() {
        cleanup();
        resolve(null);
      }

      function handleBackdrop(e) {
        if (e.target === modal) {
          cleanup();
          resolve(null);
        }
      }

      function handleKey(e) {
        if (e.key === "Escape") {
          cleanup();
          resolve(null);
        }
      }

      form.addEventListener("submit", handleSubmit);
      closeBtn.addEventListener("click", handleCancel);
      cancelBtn.addEventListener("click", handleCancel);
      modal.addEventListener("click", handleBackdrop);
      window.addEventListener("keydown", handleKey);
    });
  }

  createPlaylistBtn.addEventListener("click", async () => {
    const name = await openPlaylistNameDialog("Create Playlist", "Give your playlist a memorable name");
    if (!name) return;
    
    const token = localStorage.getItem("token");
    try {
      const res = await fetch("/api/playlists", {
        method: "POST",
        headers: { 
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ name })
      });
      if (res.ok) {
        fetchPlaylists();
        showToast(`Created "${name}"`);
      } else {
        showToast("Failed to create playlist");
      }
    } catch (err) {
      showToast("Failed to create playlist");
    }
  });

  function openPlaylistSelector(song) {
    const token = localStorage.getItem("token");
    if (!token) {
      showToast("Please login first to create or add playlists");
      authModal.classList.add("active");
      return;
    }
    songToAdd = song;
    playlistSongTitle.textContent = `Adding: ${song.title}`;
    
    let optionsHtml = `
      <button class="playlist-option-btn create-new-pl-btn" style="color: var(--accent1); font-weight: 600;">
        + Create New Playlist
      </button>
    `;

    if (userPlaylists.length > 0) {
      optionsHtml += userPlaylists.map(pl => `
        <button class="playlist-option-btn" data-plid="${pl._id}" data-plname="${escapeHtml(pl.name)}">
          ${escapeHtml(pl.name)} (${pl.songs.length} songs)
        </button>
      `).join("");
    }
    
    playlistOptions.innerHTML = optionsHtml;
    playlistModal.classList.add("active");
  }

  closePlaylistBtn.addEventListener("click", () => {
    playlistModal.classList.remove("active");
  });

  playlistModal.addEventListener("click", async (e) => {
    if (e.target === playlistModal) {
      playlistModal.classList.remove("active");
      return;
    }
    
    // Create new playlist directly from modal
    const createBtn = e.target.closest(".create-new-pl-btn");
    if (createBtn) {
      playlistModal.classList.remove("active");
      const songName = songToAdd ? songToAdd.title : "this song";
      const name = await openPlaylistNameDialog("Create & Add Song", `Name your playlist for "${songName}"`);
      if (!name) {
        playlistModal.classList.add("active");
        return;
      }
      
      const token = localStorage.getItem("token");
      try {
        const res = await fetch("/api/playlists", {
          method: "POST",
          headers: { 
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ name })
        });
        if (res.ok) {
          const data = await res.json();
          // Add song immediately to the newly created playlist
          const addRes = await fetch(`/api/playlists/${data.playlist._id}/songs`, {
            method: "POST",
            headers: { 
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ song: songToAdd })
          });
          if (addRes.ok) {
            fetchPlaylists();
            showToast(`Added to ${name}`);
          }
        } else {
          showToast("Failed to create playlist");
        }
      } catch (err) {
        showToast("Failed to create playlist");
      }
      return;
    }

    // Add song to existing playlist
    const btn = e.target.closest(".playlist-option-btn");
    if (btn && songToAdd) {
      const plId = btn.dataset.plid;
      const plName = btn.dataset.plname;
      const token = localStorage.getItem("token");
      btn.textContent = "Adding...";
      try {
        const res = await fetch(`/api/playlists/${plId}/songs`, {
          method: "POST",
          headers: { 
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ song: songToAdd })
        });
        if (res.ok) {
          playlistModal.classList.remove("active");
          fetchPlaylists(); // refresh counts
          showToast(`Added to ${plName}`);
        } else {
          showToast("Failed to add song");
        }
      } catch (err) {
        showToast("Error adding song");
      }
    }
  });

  // Check auth on load
  checkAuth();
})();
