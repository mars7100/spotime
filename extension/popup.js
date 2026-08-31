import {
  api, startDownload, getJob, knownTags, classify, trackOnly, SpotimeError,
} from "./spotime.js";

const $ = (id) => document.getElementById(id);
const show = (id, visible = true) => { $(id).hidden = !visible; };

let target = null;   // { kind, url, isMix } for the active tab

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

/** Render a hint, turning `backticked` spans into <code> without trusting the text. */
function hintInto(el, text) {
  el.replaceChildren(
    ...String(text).split(/`([^`]+)`/).map((part, i) =>
      i % 2
        ? Object.assign(document.createElement("code"), { textContent: part })
        : document.createTextNode(part)
    )
  );
}

function failWith(err) {
  $("offline").querySelector(".err-title").textContent = err.message;
  hintInto($("offline").querySelector(".err-hint"),
    err instanceof SpotimeError ? err.hint : String(err));
  show("offline");
  show("form", false);
}

async function init() {
  show("offline", false);
  show("form", false);
  show("unsupported", false);

  const tab = await activeTab();
  target = classify(tab?.url || "");

  // Reachability and the tag list come from the same round trip's worth of
  // waiting — if the server is down, both fail and we show the hint instead.
  let tags = [];
  try {
    await api("/api/downloads", {}, 2500);
    tags = await knownTags();
  } catch (err) {
    return failWith(err);
  }

  if (target.kind === "unsupported") return show("unsupported");

  $("page-title").textContent = tab.title || "This page";
  $("page-url").textContent = target.url;
  $("known-tags").replaceChildren(
    ...tags.map((t) => Object.assign(document.createElement("option"), { value: t }))
  );

  // Only a watch page inside a real playlist is genuinely ambiguous; a /playlist
  // page is obviously the whole thing, and a mix is never worth enumerating.
  show("scope", target.kind === "ambiguous");
  show("mix-warning", Boolean(target.isMix));
  if (target.kind === "playlist") {
    $("page-title").textContent = (tab.title || "This playlist") + " (whole playlist)";
  }
  show("form");
}

function chosenScope() {
  if (target.kind === "playlist") return true;
  if (target.kind !== "ambiguous") return false;
  return $("scope").querySelector("input:checked").value === "playlist";
}

async function submit() {
  $("add").disabled = true;
  const playlist = chosenScope();
  const url = playlist ? target.url : trackOnly(target.url);
  const tags = $("tags").value.split(",").map((t) => t.trim()).filter(Boolean);

  let job;
  try {
    job = await startDownload(url, playlist, tags);
  } catch (err) {
    $("add").disabled = false;
    return failWith(err);
  }

  // Hand the job to the service worker so the badge keeps updating after the
  // popup closes — which it will, the moment the user clicks back into the page.
  chrome.runtime.sendMessage({ type: "watch", jobId: job.id });

  show("form", false);
  show("job");
  track(job.id);
}

async function track(jobId) {
  let job;
  try {
    job = await getJob(jobId);
  } catch {
    $("job-message").textContent = "Lost contact with Spotime — check the app.";
    return;
  }
  $("job-message").textContent = job.message || job.status;
  const overall = job.total > 1
    ? (job.index + job.progress) / job.total
    : job.progress;
  $("job-progress").style.width = `${Math.round(overall * 100)}%`;
  $("job-counts").textContent = [
    job.total > 1 ? `${job.index + 1} of ${job.total}` : null,
    job.added.length ? `${job.added.length} added` : null,
    job.skipped.length ? `${job.skipped.length} skipped` : null,
    job.failed.length ? `${job.failed.length} failed` : null,
  ].filter(Boolean).join(" · ");

  if (job.status === "queued" || job.status === "running") {
    setTimeout(() => track(jobId), 700);
  }
}

$("add").addEventListener("click", submit);
$("retry").addEventListener("click", init);
$("tags").addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });

init();
