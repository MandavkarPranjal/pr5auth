import { useEffect, useState } from "react";

/**
 * Debounce a value by `delay` ms. Useful for search inputs so
 * filtering does not run on every keystroke.
 */
export function useDebouncedValue<T>(value: T, delay = 200): T {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const id = window.setTimeout(() => setDebounced(value), delay);
		return () => window.clearTimeout(id);
	}, [value, delay]);
	return debounced;
}
