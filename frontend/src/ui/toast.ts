/* A transient confirmation — "Tags saved", "Deleted 3" — announced by whatever
   did the thing, shown by the one <Toasts/> on the page. Not a queue: a new
   message replaces the old, which is all a confirmation needs. */

const listeners = new Set<(message: string) => void>();

export function toast(message: string): void {
  for (const listener of [...listeners]) listener(message);
}

export function onToast(listener: (message: string) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
