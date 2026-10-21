import { useEffect, useState } from "react";

/** Whether `time` (ms) is still in the future; re-renders when it passes. */
export function useUntil(time: number | undefined) {
  const [passed, setPassed] = useState<number>();
  useEffect(() => {
    if (time === undefined) return;
    // setTimeout overflows past ~24.8 days; long waits just end on a later render.
    const timer = setTimeout(() => setPassed(time), Math.min(Math.max(time - Date.now(), 0), 2 ** 31 - 1));
    return () => clearTimeout(timer);
  }, [time]);
  return time !== undefined && passed !== time;
}
