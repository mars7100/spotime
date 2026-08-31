// Service worker: right-click entry points, and the badge that tracks jobs.
//
// MV3 tears this worker down whenever it goes idle, so nothing in-memory
// survives. Active job ids live in chrome.storage.session and an alarm wakes us
// up to re-poll them.

import { startDownload, getJob, classify, trackOnly, SpotimeError } from "./spotime.js";

const WATCHED = "watchedJobs";
const ALARM = "poll-jobs";

// ----- context menus ---------------------------------------------------------

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "add-track",
    title: "Add to Spotime",
    contexts: ["link", "page"],
    documentUrlPatterns: ["http://*/*", "https://*/*"],
  });
  chrome.contextMenus.create({
    id: "add-playlist",
    title: "Add whole playlist to Spotime",
    contexts: ["link", "page"],
    documentUrlPatterns: ["*://*.youtube.com/*"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  // A right-click on a link targets the link; anywhere else targets the page.
  const target = info.linkUrl || info.pageUrl || tab?.url;
  if (!target) return;

  const wholePlaylist = info.menuItemId === "add-playlist";
  const url = wholePlaylist ? target : trackOnly(target);
  if (classify(url).kind === "unsupported") {
    return notify("Can't add that", "Spotime needs an http(s) link.");
  }
  try {
    const job = await startDownload(url, wholePlaylist);
    await watch(job.id);
    notify("Sent to Spotime", wholePlaylist ? "Downloading the playlist…" : "Downloading…");
  } catch (err) {
    notify(err.message, err instanceof SpotimeError ? err.hint : String(err));
  }
});

function notify(title, message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon128.png",
    title,
    message: message || "",
  });
}

// ----- badge -----------------------------------------------------------------

async function watch(jobId) {
  const { [WATCHED]: jobs = [] } = await chrome.storage.session.get(WATCHED);
  if (!jobs.includes(jobId)) {
    await chrome.storage.session.set({ [WATCHED]: [...jobs, jobId] });
  }
  // Alarms fire at most every 30s; poll once now so the badge isn't blank until then.
  chrome.alarms.create(ALARM, { periodInMinutes: 0.5 });
  poll();
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) poll();
});

// Kept exported-by-message so the popup can nudge a refresh after it starts a job.
chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
  if (msg?.type === "watch") {
    watch(msg.jobId).then(() => respond({ ok: true }));
    return true;   // respond asynchronously
  }
  return false;
});

async function poll() {
  const { [WATCHED]: jobs = [] } = await chrome.storage.session.get(WATCHED);
  if (!jobs.length) return finish();

  const results = await Promise.all(
    jobs.map((id) => getJob(id).catch(() => null))
  );

  const active = [];
  let running = 0;
  let failed = false;
  results.forEach((job, i) => {
    if (!job) return;                       // 404 after a restart, or server down
    if (job.status === "queued" || job.status === "running") {
      active.push(jobs[i]);
      running += 1;
      return;
    }
    // Terminal: announce once, then stop watching it.
    if (job.status === "error") {
      failed = true;
      notify("Download failed", job.message || "");
    } else {
      const added = job.added?.length || 0;
      const problems = [
        job.skipped?.length ? `${job.skipped.length} already in library` : null,
        job.failed?.length ? `${job.failed.length} failed` : null,
      ].filter(Boolean);
      if (job.failed?.length) failed = true;
      notify(
        added === 1 ? "Added 1 track" : `Added ${added} tracks`,
        problems.join(", ")
      );
    }
  });

  await chrome.storage.session.set({ [WATCHED]: active });
  if (!active.length) return finish(failed);
  chrome.action.setBadgeBackgroundColor({ color: "#1db954" });
  chrome.action.setBadgeText({ text: String(running) });
}

function finish(failed = false) {
  chrome.alarms.clear(ALARM);
  if (failed) {
    chrome.action.setBadgeBackgroundColor({ color: "#c0392b" });
    chrome.action.setBadgeText({ text: "!" });
  } else {
    chrome.action.setBadgeText({ text: "" });
  }
}
