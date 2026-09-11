import { useEffect, useState } from "react";
import { getLibrary } from "../../api/client";
import type { MediaRecord } from "../../api/types";
import { onLibraryChange } from "./refresh";

type Result =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; items: MediaRecord[] };

/** The library loads on open — no second click. One resource, one hook.
    It reloads whenever something says the library changed (an upload landing,
    for instance); a reload that fails leaves the list you already have alone
    rather than replacing it with an error. */
export function useLibrary(): Result {
  const [result, setResult] = useState<Result>({ status: "loading" });

  useEffect(() => {
    let live = true;
    const load = () =>
      getLibrary()
        .then((items) => live && setResult({ status: "ready", items }))
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : "failed";
          live && setResult((prev) => (prev.status === "ready" ? prev : { status: "error", message }));
        });
    void load();
    const stopListening = onLibraryChange(() => void load());
    return () => {
      live = false;
      stopListening();
    };
  }, []);

  return result;
}
