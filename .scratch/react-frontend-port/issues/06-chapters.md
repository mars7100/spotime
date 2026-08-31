# 06: Chapters

**What to build:** An audiobook shows its chapters, so you can see the book's structure and jump straight to a part you want. The chapter you're currently in is marked, so you always know where you are in a long file.

**Blocked by:** 05

**Status:** ready-for-human

- [x] A book with chapters offers a chapter list from the player
- [x] Each chapter shows its title and start time
- [x] Clicking a chapter seeks to it
- [x] The chapter covering the current position is marked as current, and the marking follows playback
- [x] A book uploaded as a folder of per-chapter files behaves as one book, with its files playing in order
- [x] Reaching the end of the last chapter shows a message explaining that the book is finished, rather than silence
- [x] The chapter list is absent for books with no chapters and for all music
- [x] Tests cover: chapters rendering for a book; clicking one seeking to its start; the current chapter being marked

## Comments

Built. `uv run pytest` — 4 passing; `npm --prefix frontend run test` — 64 passing
across seven files (19 of them new here).

**Two sources, one list.** "Chapters" means two unrelated things: the marks ffprobe
reads out of a single container (`{title, start_seconds}`), and the files of a book
uploaded as a folder. `player/chapters.ts` collapses both to one `ChapterEntry`, so
the panel never asks which it is looking at — picking one is a seek in the first case
and a load in the second, and that difference lives in the provider alone.

**Folder books now actually play as books.** Ticket 05 left the row opening chapter
one and stopping there. The provider carries a *book session* (`{...book, index}`)
alongside `current`: `playBook(card, index)` starts it at the library's resume
chapter, `ended` advances to the next file, and next/previous step within the book
rather than through the music queue. Playing anything else passes a null session, so
"am I in a book" is never inferred from the record — a chapter played from somewhere
else is just a track.

**Deliberate choices**

- A folder chapter's start is the *running total* of the chapters before it, which
  is what "start time" means for a book in three files. One missing duration makes
  every later total a guess, so from there on the start is null and renders as a
  dash rather than a confident wrong number.
- Auto-advance loads the next chapter with `resume: false`. You have arrived at the
  top of it; a position saved on an earlier pass would throw you forward.
- The end-of-book message is a `notice` in player state, in the same slot as the
  error and styled as ordinary text — reaching the end of a book is not a failure.
  Both shapes get one: "that was the last chapter" for a folder book, and the end of
  a single file for a marked one. Spec §78's general toast belongs to a later ticket.
- The chapter list lives in its own context. Which chapter you are in is derived from
  `position`, which changes four times a second; sharing the state context would
  re-render the panel on every tick for a value that changes once a chapter.
- The player bar now names the *book* with the chapter beneath it
  ("Dune · Chapter Two — Muad'Dib · 2/3"), matching the vanilla client. Without it a
  folder book reads as a stray file called "Chapter Two".

**Verified in the browser** against a seeded 3-chapter m4b and a 3-file folder book
(both since deleted): the panel opens from the bar, marks the chapter being listened
to and follows playback into the next one, seeks on click, loads the picked file for
a folder book, auto-advances at the end of a chapter, and shows the finished message
after the last one. One bug found and fixed there: the panel was `position: fixed`
with `bottom: 100%`, which resolves against the *viewport*, so it rendered above the
top of the screen — present in the DOM, correct in the tests, invisible to a human.
It is anchored to the (itself fixed) player bar now.
