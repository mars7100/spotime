# 13: Responsive, keyboard, and motion pass

**What to build:** The app works on a phone, can be driven entirely by keyboard with visible focus, keeps its animation restrained and switchable off, and confirms actions with a transient message so you know they took effect.

This is the one deliberately horizontal ticket in the set. A responsive and accessibility pass could not be sliced vertically without scattering it across every other ticket and being half-done in each; it is sequenced last among the feature work so it sweeps a complete interface once.

**Blocked by:** 04, 07

**Status:** ready-for-human

- [x] The library, filters, and player are usable at phone widths, with no horizontal scrolling of the page body
- [x] Wide content scrolls within its own container rather than pushing the page sideways
- [x] Every interactive control is reachable and operable by keyboard
- [x] Keyboard focus is visibly indicated everywhere
- [x] Interactive elements look interactive, and respond on hover
- [x] Animation is limited to the playing indicator and short state transitions
- [x] All animation is disabled when a reduced-motion preference is set
- [x] Actions produce a transient confirmation message
- [x] Nothing in the interface relies on colour alone to convey state

## Comments

2026-09-10 — Audited in Chrome at 390px (library, select mode, bulk bar, player bar,
full-screen) and by tab order, then fixed what the audit found:
- Row menu was hover-only, so unreachable on touch: `@media (hover: none)` shows it.
- No transient confirmation: `ui/toast.ts` + `<Toasts/>` (`role="status"`, 3 s, replaces
  rather than queues); every action reports through it and the four `window.alert`s are gone.
- Kind tabs had no arrow keys: ←/→/Home/End with roving tabindex.
Already in place from earlier tickets and verified, not rebuilt: global `:focus-visible`
ring, reduced-motion zeroing every transition/animation, row/player breakpoints, no
horizontal scroll at phone width, playing/selected states carried by shape as well as
colour. Noted, not changed: the full-screen player exposes two collapse buttons.
