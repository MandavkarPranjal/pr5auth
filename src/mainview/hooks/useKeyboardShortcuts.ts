import { useEffect } from "react";

export interface Shortcut {
	/** e.g. "k", "Escape", "n" */
	key: string;
	/** Require Ctrl or Cmd */
	mod?: boolean;
	/** Require Shift */
	shift?: boolean;
	/** Prevent default browser handling */
	preventDefault?: boolean;
	handler: (e: KeyboardEvent) => void;
	/** When false the shortcut is ignored */
	enabled?: boolean;
}

/**
 * Register global keyboard shortcuts.
 * Shortcuts are ignored when focus is inside an editable element
 * unless `allowInInput` is true.
 */
export function useKeyboardShortcuts(
	shortcuts: Array<Shortcut & { allowInInput?: boolean }>,
	deps: unknown[] = [],
) {
	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			const target = e.target as HTMLElement | null;
			const inInput =
				target instanceof HTMLInputElement ||
				target instanceof HTMLTextAreaElement ||
				target?.isContentEditable;

			for (const sc of shortcuts) {
				if (sc.enabled === false) continue;
				if (inInput && !sc.allowInInput) {
					// Allow Escape even inside inputs
					if (e.key !== "Escape" && sc.key !== "Escape") continue;
				}
				const modPressed = e.ctrlKey || e.metaKey;
				if (sc.mod && !modPressed) continue;
				if (!sc.mod && modPressed && sc.key.length === 1) continue;
				if (sc.shift !== undefined && sc.shift !== e.shiftKey) continue;
				// Case-insensitive for single letters
				const want = sc.key.length === 1 ? sc.key.toLowerCase() : sc.key;
				const got = e.key.length === 1 ? e.key.toLowerCase() : e.key;
				if (want !== got) continue;

				if (sc.preventDefault !== false) e.preventDefault();
				sc.handler(e);
				break;
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, deps);
}
