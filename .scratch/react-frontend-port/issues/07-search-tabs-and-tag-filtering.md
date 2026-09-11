# 07: Search, kind tabs, and tag filtering

**What to build:** Three ways to narrow the library, working together rather than fighting: a search box over title, artist and album; tabs for All, Music and Audiobooks; and tag filters shown as dismissable chips with a typeahead so the filter stays usable at hundreds of tags.

**Blocked by:** 03

**Status:** ready-for-human

- [x] Searching narrows the library by title, artist, or album
- [x] Tabs switch between All, Music, and Audiobooks
- [x] Tags can be applied as filters, and several combine to narrow to the intersection
- [x] Each active filter appears as a chip that can be dismissed individually, so it is always clear why the list is short
- [x] Each selectable tag shows how many tracks carry it, derived from the library already loaded rather than a new endpoint
- [x] Tags can be searched by typing, so the filter works with hundreds of them
- [x] Search, tabs, and tag filters narrow correctly in combination
- [x] The tag filter is hidden entirely when there are no tags
- [x] Tests cover each of the three narrowing tools alone, and all three applied together
