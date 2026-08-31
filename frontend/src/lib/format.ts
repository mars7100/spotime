/** m:ss, or h:mm:ss past an hour. */
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** A record with no recorded duration reads as an em dash, never as 0:00. */
export const formatDuration = (seconds: number | null | undefined): string =>
  seconds == null || seconds <= 0 ? "—" : formatTime(seconds);
