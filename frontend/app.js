// Spotime frontend — Phase 1.
// Core goal: play -> close -> reopen -> resume from saved position.

// Redirect to the login page whenever the server says we're unauthenticated.
const _fetch = window.fetch.bind(window);
window.fetch = async (...args) => {
  const res = await _fetch(...args);
  if (res.status === 401) location.href = "/login.html";
  return res;
};

const api = {
  async list(search) {
    const q = search ? `?search=${encodeURIComponent(search)}` : "";
    return (await fetch(`/api/media${q}`)).json();
  },
  async uploadUrl(filename, contentType) {
    const res = await fetch("/api/media/upload-url", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename, content_type: contentType }),
    });
    if (!res.ok) throw new Error((await res.json()).detail || "could not start upload");
    return res.json();
  },
  async register(body) {
    const res = await fetch("/api/media/register", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error((await res.json()).detail || "register failed");
    return res.json();
  },
  async remove(id) {
    await fetch(`/api/media/${id}`, { method: "DELETE" });
  },
  async getState(id) {
    return (await fetch(`/api/media/${id}/state`)).json();
  },
  async saveState(id, body) {
    // keepalive lets the request survive a page unload (tab close / navigation).
    await fetch(`/api/media/${id}/state`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    });
  },
};

// ----- state -----------------------------------------------------------------
let library = [];
let filter = "all";
let current = null; // the MediaItem (single track) currently loaded in the player
let currentBook = null; // { id, title, tracks, index, artist, artwork_id } when playing a book
let saveTimer = null;

const audio = document.getElementById("audio");
const els = {
  library: document.getElementById("library"),
  search: document.getElementById("search"),
  uploadStatus: document.getElementById("upload-status"),
  fileInput: document.getElementById("file-input"),
  player: document.getElementById("player"),
  art: document.getElementById("player-art"),
  title: document.getElementById("player-title"),
  artist: document.getElementById("player-artist"),
  playPause: document.getElementById("play-pause"),
  seekbar: document.getElementById("seekbar"),
  curTime: document.getElementById("cur-time"),
  durTime: document.getElementById("dur-time"),
  speed: document.getElementById("speed"),
  toast: document.getElementById("toast"),
  shuffleBtn: document.getElementById("shuffle-btn"),
  chaptersBtn: document.getElementById("chapters-btn"),
  chaptersPanel: document.getElementById("chapters-panel"),
  chaptersList: document.getElementById("chapters-list"),
  dropHint: document.getElementById("drop-hint"),
};

let activeChapterIdx = -1;

// Autoplay: when a standalone music track ends, play the next one. Sequential by
// default; shuffle picks a random other track. Persisted across reloads.
let shuffle = localStorage.getItem("spotime_shuffle") === "1";

let toastTimer = null;
function toast(msg) {
  els.toast.textContent = msg;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { els.toast.hidden = true; }, 2500);
}

// ----- helpers ---------------------------------------------------------------
function fmt(sec) {
  if (!sec || isNaN(sec)) return "0:00";
  sec = Math.floor(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return (h ? `${h}:` : "") + `${mm}:${String(s).padStart(2, "0")}`;
}

// ----- rendering -------------------------------------------------------------
async function refresh() {
  library = await api.list(els.search.value.trim());
  render();
}

function inProgress(it) {
  const st = it.state;
  return st && st.position_seconds > 5 && !st.completed &&
    (!it.duration_seconds || st.position_seconds < it.duration_seconds - 5);
}

// Order chapters within a book: track number first (nulls last), then filename.
function trackSort(a, b) {
  const ta = a.track_number, tb = b.track_number;
  if (ta != null && tb != null && ta !== tb) return ta - tb;
  if (ta != null && tb == null) return -1;
  if (ta == null && tb != null) return 1;
  return naturalCompare(a.original_filename || a.title || "", b.original_filename || b.title || "");
}

// Collapse book chapters into one card; standalone files pass through unchanged.
// Order follows `items` (newest first), a book taking its newest track's slot.
function toCards(items) {
  const books = new Map();
  const cards = [];
  for (const it of items) {
    if (it.book_id) {
      let c = books.get(it.book_id);
      if (!c) {
        c = { isBook: true, id: it.book_id, title: it.book_title || "Audiobook",
              media_type: "audiobook", artist: it.artist, album: it.album, tracks: [] };
        books.set(it.book_id, c);
        cards.push(c);
      }
      c.tracks.push(it);
    } else {
      cards.push({ isBook: false, id: it.id, item: it, media_type: it.media_type });
    }
  }
  for (const c of books.values()) {
    c.tracks.sort(trackSort);
    c.agg = computeBook(c.tracks);
    c.artwork_id = (c.tracks.find((t) => t.artwork_path) || {}).id || null;
    c.artist = c.artist || (c.tracks.find((t) => t.artist) || {}).artist || null;
  }
  return cards;
}

// Aggregate progress across a book's chapters.
function computeBook(tracks) {
  let done = 0, totalDur = 0, playedDur = 0, anyStarted = false, lastUpdated = "";
  for (const t of tracks) {
    const st = t.state, dur = t.duration_seconds || 0;
    totalDur += dur;
    if (st && st.completed) { done++; playedDur += dur; }
    else if (st) playedDur += Math.min(st.position_seconds || 0, dur || Infinity);
    if (st && (st.position_seconds > 5 || st.completed)) anyStarted = true;
    if (st && st.updated_at && st.updated_at > lastUpdated) lastUpdated = st.updated_at;
  }
  const pct = totalDur ? (playedDur / totalDur) * 100 : (done / tracks.length) * 100;
  return { done, total: tracks.length, pct: Math.min(100, pct),
           anyStarted, allDone: done === tracks.length, lastUpdated,
           resumeIdx: pickResume(tracks) };
}

// Which chapter to open: most recently played unfinished one, else the first
// unfinished, else the start.
function pickResume(tracks) {
  let best = -1, bestAt = "";
  tracks.forEach((t, i) => {
    const st = t.state;
    if (st && !st.completed && (st.updated_at || "") > bestAt) { bestAt = st.updated_at || ""; best = i; }
  });
  if (best >= 0 && bestAt) return best;
  const firstUnfinished = tracks.findIndex((t) => !(t.state && t.state.completed));
  return firstUnfinished >= 0 ? firstUnfinished : 0;
}

function cardInProgress(c) {
  return c.isBook ? (c.agg.anyStarted && !c.agg.allDone) : inProgress(c.item);
}
function cardUpdatedAt(c) {
  return c.isBook ? c.agg.lastUpdated : (c.item.state && c.item.state.updated_at) || "";
}
function cardPlaying(c) {
  return c.isBook ? (currentBook && currentBook.id === c.id)
                  : (current && !currentBook && current.id === c.id);
}

function render() {
  els.library.innerHTML = "";
  const items = library.filter((it) => filter === "all" || it.media_type === filter);
  const cards = toCards(items);

  if (!cards.length) {
    els.library.innerHTML = `<div style="color:var(--muted);padding:20px;text-align:center">Nothing here yet — upload something.</div>`;
    return;
  }

  // "Continue listening": in-progress cards, most recently played first.
  const continuing = cards.filter(cardInProgress)
    .sort((a, b) => cardUpdatedAt(b).localeCompare(cardUpdatedAt(a)));
  const continuingIds = new Set(continuing.map((c) => c.id));
  const rest = cards.filter((c) => !continuingIds.has(c.id));

  if (continuing.length) {
    els.library.appendChild(section("Continue listening", continuing));
  }
  els.library.appendChild(section(continuing.length ? "Library" : null, rest));
}

function section(label, cards) {
  const frag = document.createDocumentFragment();
  if (label) {
    const h = document.createElement("div");
    h.className = "section-head";
    h.textContent = label;
    frag.appendChild(h);
  }
  const ul = document.createElement("ul");
  ul.className = "item-list";
  for (const c of cards) ul.appendChild(c.isBook ? renderBookCard(c) : renderItem(c.item));
  frag.appendChild(ul);
  return frag;
}

function renderItem(it) {
  const li = document.createElement("li");
  li.className = "item" + (current && !currentBook && current.id === it.id ? " playing" : "");

  const art = document.createElement("img");
  art.className = "item-art";
  if (it.artwork_path) art.src = `/api/media/${it.id}/artwork`;
  li.appendChild(art);

  const body = document.createElement("div");
  body.className = "item-body";
  const sub = [it.artist, it.album].filter(Boolean).join(" — ") || "Unknown";
  body.innerHTML = `
    <div class="item-title">${escapeHtml(it.title)}<span class="badge">${it.media_type}</span></div>
    <div class="item-sub">${escapeHtml(sub)}</div>`;

  const st = it.state;
  if (st && st.position_seconds > 5 && it.duration_seconds) {
    const pct = Math.min(100, (st.position_seconds / it.duration_seconds) * 100);
    body.innerHTML += `
      <div class="progress"><div style="width:${pct}%"></div></div>
      <div class="resume">Resume ${fmt(st.position_seconds)} · ${Math.round(pct)}%</div>`;
  }
  li.appendChild(body);

  const del = document.createElement("button");
  del.className = "item-delete";
  del.textContent = "🗑";
  del.title = "Delete";
  del.onclick = (e) => { e.stopPropagation(); onDelete(it); };
  li.appendChild(del);

  li.onclick = () => play(it);
  return li;
}

function renderBookCard(c) {
  const li = document.createElement("li");
  li.className = "item" + (cardPlaying(c) ? " playing" : "");

  const art = document.createElement("img");
  art.className = "item-art";
  if (c.artwork_id) art.src = `/api/media/${c.artwork_id}/artwork`;
  li.appendChild(art);

  const body = document.createElement("div");
  body.className = "item-body";
  const sub = c.artist ? escapeHtml(c.artist) : `${c.agg.total} chapters`;
  body.innerHTML = `
    <div class="item-title">${escapeHtml(c.title)}<span class="badge">audiobook</span></div>
    <div class="item-sub">${sub} · ${c.agg.total} chapters</div>`;

  if (c.agg.anyStarted) {
    const chapNo = Math.min(c.agg.done + 1, c.agg.total);
    const label = c.agg.allDone ? "Finished" : `Chapter ${chapNo} / ${c.agg.total}`;
    body.innerHTML += `
      <div class="progress"><div style="width:${c.agg.pct}%"></div></div>
      <div class="resume">${label} · ${Math.round(c.agg.pct)}%</div>`;
  }
  li.appendChild(body);

  const del = document.createElement("button");
  del.className = "item-delete";
  del.textContent = "🗑";
  del.title = "Delete";
  del.onclick = (e) => { e.stopPropagation(); onDeleteBook(c); };
  li.appendChild(del);

  li.onclick = () => openBook(c);
  return li;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ----- playback --------------------------------------------------------------
async function play(it) {
  // Switching tracks: flush the outgoing track's position first.
  if (current && current.id !== it.id) saveNow();

  currentBook = null; // leaving book mode (if we were in it)
  current = it;
  render();

  const [state, playInfo] = await Promise.all([
    api.getState(it.id),
    fetch(`/api/media/${it.id}/play`).then((r) => r.json()),
  ]);
  audio.src = playInfo.url;
  els.title.textContent = it.title;
  els.artist.textContent = [it.artist, it.album].filter(Boolean).join(" — ");
  els.art.src = it.artwork_path ? `/api/media/${it.id}/artwork` : "";
  els.player.hidden = false;

  const speed = state.playback_speed || 1;
  audio.playbackRate = speed;
  els.speed.value = String(speed);

  // Resume position once the browser knows the media is seekable.
  const resumeAt = state.position_seconds || 0;
  audio.addEventListener("loadedmetadata", function once() {
    audio.removeEventListener("loadedmetadata", once);
    if (resumeAt > 5 && resumeAt < (audio.duration || Infinity) - 1) {
      audio.currentTime = resumeAt;
      toast(`Resumed from ${fmt(resumeAt)}`);
    }
    audio.play().catch(() => {});
  });
  audio.load();
  setMediaSession(it);
  setupChapters(it);
}

// ----- audiobook (book) playback --------------------------------------------
// A book is a group of per-chapter files. Each chapter keeps its own saved
// position; opening a book resumes the last-played chapter, and finishing one
// auto-advances to the next.
async function openBook(card) {
  if (current) saveNow(); // flush the outgoing track
  currentBook = { id: card.id, title: card.title, tracks: card.tracks,
                  artist: card.artist, artwork_id: card.artwork_id, index: -1 };
  await loadTrack(card.agg.resumeIdx, { resume: true, autoplay: true });
}

function trackTitle(it, idx) {
  return it.title || `Chapter ${idx + 1}`;
}

async function loadTrack(idx, { resume = true, autoplay = true } = {}) {
  const book = currentBook;
  if (!book || idx < 0 || idx >= book.tracks.length) return;
  if (current && current.id !== book.tracks[idx].id) saveNow();

  const it = book.tracks[idx];
  book.index = idx;
  current = it;
  render();

  const [state, playInfo] = await Promise.all([
    api.getState(it.id),
    fetch(`/api/media/${it.id}/play`).then((r) => r.json()),
  ]);
  const chTitle = trackTitle(it, idx);
  audio.src = playInfo.url;
  els.title.textContent = book.title;
  els.artist.textContent = `${chTitle} · ${idx + 1}/${book.tracks.length}`;
  els.art.src = book.artwork_id ? `/api/media/${book.artwork_id}/artwork` : "";
  els.player.hidden = false;

  const speed = state.playback_speed || 1;
  audio.playbackRate = speed;
  els.speed.value = String(speed);

  const resumeAt = resume ? (state.position_seconds || 0) : 0;
  audio.addEventListener("loadedmetadata", function once() {
    audio.removeEventListener("loadedmetadata", once);
    if (resumeAt > 5 && resumeAt < (audio.duration || Infinity) - 1) {
      audio.currentTime = resumeAt;
      toast(`Resumed ${chTitle} at ${fmt(resumeAt)}`);
    }
    if (autoplay) audio.play().catch(() => {});
  });
  audio.load();
  setBookMediaSession(book, idx);
  setupBookChapters(book, idx);
}

// Chapter list for a book = its ordered tracks. Active row is the loaded track.
function setupBookChapters(book, idx) {
  activeChapterIdx = idx;
  els.chaptersPanel.hidden = true;
  els.chaptersBtn.hidden = false;
  els.chaptersList.innerHTML = "";
  book.tracks.forEach((t, i) => {
    const li = document.createElement("li");
    li.className = "chapter" + (i === idx ? " active" : "");
    li.dataset.idx = i;
    li.innerHTML = `<span class="chapter-title">${escapeHtml(trackTitle(t, i))}</span>` +
      `<span class="chapter-time">${fmt(t.duration_seconds)}</span>`;
    li.onclick = () => loadTrack(i, { resume: true, autoplay: true });
    els.chaptersList.appendChild(li);
  });
}

function setBookMediaSession(book, idx) {
  if (!("mediaSession" in navigator)) return;
  const it = book.tracks[idx];
  const meta = { title: trackTitle(it, idx), artist: book.artist || "Unknown", album: book.title };
  if (book.artwork_id) meta.artwork = [{ src: `/api/media/${book.artwork_id}/artwork`, sizes: "512x512" }];
  navigator.mediaSession.metadata = new MediaMetadata(meta);
  const set = (action, handler) => {
    try { navigator.mediaSession.setActionHandler(action, handler); } catch {}
  };
  set("play", () => audio.play());
  set("pause", () => audio.pause());
  set("seekbackward", (d) => { audio.currentTime = Math.max(0, audio.currentTime - (d.seekOffset || 15)); });
  set("seekforward", (d) => { audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + (d.seekOffset || 30)); });
  set("seekto", (d) => { if (d.seekTime != null) audio.currentTime = d.seekTime; });
  set("previoustrack", idx > 0 ? () => loadTrack(idx - 1) : null);
  set("nexttrack", idx < book.tracks.length - 1 ? () => loadTrack(idx + 1) : null);
}

// ----- chapters --------------------------------------------------------------
function setupChapters(it) {
  const chapters = it.chapters || [];
  activeChapterIdx = -1;
  els.chaptersPanel.hidden = true;
  els.chaptersBtn.hidden = chapters.length === 0;
  els.chaptersList.innerHTML = "";
  if (!chapters.length) return;

  chapters.forEach((ch, i) => {
    const li = document.createElement("li");
    li.className = "chapter";
    li.dataset.idx = i;
    li.innerHTML = `<span class="chapter-title">${escapeHtml(ch.title)}</span>` +
      `<span class="chapter-time">${fmt(ch.start_seconds)}</span>`;
    li.onclick = () => { audio.currentTime = ch.start_seconds; saveNow(); };
    els.chaptersList.appendChild(li);
  });
}

function chapterIndexAt(t) {
  const chapters = (current && current.chapters) || [];
  let idx = -1;
  for (let i = 0; i < chapters.length; i++) {
    if (chapters[i].start_seconds <= t + 0.001) idx = i; else break;
  }
  return idx;
}

function updateActiveChapter() {
  if (currentBook) return; // book mode: active chapter is the loaded track, set on load
  const idx = chapterIndexAt(audio.currentTime);
  if (idx === activeChapterIdx) return;
  const rows = els.chaptersList.children;
  if (activeChapterIdx >= 0 && rows[activeChapterIdx]) rows[activeChapterIdx].classList.remove("active");
  if (idx >= 0 && rows[idx]) rows[idx].classList.add("active");
  activeChapterIdx = idx;
}

els.chaptersBtn.onclick = () => { els.chaptersPanel.hidden = !els.chaptersPanel.hidden; };

// ----- autoplay (standalone music) -------------------------------------------
// The queue is the standalone music currently in view, in library order — so it
// honours the active tab and search. Books and single-file audiobooks are
// excluded (books auto-advance chapter-to-chapter on their own).
function musicQueue() {
  return library
    .filter((it) => filter === "all" || it.media_type === filter)
    .filter((it) => !it.book_id && it.media_type === "music");
}

function nextMusic(finished) {
  const q = musicQueue();
  const i = q.findIndex((x) => x.id === finished.id);
  if (i === -1) return null;
  if (shuffle) {
    if (q.length < 2) return null;
    let j = i;
    while (j === i) j = Math.floor(Math.random() * q.length);
    return q[j];
  }
  return i + 1 < q.length ? q[i + 1] : null; // stop at the end of the list
}

function applyShuffleUI() {
  els.shuffleBtn.classList.toggle("active", shuffle);
  els.shuffleBtn.title = shuffle ? "Shuffle: on" : "Shuffle: off";
}
els.shuffleBtn.onclick = () => {
  shuffle = !shuffle;
  localStorage.setItem("spotime_shuffle", shuffle ? "1" : "0");
  applyShuffleUI();
};
applyShuffleUI();

// Lock-screen / headphone controls (phone, macOS Now Playing).
function setMediaSession(it) {
  if (!("mediaSession" in navigator)) return;
  const meta = { title: it.title, artist: it.artist || "Unknown" };
  if (it.album) meta.album = it.album;
  if (it.artwork_path) meta.artwork = [{ src: `/api/media/${it.id}/artwork`, sizes: "512x512" }];
  navigator.mediaSession.metadata = new MediaMetadata(meta);

  const set = (action, handler) => {
    try { navigator.mediaSession.setActionHandler(action, handler); } catch {}
  };
  set("play", () => audio.play());
  set("pause", () => audio.pause());
  set("seekbackward", (d) => { audio.currentTime = Math.max(0, audio.currentTime - (d.seekOffset || 15)); });
  set("seekforward", (d) => { audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + (d.seekOffset || 30)); });
  set("seekto", (d) => { if (d.seekTime != null) audio.currentTime = d.seekTime; });
}

function currentBody(extra = {}) {
  return {
    position_seconds: audio.currentTime || 0,
    playback_speed: parseFloat(els.speed.value),
    ...extra,
  };
}

function saveNow(extra = {}) {
  if (!current) return;
  // Music resets on completion; audiobooks stay put (spec §8).
  api.saveState(current.id, currentBody(extra));
}

// Periodic save every ~15s while playing (spec §7).
function startSaveTimer() {
  stopSaveTimer();
  saveTimer = setInterval(() => { if (!audio.paused) saveNow(); }, 15000);
}
function stopSaveTimer() {
  if (saveTimer) clearInterval(saveTimer);
  saveTimer = null;
}

// ----- audio events ----------------------------------------------------------
function setMSState(state) {
  if ("mediaSession" in navigator) navigator.mediaSession.playbackState = state;
}
function updateMSPosition() {
  if (!("mediaSession" in navigator) || !navigator.mediaSession.setPositionState) return;
  if (!isFinite(audio.duration)) return;
  try {
    navigator.mediaSession.setPositionState({
      duration: audio.duration,
      playbackRate: audio.playbackRate,
      position: Math.min(audio.currentTime, audio.duration),
    });
  } catch {}
}

audio.addEventListener("play", () => { els.playPause.textContent = "❚❚"; setMSState("playing"); startSaveTimer(); });
audio.addEventListener("pause", () => { els.playPause.textContent = "▶"; setMSState("paused"); saveNow(); stopSaveTimer(); });
audio.addEventListener("timeupdate", () => {
  els.curTime.textContent = fmt(audio.currentTime);
  els.durTime.textContent = fmt(audio.duration);
  if (audio.duration) els.seekbar.value = (audio.currentTime / audio.duration) * 1000;
  updateActiveChapter();
});
audio.addEventListener("seeked", updateMSPosition);
audio.addEventListener("durationchange", updateMSPosition);
audio.addEventListener("ended", () => {
  stopSaveTimer();
  if (currentBook) {
    // Chapter finished: mark it done and auto-advance to the next one.
    saveNow({ completed: true });
    const next = currentBook.index + 1;
    if (next < currentBook.tracks.length) {
      loadTrack(next, { resume: false, autoplay: true });
    } else {
      toast("Finished — that was the last chapter.");
      refresh();
    }
    return;
  }
  if (current.media_type === "music") {
    // Music restarts next time (spec §8): reset to 0 and mark complete.
    api.saveState(current.id, { position_seconds: 0, playback_speed: parseFloat(els.speed.value), completed: true });
    const next = nextMusic(current);
    if (next) {
      // Clear `current` so play() doesn't flush the finished track's position
      // over the reset-to-0 we just saved, then roll into the next song.
      current = null;
      play(next);
      return;
    }
  } else {
    saveNow({ completed: true });
  }
  refresh();
});

// ----- controls --------------------------------------------------------------
els.playPause.onclick = () => (audio.paused ? audio.play() : audio.pause());
document.getElementById("seek-back").onclick = () => { audio.currentTime = Math.max(0, audio.currentTime - 15); saveNow(); };
document.getElementById("seek-fwd").onclick = () => { audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 30); saveNow(); };
els.seekbar.oninput = () => { if (audio.duration) audio.currentTime = (els.seekbar.value / 1000) * audio.duration; };
els.seekbar.onchange = () => saveNow();
els.speed.onchange = () => { audio.playbackRate = parseFloat(els.speed.value); saveNow(); };

// Save when the tab is hidden or unloaded (spec §7).
document.addEventListener("visibilitychange", () => { if (document.hidden) saveNow(); });
window.addEventListener("pagehide", () => saveNow());

// ----- library actions -------------------------------------------------------
// ----- client-side metadata extraction (keeps big files off the backend) -----
function readTags(file) {
  return new Promise((resolve) => {
    if (!window.jsmediatags) return resolve({});
    window.jsmediatags.read(file, {
      onSuccess: (t) => resolve(t.tags || {}),
      onError: () => resolve({}),
    });
  });
}

// Never let a metadata probe stall the batch: resolve to `fallback` after `ms`.
function withTimeout(promise, ms, fallback) {
  return Promise.race([
    promise,
    new Promise((res) => setTimeout(() => res(fallback), ms)),
  ]);
}

function readDuration(file) {
  return new Promise((resolve) => {
    const a = document.createElement("audio");
    a.preload = "metadata";
    const url = URL.createObjectURL(file);
    let done = false;
    const finish = (v) => { if (done) return; done = true; URL.revokeObjectURL(url); resolve(v); };
    a.onloadedmetadata = () => finish(isFinite(a.duration) ? a.duration : null);
    a.onerror = () => finish(null);
    a.src = url;
  });
}

function pictureToBase64(pic) {
  if (!pic || !pic.data) return null;
  let bin = "";
  for (let i = 0; i < pic.data.length; i++) bin += String.fromCharCode(pic.data[i]);
  try { return btoa(bin); } catch { return null; }
}

function guessType(name) {
  return name.toLowerCase().endsWith(".m4b") ? "audiobook" : "music";
}

// The folder path a file came from: the folder picker sets webkitRelativePath
// ("Book/ch1.mp3"); drag-drop sets _relPath (see filesFromDataTransfer). Loose
// files chosen with the Files button have neither.
function relPath(f) { return f.webkitRelativePath || f._relPath || ""; }
function folderOf(f) {
  const p = relPath(f);
  const i = p.lastIndexOf("/");
  return i > 0 ? p.slice(0, i) : "";
}

// Natural sort so "chapter2" precedes "chapter10".
function naturalCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

// Leading integer of a track tag ("3", "3/20") — else null.
function parseTrack(t) {
  const m = String(t ?? "").match(/^\s*(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

// Direct upload with progress. Bytes go straight to GCS (or local endpoint),
// never buffered through the backend.
function putWithProgress(url, method, headers, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    for (const [k, v] of Object.entries(headers || {})) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300
      ? resolve() : reject(new Error("upload HTTP " + xhr.status)));
    xhr.onerror = () => reject(new Error("upload network error"));
    xhr.send(file);
  });
}

const AUDIO_RE = /\.(mp3|m4a|m4b|aac|ogg|opus|flac|wav)$/i;

// A "unit" is one file plus the book it belongs to (book === null for a loose
// file). uploadOne stays a single-file operation; grouping happens in planBooks.
async function uploadOne(unit, prefix) {
  const { file: f, book, trackNumber } = unit;
  els.uploadStatus.textContent = `${prefix}Reading ${f.name}…`;
  const [tags, duration] = await Promise.all([
    withTimeout(readTags(f), 8000, {}),
    withTimeout(readDuration(f), 8000, null),
  ]);
  const ct = f.type || "application/octet-stream";
  const { id, url, method, headers } = await api.uploadUrl(f.name, ct);
  await putWithProgress(url, method, headers, f, (p) => {
    els.uploadStatus.textContent = `${prefix}Uploading ${f.name}… ${Math.round(p * 100)}%`;
  });
  els.uploadStatus.textContent = `${prefix}Finishing ${f.name}…`;
  await api.register({
    id, filename: f.name,
    title: tags.title || null, artist: tags.artist || null, album: tags.album || null,
    duration_seconds: duration,
    // A folder of files is an audiobook; a lone .m4b too. Loose files keep the
    // per-extension guess.
    media_type: book ? "audiobook" : guessType(f.name),
    cover_base64: pictureToBase64(tags.picture),
    book_id: book ? book.id : null,
    book_title: book ? book.title : null,
    track_number: trackNumber,
  });
}

// Group files by their source folder. Any folder holding 2+ audio files becomes
// a book (chapters ordered by track tag, then natural filename). Reuses an
// existing book's id when the title matches, so re-adding a folder resumes the
// same book instead of duplicating it. Returns a flat, ordered list of units.
function planBooks(files, existingBooksByTitle) {
  const byFolder = new Map();
  for (const f of files) {
    const key = folderOf(f);
    if (!byFolder.has(key)) byFolder.set(key, []);
    byFolder.get(key).push(f);
  }
  const units = [];
  for (const [folder, group] of byFolder) {
    if (!folder || group.length < 2) {
      for (const f of group) units.push({ file: f, book: null, trackNumber: null });
      continue;
    }
    const title = folder.split("/").pop();
    const book = { id: existingBooksByTitle.get(title) || crypto.randomUUID(), title };
    group.sort((a, b) => {
      const ta = a._track, tb = b._track;
      if (ta != null && tb != null && ta !== tb) return ta - tb;
      return naturalCompare(a.name, b.name);
    });
    group.forEach((f, i) => units.push({ file: f, book, trackNumber: i + 1 }));
  }
  return units;
}

// Resilient batch: skips non-audio, keeps going if one file fails.
async function uploadFiles(files) {
  files = [...files].filter((f) => AUDIO_RE.test(f.name));
  if (!files.length) { els.uploadStatus.textContent = "No audio files found."; return; }

  // Track tags decide chapter order within a folder; read them up front.
  els.uploadStatus.textContent = `Reading ${files.length} file(s)…`;
  await Promise.all(files.map(async (f) => {
    const tags = await withTimeout(readTags(f), 8000, {});
    f._track = parseTrack(tags.track);
  }));

  const existingItems = await api.list();
  const existingBooksByTitle = new Map();
  for (const it of existingItems) {
    if (it.book_id && it.book_title) existingBooksByTitle.set(it.book_title, it.book_id);
  }
  const units = planBooks(files, existingBooksByTitle);

  // Skip anything already registered, matched by (book_id, filename) — the same
  // scoping the backend dedups on, so two books can share a "Chapter 1.mp3".
  const existing = new Set(existingItems
    .filter((i) => i.original_filename)
    .map((i) => `${i.book_id || ""}\n${i.original_filename}`));
  const queue = units.filter((u) =>
    !existing.has(`${u.book ? u.book.id : ""}\n${u.file.name}`));
  const skipped = units.length - queue.length;
  if (!queue.length) {
    els.uploadStatus.textContent = `All ${units.length} already in library.`;
    return;
  }

  let ok = 0;
  const failed = [];
  for (let i = 0; i < queue.length; i++) {
    const prefix = queue.length > 1 ? `(${i + 1}/${queue.length}) ` : "";
    try {
      await uploadOne(queue[i], prefix);
      ok++;
    } catch (err) {
      failed.push(queue[i].file.name);
    }
  }
  els.uploadStatus.textContent =
    `Uploaded ${ok}/${queue.length}` +
    (skipped ? ` · ${skipped} already in library` : "") +
    (failed.length ? ` · ${failed.length} failed` : "");
  refresh();
}

els.fileInput.onchange = (e) => { const f = [...e.target.files]; e.target.value = ""; uploadFiles(f); };
document.getElementById("folder-input").onchange =
  (e) => { const f = [...e.target.files]; e.target.value = ""; uploadFiles(f); };

// ----- drag and drop (files or whole folders) --------------------------------
// Recurse dropped directory entries into a flat file list.
async function filesFromDataTransfer(dt) {
  const entries = [...(dt.items || [])]
    .map((it) => (it.webkitGetAsEntry ? it.webkitGetAsEntry() : null))
    .filter(Boolean);
  if (!entries.length) return [...(dt.files || [])];  // fallback

  const out = [];
  async function walk(entry) {
    if (entry.isFile) {
      await new Promise((res) => entry.file((f) => {
        // Carry the folder path so drag-dropped folders group like the picker's
        // webkitRelativePath does (entry.fullPath looks like "/Book/ch1.mp3").
        try { f._relPath = (entry.fullPath || "").replace(/^\//, ""); } catch {}
        out.push(f);
        res();
      }, res));
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      let batch;
      do {
        batch = await new Promise((res, rej) => reader.readEntries(res, rej));
        for (const e of batch) await walk(e);
      } while (batch.length);
    }
  }
  for (const e of entries) await walk(e);
  return out;
}

// Overlay logic keyed off dragover, which fires continuously while dragging.
// A short hide-timer self-heals if a drag leaves the window or ends without a
// clean dragleave (the old enter/leave counter could desync and stick open).
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
let dragHideTimer = null;
window.addEventListener("dragover", (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  els.dropHint.hidden = false;
  clearTimeout(dragHideTimer);
  dragHideTimer = setTimeout(() => { els.dropHint.hidden = true; }, 150);
});
window.addEventListener("drop", async (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  clearTimeout(dragHideTimer);
  els.dropHint.hidden = true;
  els.uploadStatus.textContent = "Scanning dropped items…";
  uploadFiles(await filesFromDataTransfer(e.dataTransfer));
});
// Bulletproof self-heal: mousemove never fires during an HTML5 drag, so any
// normal cursor movement means no drag is active — clear a stuck overlay.
window.addEventListener("mousemove", () => {
  if (!els.dropHint.hidden) els.dropHint.hidden = true;
});

async function onDelete(it) {
  if (!confirm(`Delete "${it.title}"?`)) return;
  if (current && current.id === it.id) { audio.pause(); audio.src = ""; current = null; els.player.hidden = true; }
  await api.remove(it.id);
  refresh();
}

async function onDeleteBook(c) {
  if (!confirm(`Delete "${c.title}" and its ${c.tracks.length} chapters?`)) return;
  if (currentBook && currentBook.id === c.id) {
    audio.pause(); audio.src = ""; current = null; currentBook = null; els.player.hidden = true;
  }
  for (const t of c.tracks) await api.remove(t.id);
  refresh();
}

els.search.oninput = debounce(refresh, 250);
for (const tab of document.querySelectorAll(".tab")) {
  tab.onclick = () => {
    document.querySelector(".tab.active").classList.remove("active");
    tab.classList.add("active");
    filter = tab.dataset.filter;
    render();
  };
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// ----- boot ------------------------------------------------------------------
refresh();
