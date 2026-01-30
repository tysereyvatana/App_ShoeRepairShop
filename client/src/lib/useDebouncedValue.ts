import React from "react";

/**
 * Debounce a value (useful for search boxes) so we don't refetch on every keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = React.useState<T>(value);

  React.useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);

  return debounced;
}
