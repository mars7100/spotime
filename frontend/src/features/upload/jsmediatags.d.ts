/* The package's `browser` field points at a file it does not ship, so bundlers
   resolving it fail. Importing the built browser bundle by path sidesteps that;
   @types/jsmediatags only describes the package root, so the subpath is typed
   here from the same types. */
declare module "jsmediatags/dist/jsmediatags.min.js" {
  import type { CallbackType } from "jsmediatags/types";
  export function read(file: Blob, callbacks: CallbackType): void;
  const jsmediatags: { read: typeof read };
  export default jsmediatags;
}
