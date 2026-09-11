/* "The library changed" — announced by whatever changed it, heard by the list.
   Uploads (and, later, downloads and deletions) happen outside the library
   component, and none of them should have to hold a reference to it. */

const listeners = new Set<() => void>();

export function notifyLibraryChanged(): void {
  for (const listener of [...listeners]) listener();
}

export function onLibraryChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
