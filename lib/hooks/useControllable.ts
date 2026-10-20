import { useState } from "react";

/**
 * A value that's controlled when `value` is given (the parent owns it) and
 * uncontrolled otherwise (starts at `defaultValue`). Setting it reports to
 * `onChange` either way.
 */
export function useControllable<T>(value: T | undefined, defaultValue: T, onChange?: (value: T) => void) {
  const [internal, setInternal] = useState(defaultValue);
  const controlled = value !== undefined;
  const current = controlled ? value : internal;
  const set = (next: T) => {
    if (!controlled) setInternal(next);
    onChange?.(next);
  };
  return [current, set] as const;
}
