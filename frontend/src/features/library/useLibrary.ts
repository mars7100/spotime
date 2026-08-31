import { useEffect, useState } from "react";
import { getLibrary } from "../../api/client";
import type { MediaRecord } from "../../api/types";

type Result =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; items: MediaRecord[] };

/** The library loads on open — no second click. One resource, one hook. */
export function useLibrary(): Result {
  const [result, setResult] = useState<Result>({ status: "loading" });

  useEffect(() => {
    let live = true;
    getLibrary()
      .then((items) => live && setResult({ status: "ready", items }))
      .catch((err: unknown) =>
        live && setResult({ status: "error", message: err instanceof Error ? err.message : "failed" }),
      );
    return () => {
      live = false;
    };
  }, []);

  return result;
}
