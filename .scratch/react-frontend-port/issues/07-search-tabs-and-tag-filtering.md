# 07: Search, kind tabs, and tag filtering

**What to build:** Three ways to narrow the library, working together rather than fighting: a search box over title, artist and album; tabs for All, Music and Audiobooks; and tag filters shown as dismissable chips with a typeahead so the filter stays usable at hundreds of tags.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] Searching narrows the library by title, artist, or album
- [ ] Tabs switch between All, Music, and Audiobooks
- [ ] Tags can be applied as filters, and several combine to narrow to the intersection
- [ ] Each active filter appears as a chip that can be dismissed individually, so it is always clear why the list is short
- [ ] Each selectable tag shows how many tracks carry it, derived from the library already loaded rather than a new endpoint
- [ ] Tags can be searched by typing, so the filter works with hundreds of them
- [ ] Search, tabs, and tag filters narrow correctly in combination
- [ ] The tag filter is hidden entirely when there are no tags
- [ ] Tests cover each of the three narrowing tools alone, and all three applied together
