import { useCallback, useEffect, useMemo, useState } from "react";
import { generateSync } from "otplib";
import { createGuardrails } from "@otplib/core";
import type { Account } from "../types/account";

export interface TotpState {
	code: string;
	remaining: number;
	total: number;
	progress: number;
	isValid: boolean;
	refresh: () => void;
}

const FALLBACK_CODE = "••••••";

/**
 * Compatible guardrails: accept secrets down to 80 bits so
 * accounts exported from most authenticator apps keep working,
 * while remaining secure for everyday use.
 */
const guardrails = createGuardrails({ MIN_SECRET_BYTES: 10 });

export function useTotp(account: Account): TotpState {
	const [epoch, setEpoch] = useState<number>(() => Math.floor(Date.now() / 1000));

	useEffect(() => {
		let id: number | undefined;
		function tick() {
			if (document.visibilityState === "hidden") return;
			setEpoch(Math.floor(Date.now() / 1000));
		}
		function start() {
			id = window.setInterval(tick, 1000);
		}
		function handleVisibility() {
			if (document.visibilityState === "visible") tick();
		}
		start();
		document.addEventListener("visibilitychange", handleVisibility);
		return () => {
			if (id) window.clearInterval(id);
			document.removeEventListener("visibilitychange", handleVisibility);
		};
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
	}, [account.secret, account.algorithm, account.digits, account.period, epoch]);

	const remaining = account.period - (epoch % account.period);
	const progress = remaining / account.period;

	const refresh = useCallback(() => {
		setEpoch(Math.floor(Date.now() / 1000));
	}, []);

	return {
		code,
		remaining,
		total: account.period,
		progress,
		isValid: code !== FALLBACK_CODE,
		refresh,
	};
}
