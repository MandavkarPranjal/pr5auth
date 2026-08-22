import { useEffect } from "react";

export interface ShortcutHandlers {
	onFocusSearch?: () => void;
	onAddAccount?: () => void;
	onCloseModal?: () => void;
	onNavigate?: (page: string) => void;
	onCopyFirst?: () => void;
}

/**
 * Global keyboard shortcuts for PR5Auth.
 * - Cmd/Ctrl+K: focus search
 * - Cmd/Ctrl+N: add account
 * - Escape: close modal / clear search
 * - 1/2/3: navigate dashboard/import/settings (when not typing)
 * - / : focus search (vim-style)
 */
export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
	useEffect(() => {
		function isTypingTarget(el: EventTarget | null): boolean {
			if (!(el instanceof HTMLElement)) return false;
			const tag = el.tagName.toLowerCase();
			return tag === "input" || tag === "textarea" || el.isContentEditable;
		}

		function onKeyDown(e: KeyboardEvent) {
			const mod = e.metaKey || e.ctrlKey;

			if (mod && e.key.toLowerCase() === "k") {
				e.preventDefault();
				handlers.onFocusSearch?.();
				return;
			}
			if (mod && e.key.toLowerCase() === "n") {
				e.preventDefault();
				handlers.onAddAccount?.();
				return;
			}
			if (e.key === "Escape") {
				handlers.onCloseModal?.();
				return;
			}
			// Don't trigger nav shortcuts while typing
			if (isTypingTarget(e.target)) return;

			if (e.key === "/" && !mod) {
				e.preventDefault();
				handlers.onFocusSearch?.();
				return;
			}
			if (e.key === "1" && !mod) handlers.onNavigate?.("dashboard");
			if (e.key === "2" && !mod) handlers.onNavigate?.("import");
			if (e.key === "3" && !mod) handlers.onNavigate?.("settings");
		}

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [handlers]);
}
