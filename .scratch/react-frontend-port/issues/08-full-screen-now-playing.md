# 08: Full-screen now-playing view

**What to build:** Expand the player into a full-screen now-playing view with large artwork, and collapse it back to the bar to keep browsing. Operating-system media controls work, so playback can be paused from a keyboard or a lock screen.

The expanded view is the *same* player element re-flowed, not a second player, so playback state stays single-sourced and there is no possibility of the two disagreeing.

**Blocked by:** 04

**Status:** ready-for-human

- [x] The player can be expanded to a full-screen view showing large cover art
- [x] The expanded view can be collapsed back to the bar
- [x] The affordance for expanding is discoverable from the collapsed bar
- [x] Expanding and collapsing reuses the same player element rather than mounting a second one, so playback is never interrupted by the transition
- [x] All transport controls remain available and functional in the expanded view
- [x] Operating-system media controls reflect what is playing and can pause, resume, and skip
- [x] Tests cover: expanding and collapsing without interrupting playback; transport controls working in both states

## Comments

Built. The expansion is a single `player--full` class on the existing
`<footer className="player">` in `frontend/src/features/player/PlayerBar.tsx` —
same React element, same position in the tree, so the DOM node is never
unmounted and there is no second player to disagree with the first. The
full-screen rules sit at the end of `player.css` on purpose: `.player--full` and
`.player` are equally specific, so it is source order that lets the re-flow win.

The cover art and metadata are one button that opens the view and closes it
again; the expanded state also gets a chevron and Escape. `CoverArt` now takes a
CSS length as well as a pixel box, so the hero art scales with the viewport
without a stylesheet rule having to fight an inline style.

OS controls live in a new `frontend/src/player/mediaSession.ts`, called from
`PlayerProvider`. Every handler routes through the player's existing commands
rather than touching the element, so an OS pause and a clicked pause are one
action. Verified in Chrome: metadata and `playbackState` populate for real.

`NowPlaying.test.tsx` covers it at the usual network-boundary seam, including
the same `<audio>` node, the same player region, an unchanged source and no
fresh play request across an expand/collapse round trip. `test/media.ts` gained
a media-session stub — jsdom implements neither `navigator.mediaSession` nor
`MediaMetadata`, so without it the app would take the unsupported branch and
every OS assertion would pass vacuously.

One thing deliberately not covered: `playbackState` returning to `paused` when
the queue runs out. Real browsers fire `pause` after `ended`; the shared media
stub does not, and making it faithful would change the request counts other
suites assert on. Left alone rather than bent to fit a test.

Not verified by eye: the expanded chapters sheet, since the local library has no
audiobook in it. Its geometry was checked against the live stylesheet instead —
fixed, centred, fully on screen at the foot of the view.
