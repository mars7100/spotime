# 13: Responsive, keyboard, and motion pass

**What to build:** The app works on a phone, can be driven entirely by keyboard with visible focus, keeps its animation restrained and switchable off, and confirms actions with a transient message so you know they took effect.

This is the one deliberately horizontal ticket in the set. A responsive and accessibility pass could not be sliced vertically without scattering it across every other ticket and being half-done in each; it is sequenced last among the feature work so it sweeps a complete interface once.

**Blocked by:** 04, 07

**Status:** ready-for-agent

- [ ] The library, filters, and player are usable at phone widths, with no horizontal scrolling of the page body
- [ ] Wide content scrolls within its own container rather than pushing the page sideways
- [ ] Every interactive control is reachable and operable by keyboard
- [ ] Keyboard focus is visibly indicated everywhere
- [ ] Interactive elements look interactive, and respond on hover
- [ ] Animation is limited to the playing indicator and short state transitions
- [ ] All animation is disabled when a reduced-motion preference is set
- [ ] Actions produce a transient confirmation message
- [ ] Nothing in the interface relies on colour alone to convey state
