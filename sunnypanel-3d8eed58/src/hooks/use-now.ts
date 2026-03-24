import { useEffect, useState } from "react";

/**
 * Returns a `now` timestamp that updates on an interval (default: 60s).
 * Useful for simple countdown UIs without heavy timers.
 */
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), Math.max(1_000, intervalMs));
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return now;
}
