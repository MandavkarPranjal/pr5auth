import { useSyncExternalStore, useCallback, useMemo } from "react";
import { generateSync } from "otplib";
import { createGuardrails } from "@otplib/core";
import type { Account } from "../types/account";

/**
 * Single shared 250 ms ticker for all TOTP cards — avoids N intervals
 * when the vault contains many accounts.
 */
let epochSec = Math.floor(Date.now() / 1000);
let tick = 0;
let snapshot = { epochSec, tick };
const listeners = new Set<() => void>();
let timer: number | null = null;

function startIfNeeded() {
	if (timer !== null) return;
	timer = window.setInterval(() => {
		epochSec = Math.floor(Date.now() / 1000);
		snapshot = { epochSec, tick: ++tick };
		for (const l of listeners) l();
	}, 250);
}

function subscribe(cb: () => void) {
	listeners.add(cb);
	epochSec = Math.floor(Date.now() / 1000);
	snapshot = { epochSec, tick: ++tick };
	startIfNeeded();
	return () => {
		listeners.delete(cb);
		if (listeners.size === 0 && timer !== null) {
			window.clearInterval(timer);
			timer = null;
		}
	};
}

function getSnapshot() {
	return snapshot;
}

const guardrails = createGuardrails({ MIN_SECRET_BYTES: 10 });
const FALLBACK_CODE = "••••••";

export interface TotpState {
	code: string;
	remaining: number;
	total: number;
	progress: number;
	isValid: boolean;
	refresh: () => void;
}

/** Optimized TOTP hook that shares a single timer across all cards. */
export function useTotp(account: Account): TotpState {
	const { epochSec: epoch } = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

	const refresh = useCallback(() => {
		epochSec = Math.floor(Date.now() / 1000);
		snapshot = { epochSec, tick: ++tick };
		for (const l of listeners) l();
	}, []);

	const code = useMemo(() => {
		try {
			return generateSync({
				secret: account.secret,
				algorithm: account.algorithm,
				digits: account.digits,
				period: account.period,
				epoch,
				guardrails,
			});
		} catch {
			return FALLBACK_CODE;
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [account.secret, account.algorithm, account.digits, account.period, epoch]);

	const remaining = account.period - (epoch % account.period);
	const progress = remaining / account.period;

	return { code, remaining, total: account.period, progress, isValid: code !== FALLBACK_CODE, refresh };
}
