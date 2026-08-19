import type { Account } from "../types/account";
import { createId } from "./accountService";

/**
 * Demo accounts seeded on first launch so the dashboard
 * shows live TOTP codes immediately. All secrets are real
 * Base32 values so otplib generates valid codes.
 */
export function createMockAccounts(): Account[] {
	const now = Date.now();

	return [
		{
			id: createId(),
			issuer: "GitHub",
			accountName: "dev@example.com",
			secret: "JBSWY3DPEHPK3PXP",
			algorithm: "sha1",
			digits: 6,
			period: 30,
			createdAt: now - 60_000 * 60 * 24 * 9,
		},
		{
			id: createId(),
			issuer: "Google",
			accountName: "you@gmail.com",
			secret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
			algorithm: "sha1",
			digits: 6,
			period: 30,
			createdAt: now - 60_000 * 60 * 24 * 4,
		},
		{
			id: createId(),
			issuer: "ProtonMail",
			accountName: "hi@proton.me",
			secret: "MFRGGZDFMZTWQ2LK",
			algorithm: "sha256",
			digits: 8,
			period: 60,
			createdAt: now - 60_000 * 60 * 12,
		},
	];
}
