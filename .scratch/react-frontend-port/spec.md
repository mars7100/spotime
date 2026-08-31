# Spec: React frontend port + music view redesign

Status: ready-for-agent

Approved mockup: https://claude.ai/code/artifact/242deb66-4a8e-4650-a143-b825dddf8f5f

## Problem Statement

Spotime works, but it looks like a cheap Spotify clone — because it is one, visually. The palette is Spotify's exact palette (`#1db954` on `#121212`), the layout grammar copies Spotify's (48px square art, left-aligned rows, green pill buttons, fixed bottom bar), and every icon in the player is a text glyph or emoji: a shuffle emoji that renders full-colour on macOS and flat on Android, a "pause button" made of two box-drawing characters, chevrons and ellipses standing in for vector art. Any gap in polish therefore reads as "worse Spotify" rather than "a different app."

Underneath that, the client is ~1400 lines of hand-written DOM synchronisation. State lives in the DOM rather than in a model, so the app has accumulated the bug class that implies — a CSS rule exists purely to work around ID selectors out-specifying the user-agent `[hidden]` rule, because elements whose visibility is toggled by hand never hid. There are now four overlapping UI modes (select mode, bulk tagging bar, tag filter, expanded player) reconciled manually, and adding a fifth is getting expensive.

The library is also missing information a music listener expects: a track's duration appears nowhere in the list.

## Solution

Rebuild the frontend as a React + TypeScript single-page client, served from the same origin, consuming the existing API unchanged. The rebuild carries a new visual identity: a warm-dark palette (amber on warm near-black) that shares none of Spotify's colour, real vector icons throughout, and a music row that earns its density — cover art, title, artist and album, tags, and a monospaced duration column.

Playback state semantics are unchanged and remain the app's defining feature: audiobooks resume where you stopped, music always starts at zero.

Only the **music** view is redesigned. Audiobooks are ported so they keep working exactly as they do today, restyled onto the new tokens but keeping their current row treatment and chapter list; their redesign is a separate piece of work.

## User Stories

### Browsing the library

1. As a listener, I want my whole library to load when I open the app, so that I can start listening without another click.
2. As a listener, I want to search by title, artist, or album, so that I can find a track without scrolling.
3. As a listener, I want to switch between All, Music, and Audiobooks, so that I can narrow the library to the kind of thing I'm in the mood for.
4. As a listener, I want to see each music track's duration in the list, so that I can pick something that fits the time I have.
5. As a listener, I want durations to line up in a column, so that I can compare them at a glance rather than reading each one.
6. As a listener, I want the currently playing track to be obvious in the list, so that I don't have to compare rows to find my place.
7. As a listener, I want to see a track's tags without opening a menu, so that I can tell what a track is filed under while scanning.
8. As a listener, I want tags to be visually quieter than titles, so that they don't compete with the thing I'm actually scanning for.
9. As a listener, I want an empty library to tell me what to do next, so that a first run isn't a blank screen.
10. As a listener, I want the library grouped into meaningful sections, so that recently added material is reachable without scrolling past everything else.

### Tags and filtering

11. As a listener, I want to filter the library by tag, so that I can pull up a mood or context without building a playlist.
12. As a listener, I want to combine several tag filters, so that I can narrow to the intersection.
13. As a listener, I want to see how many tracks carry each tag, so that I can tell which filters are worth applying.
14. As a listener, I want to search my tags when I have a lot of them, so that the filter stays usable at hundreds of tags.
15. As a listener, I want each active filter shown as a chip I can dismiss, so that I always know why the list is short.
16. As a listener, I want tag filters to combine with the search box and the kind tabs, so that the three narrowing tools don't fight each other.
17. As a listener, I want the tag filter to disappear when I have no tags, so that the interface doesn't show me an empty control.

### Editing and bulk actions

18. As a listener, I want to edit a single track's tags, so that I can correct a mistake without entering a bulk mode.
19. As a listener, I want to enter a selection mode, so that I can act on many tracks at once.
20. As a listener, I want selected tracks to look selected and unselected ones to recede, so that I can see the shape of my selection.
21. As a listener, I want to see how many tracks I've selected, so that I know the size of what I'm about to change.
22. As a listener, I want to add a tag to every selected track in one action, so that filing a batch isn't one edit per track.
23. As a listener, I want to remove a tag from every selected track in one action, so that I can undo a bad bulk tagging.
24. As a listener, I want to delete every selected track in one action, so that clearing out a bad import is quick.
25. As a listener, I want the bulk delete control to look more dangerous than the others, so that I don't trigger it by reflex.
26. As a listener, I want to be asked to confirm before a bulk delete, so that a misclick doesn't cost me my library.
27. As a listener, I want to clear my selection without leaving selection mode, so that I can start a new selection cheaply.
28. As a listener, I want to delete a single track from its own row menu, so that removing one thing doesn't require selection mode.

### Getting audio in

29. As a listener, I want to upload one or more audio files, so that I can add to my library from disk.
30. As a listener, I want to upload a whole folder, so that adding an album or a multi-file book is one action.
31. As a listener, I want to drag files onto the window to upload them, so that I don't have to find a button.
32. As a listener, I want a visible drop target when I drag files over the window, so that I know the drop will register.
33. As a listener, I want per-file upload progress, so that I know a large book is moving rather than stuck.
34. As a listener, I want the title, artist, album, and cover art read out of my files automatically, so that I don't retype metadata the file already carries.
35. As a listener, I want a track's duration read from the file on upload, so that the list can show it.
36. As a listener, I want re-uploading a file I already have to be recognised, so that I don't end up with duplicates.
37. As a listener, I want a failed upload to tell me what went wrong, so that I can fix it rather than guess.
38. As a listener, I want to paste a video or playlist URL to add its audio, so that I can pull in things I don't have files for.
39. As a listener, I want to apply tags at download time, so that new arrivals are filed without a second pass.
40. As a listener, I want to choose whether a playlist URL fetches one track or all of them, so that I don't accidentally pull fifty items.
41. As a listener, I want live progress on a running download, so that I can tell it's working.
42. As a listener, I want each finished track from a playlist to appear as it completes, so that a job that dies partway still leaves me what it managed to fetch.
43. As a listener, I want a failed download to tell me why, so that I know whether to retry or give up.

### Playback

44. As a listener, I want to click a track to play it, so that starting playback is one action.
45. As a listener, I want to pause and resume, so that I can stop for a moment without losing my place.
46. As a listener, I want to skip to the next and previous track, so that I can move through what I'm listening to.
47. As a listener, I want to scrub to any point in a track, so that I can jump to a part I want.
48. As a listener, I want to see elapsed and total time, so that I know where I am.
49. As a listener, I want to shuffle my music, so that a long library doesn't always play in the same order.
50. As a listener, I want playback to continue to the next track automatically, so that I don't have to keep clicking.
51. As a listener, I want to change playback speed, so that I can listen faster when I want to.
52. As a listener, I want to control volume from the player, so that I don't have to reach for system volume.
53. As a listener, I want the player to show what's playing with its cover art, so that I can tell at a glance.
54. As a listener, I want to expand the player to a full-screen now-playing view, so that I can see the artwork large.
55. As a listener, I want to collapse that view back to the bar, so that I can get back to browsing.
56. As a listener, I want my operating system's media controls to work, so that I can pause from my keyboard or lock screen.

### Playback position — the defining behaviour

57. As an audiobook listener, I want a book to resume exactly where I stopped, so that I never have to hunt for my place.
58. As an audiobook listener, I want my position saved while I listen, so that a crash or a closed tab costs me seconds rather than an hour.
59. As an audiobook listener, I want my position saved when I switch tabs or close the page, so that leaving is safe.
60. As an audiobook listener, I want to see my progress through a book in the library, so that I can tell what I'm partway through.
61. As an audiobook listener, I want a finished book marked as finished, so that I can tell it apart from an untouched one.
62. As a music listener, I want every song to start from the beginning every time, so that a song is never half-played when I pick it.
63. As a music listener, I want no progress indicator on songs, so that the library doesn't imply a position that doesn't exist.

### Audiobooks

64. As an audiobook listener, I want a book's chapters listed, so that I can see its structure.
65. As an audiobook listener, I want to click a chapter to jump to it, so that navigating a long file is easy.
66. As an audiobook listener, I want the current chapter highlighted, so that I know where I am.
67. As an audiobook listener, I want to skip back fifteen seconds and forward thirty, so that I can recover a sentence I missed.
68. As an audiobook listener, I want a book uploaded as a folder of files to behave as one book, so that its chapters play in order.
69. As an audiobook listener, I want to be told when I finish the last chapter, so that the silence is explained.

### Look and feel

70. As a listener, I want the app to have its own colour identity, so that it doesn't read as a worse copy of something else.
71. As a listener, I want real vector icons rather than emoji, so that the controls look the same on every device I use.
72. As a listener, I want icons to share a consistent weight and size, so that the player reads as one designed set.
73. As a listener, I want interactive things to look interactive, so that I can tell what I can click.
74. As a listener, I want hover and focus states on every control, so that the interface responds to me.
75. As a listener, I want to operate the app by keyboard with visible focus, so that it's usable without a mouse.
76. As a listener, I want animation kept restrained and to respect a reduced-motion preference, so that the interface doesn't distract or make me ill.
77. As a listener, I want the app usable on my phone, so that my library isn't desktop-only.
78. As a listener, I want a transient confirmation after an action, so that I know it took effect.

### Access and operation

79. As the owner, I want the deployed app to stay behind its password, so that my library isn't public.
80. As the owner, I want the login page to keep working unchanged, so that access isn't affected by a frontend rewrite.
81. As the owner, I want a deploy to be picked up on the next load, so that I'm not debugging a stale cached build.
82. As a developer, I want the frontend to hot-reload while I work on it, so that iterating on the UI is fast.
83. As a developer, I want one command to start both the API and the frontend in development, so that the dev loop stays simple.
84. As a developer, I want the production image to build the frontend itself, so that a deploy can't ship a stale build.
85. As a developer, I want the media record's shape checked at compile time, so that a typo in a field name fails before it reaches the browser.
86. As a developer, I want the rule that music carries no playback position expressed in the type system, so that it can't be forgotten at a call site.
87. As the owner, I want the browser extension to keep working untouched, so that the port doesn't cost me the one-click download flow.

## Implementation Decisions

### Framing

- The API is **unchanged**. No new endpoints, no changed payloads, no CORS middleware, no token endpoint. The port is a client rewrite that happens to also restyle.
- Audiobook support is **not** dropped. "Music only" scopes the *redesign*, not the port. Audiobooks are ported to the new stack and new tokens, keeping their current row treatment, resume indicator, and chapter list.

### Stack and build

- Vite + React + TypeScript, client-rendered, no SSR, no router (the app is one screen with modal-ish overlays, as today).
- The build emits content-hashed assets into a build output directory; the backend's frontend directory constant points at that output instead of the source directory.
- The login page stays a plain static asset copied verbatim into the build output at its current path, so the auth middleware's public-path list needs no change and the pre-auth page carries no framework.
- Development runs the Vite dev server with the API proxied through to the uvicorn process, so the browser sees one origin and HMR works. The dev target starts both processes; the existing Firestore and cloud targets keep their current env-var shapes and gain the same treatment.
- The container image gains a dedicated Node build stage that produces the frontend, with only the built output copied into the runtime image. The Node already installed in the runtime image exists for yt-dlp's JS challenges and is not reused for the build.
- Dependencies for the frontend are managed with npm inside the frontend directory; Python dependencies stay with uv.

### Backend changes (the only ones)

- The frontend directory constant moves to the build output.
- **The static cache policy inverts.** Today every non-API response is sent `no-cache`, which was correct when filenames were stable. With content-hashed filenames the entry HTML must stay `no-cache` while hashed asset files become long-lived and immutable. Getting this backwards ships a build users never see; getting it half-right (immutable HTML) ships one they can never escape.

### The audio element

- A single media element is created once as a module-level singleton **outside** React and is never unmounted. A provider subscribes to its events and mirrors them into React state; components render *from* the element and issue commands *to* it, but never own it. Remounting a media element stops playback and corrupts the saved position, so this is the load-bearing decision of the port.
- The existing guard that records which source is currently loaded is preserved. It exists so a finished track's end-of-playback handler cannot be mistaken for the end of the track that replaced it, and that race does not disappear under React.
- Periodic position saving while playing, plus a save when the page is hidden or unloaded, are preserved.

### Data and types

- One typed API client module wraps the existing endpoints. Nothing else in the app issues requests.
- The media record and playback state are typed. The type for playback state is nullable in exactly the way the API is: a music record carries none. The rule is expressed so that reading a position off a music record is a compile error rather than a runtime surprise, mirroring the server-side enforcement rather than replacing it.
- Tag counts shown next to filter chips are derived client-side from the library payload; no new endpoint.
- Track duration is already carried on the media record from upload-time extraction, so the new duration column needs no backend work. Records predating a duration render an em dash rather than a zero.
- Client-side metadata extraction on upload (tags, cover art, and duration read from the file itself) is retained, sourced as a package rather than a vendored script.

### Visual system

- Design tokens are CSS custom properties. The palette is warm-dark: a warm near-black ground, two raised warm surfaces, a hairline border, warm off-white text, a warm muted grey, and amber as the single accent. No value from the current palette survives.
- Icons come from a vector icon set as React components, at a consistent size and stroke weight. Every emoji and box-drawing glyph is replaced: play, pause, previous, next, shuffle, the row overflow menu, the filter-chip dismiss, the player collapse chevron, and the chapters toggle.
- Typography uses three roles: a serif display face used **only** for the wordmark and the now-playing title, a sans face for all other interface text, and a monospaced face for times, durations, and counts. Numeric columns use tabular figures.
- The music row is a grid: index (which becomes an animated playing indicator for the active track), cover art, a title and artist/album block, tags as their own column, duration, and an overflow menu revealed on hover. The playing row is marked by an accent rail and an accent title, not by a background tint alone.
- Tags render as quiet unfilled labels in their own column rather than filled pills beneath the title.
- The player is a three-column grid — now-playing metadata, transport with the scrubber beneath it, and secondary controls — replacing the current cramped single-row-plus-span layout.
- The full-screen now-playing view continues to be the *same* element re-flowed rather than a second player, so playback state stays single-sourced.
- Motion is limited to the playing indicator and short state transitions, and is disabled under a reduced-motion preference.

### Controls in the mockup that the app doesn't currently have

- **Volume: in scope.** It is a direct property of the media element with no queue semantics, and the mockup depicts it.
- **Repeat: out of scope.** The mockup depicts a repeat control, but repeat-one and repeat-all are new queue semantics that deserve their own specification. It is called out here so that it is neither built by accident nor assumed forgotten.

## Testing Decisions

This repo has no automated tests today, so there is **no prior art** — these are the first tests, and they set the pattern.

### What makes a good test here

Tests drive the app the way a person does and assert on what a person can observe: what is rendered, and what requests the app issues. They do not assert on component internals, props, hook return values, state shape, or class names beyond what a user perceives. A test that would fail if a component were renamed or split, without any change in behaviour, is testing the wrong thing.

### Primary seam: the app at its network boundary

The whole React app is rendered in a simulated DOM with HTTP faked at the network boundary. This is the highest available seam and covers the port's real risk in one place. The simulated DOM stubs media playback, which suits the assertions: we check *intent* — that a source was set, that a seek was performed, that a state save was issued — rather than audible output.

Behaviours to cover at this seam:

- An audiobook opened after a saved position resumes at that position.
- A music track always starts at zero, whatever the server returns, and issues no position save.
- Finishing a track hands off to the next one, and a stale end-of-playback event from the previous source does not skip the new one.
- Position is saved periodically during playback and when the page is hidden, using simulated time rather than real waiting.
- Search, kind tabs, and tag filters narrow the library, and narrow it correctly in combination.
- The playback queue is built from the music currently in view, in library order, and shuffle changes order without dropping or duplicating tracks.
- Selection mode: selecting, counting, bulk tag add, bulk tag remove, bulk delete behind its confirmation, and clearing a selection.
- The upload flow performs its three steps in order and surfaces a failure at any step as a message naming what failed.
- A download job is started and polled, and finished tracks appear as they complete.
- Chapters render for a book, clicking one seeks, and the current chapter is marked.

### Secondary seam: the backend's HTTP surface

A small number of tests exercise the running app over HTTP to pin the one backend behaviour that changes: that hashed asset paths are served long-lived and immutable while the entry HTML is served revalidating. This cannot be reached from the JavaScript seam, and it is the failure that hides — a wrong header here produces a working app serving stale code.

These tests set the data-directory environment variable to a temporary directory, per the existing project rule that tests must never touch the real data directory, which the reset target wipes.

### Not tested

Visual appearance, exact colour values, and layout are not asserted. They are reviewed by eye against the approved mockup.

## Out of Scope

- **The audiobook redesign.** Audiobooks are ported and restyled onto the new tokens, but their row treatment, resume display, and chapter list keep their current form. A dedicated audiobook presentation — large covers, prominent progress — is separate work.
- **A repeat control**, as described above.
- **Replacing the browser's native prompt and confirm dialogs** with in-app dialogs. The current client uses them for tag editing and delete confirmation; they are carried over as-is. Replacing them is a natural follow-up but would expand this port.
- **Any API change**, including the cacheable-playback-URL egress optimisation tracked separately in the README.
- **The browser extension.** It talks to the API directly and is unaffected.
- **The login page's design.** It keeps its current appearance so that the pre-auth surface stays framework-free.
- **Playlists, offline support, and PWA installation.**
- **A backend test suite beyond the cache-header tests.** Broader API testing is worth doing but is not this spec's job.

## Further Notes

- **Port the audio element first, before any UI work, and verify that an audiobook still resumes.** If that survives, the rest of the port is mechanical. If it doesn't, the architecture needs revisiting before a week of components is built on top of it.
- The approved mockup uses generated gradients as placeholder cover art. Real cover art is far more visually dominant and may pull against the warm palette. If it fights, the fix is desaturating the row background rather than shrinking the artwork.
- The current client's workaround rule for elements that would not hide should not be carried across. It exists because visibility lived in the DOM; under React the condition lives in the model and the element simply isn't rendered.
- Losing the "no build step" property of the frontend is a real cost, and it was accepted deliberately: the maintenance burden of hand-written DOM synchronisation across four overlapping UI modes now outweighs it.
- The two backend selector facades, the direct-to-storage upload flow, the signed-URL playback path, and the server-side enforcement that music keeps no position are all untouched by this work.
