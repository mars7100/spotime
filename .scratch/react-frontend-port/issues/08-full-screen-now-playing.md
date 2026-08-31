# 08: Full-screen now-playing view

**What to build:** Expand the player into a full-screen now-playing view with large artwork, and collapse it back to the bar to keep browsing. Operating-system media controls work, so playback can be paused from a keyboard or a lock screen.

The expanded view is the *same* player element re-flowed, not a second player, so playback state stays single-sourced and there is no possibility of the two disagreeing.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] The player can be expanded to a full-screen view showing large cover art
- [ ] The expanded view can be collapsed back to the bar
- [ ] The affordance for expanding is discoverable from the collapsed bar
- [ ] Expanding and collapsing reuses the same player element rather than mounting a second one, so playback is never interrupted by the transition
- [ ] All transport controls remain available and functional in the expanded view
- [ ] Operating-system media controls reflect what is playing and can pause, resume, and skip
- [ ] Tests cover: expanding and collapsing without interrupting playback; transport controls working in both states
