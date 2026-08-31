/* The media element, outside React.
   A media element is a large stateful object: unmount it and playback stops and
   the saved position corrupts. So there is exactly one, created here at import
   and appended to the document outside React's root — React never owns it,
   never renders it, and can never unmount it. Components send it commands and
   read the state the provider mirrors out of its events.

   It also records *which source is currently loaded*. Without that, a finished
   track's `ended` event arriving after the next track has been swapped in reads
   as the new track finishing, and the queue skips a song. */

const element = document.createElement("audio");
element.preload = "metadata";
document.body.appendChild(element);

/** The media id whose URL is in `src` right now, or null before the first play. */
let loadedId: string | null = null;

/** The outgoing source's `ended` listener hangs off this. Aborting it as the
    next source loads is what makes a late event from a replaced track reach
    nobody at all — a check inside the handler would still be racing. */
let sourceListeners: AbortController | null = null;

export const audio = element;

export const loadedSourceId = (): string | null => loadedId;

export interface SourceHandlers {
  /** This source ran out. Bind the *record* it belongs to at the call site:
      "what is playing now" is a different track for as long as a change is in
      flight, which is exactly when a late event lands. */
  onEnded?: () => void;
  /** The browser now knows the duration, so a resume seek can be performed.
      A media element cannot be seeked before then. */
  onLoaded?: () => void;
}

/**
 * Point the element at a new source.
 *
 * Both handlers hang off this source's controller, so loading the next one
 * silences them: a replaced track can neither advance the queue nor seek the
 * track that displaced it.
 */
export function loadSource(id: string, url: string, handlers: SourceHandlers = {}): void {
  sourceListeners?.abort();
  sourceListeners = new AbortController();
  const { signal } = sourceListeners;
  loadedId = id;
  element.src = url;
  if (handlers.onEnded) element.addEventListener("ended", handlers.onEnded, { signal });
  if (handlers.onLoaded)
    element.addEventListener("loadedmetadata", handlers.onLoaded, { signal, once: true });
}

/** Tests only: the element outlives a render tree, so it outlives a test too. */
export function resetPlayback(): void {
  sourceListeners?.abort();
  sourceListeners = null;
  loadedId = null;
  element.pause();
  element.removeAttribute("src");
  element.currentTime = 0;
  element.playbackRate = 1;
  element.volume = 1;
}
