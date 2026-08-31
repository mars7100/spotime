# 14: Contract — retire the vanilla client

**What to build:** The React app is now at parity, so the old client and everything propping it up comes out. This is the **contract** half of the expand–contract sequence begun in ticket 02: the legacy path that kept Spotime usable throughout the port is removed, leaving one frontend.

**Blocked by:** 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13

**Status:** ready-for-agent

- [ ] The vanilla client's script, stylesheet, and entry page are deleted
- [ ] The vendored metadata-extraction script is deleted, its packaged equivalent having replaced it
- [ ] The legacy path added in ticket 02 is removed, along with whatever copied the old files into the build output
- [ ] The workaround rule for elements that would not hide is gone and has not been carried across; under the new architecture the condition lives in the model and the element simply is not rendered
- [ ] No emoji or box-drawing glyph remains anywhere in the interface
- [ ] Project documentation no longer describes the frontend as a no-build-step vanilla client, and describes the current stack, development command, and build instead
- [ ] The full test suite passes and the container image builds and serves the app
- [ ] The interface is reviewed by eye against the approved mockup, since appearance is not asserted by tests
