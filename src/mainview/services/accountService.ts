import type { Account, AddAccountInput, HashAlgorithm, Digits } from "../types/account";

const BASE32_REGEX = /^[A-Z2-7]+=*$/;
const OTPAUTH_REGEX = /^otpauth:\/\/totp\//i;

export function normalizeSecret(secret: string): string {
	return secret.replace(/[\s-]/g, "").toUpperCase();
}

export function isValidSecret(secret: string): boolean {
	if (!secret) return false;
	// Base32 validity + at least 80 bits (16 chars) to match otplib guardrails.
	return secret.length >= 16 && BASE32_REGEX.test(secret);
}

export function createId(): string {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return crypto.randomUUID();
	}
	return `acc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createAccount(input: AddAccountInput): Account {
	return {
		id: createId(),
		issuer: input.issuer.trim(),
		accountName: input.accountName.trim(),
		secret: normalizeSecret(input.secret),
		algorithm: input.algorithm ?? "sha1",
		digits: input.digits ?? 6,
		period: input.period ?? 30,
		createdAt: Date.now(),
	};
}

export function addAccount(accounts: Account[], input: AddAccountInput): Account[] {
	return [createAccount(input), ...accounts];
}

export function deleteAccount(accounts: Account[], id: string): Account[] {
	return accounts.filter((account) => account.id !== id);
}

export function findAccounts(accounts: Account[], query: string): Account[] {
	const q = query.trim().toLowerCase();
	if (!q) return accounts;
	return accounts.filter(
		(a) =>
			a.issuer.toLowerCase().includes(q) || a.accountName.toLowerCase().includes(q),
	);
}

export interface ParsedOtpauth {
	issuer: string;
	accountName: string;
	secret: string;
	algorithm: HashAlgorithm;
	digits: Digits;
	period: number;
}

export function parseOtpauthUri(uri: string): ParsedOtpauth | null {
	const raw = uri.trim();
	if (!OTPAUTH_REGEX.test(raw)) return null;

	const url = new URL(raw);
	if (url.hostname.toLowerCase() !== "totp") return null;

	const secret = url.searchParams.get("secret")?.trim() ?? "";
	if (!isValidSecret(normalizeSecret(secret))) return null;

	const label = decodeURIComponent(url.pathname.replace(/^\//, ""));

	let issuer = url.searchParams.get("issuer")?.trim() ?? "";
	let accountName = label;

	if (label.includes(":")) {
		const colonIndex = label.indexOf(":");
		issuer = issuer || label.slice(0, colonIndex);
		accountName = label.slice(colonIndex + 1);
	}

	const rawAlgorithm = (url.searchParams.get("algorithm") ?? "sha1").toLowerCase();
	const rawDigits = Number(url.searchParams.get("digits") ?? 6);
	const rawPeriod = Number(url.searchParams.get("period") ?? 30);

	return {
		issuer: issuer.trim() || "Unknown",
		accountName: accountName.trim() || "Account",
		secret: normalizeSecret(secret),
		algorithm: ["sha1", "sha256", "sha512"].includes(rawAlgorithm)
			? (rawAlgorithm as HashAlgorithm)
			: "sha1",
		digits: [6, 7, 8].includes(rawDigits) ? (rawDigits as Digits) : 6,
		period: rawPeriod >= 5 && rawPeriod <= 300 ? rawPeriod : 30,
	};
}

export interface VaultFile {
	app: string;
	version: number;
	exportedAt: string;
	accounts: Account[];
}

export function exportVault(accounts: Account[]): string {
	const payload: VaultFile = {
		app: "PR5Auth",
		version: 1,
		exportedAt: new Date().toISOString(),
		accounts,
	};
	return JSON.stringify(payload, null, 2);
}

export function parseVaultImport(json: string): Account[] {
	const parsed: unknown = JSON.parse(json);

	if (typeof parsed !== "object" || parsed === null) {
		throw new Error("Invalid vault file");
	}

	const candidate = parsed as Partial<VaultFile>;

	if (Array.isArray(candidate.accounts)) {
		const accounts = candidate.accounts.filter(isValidAccount);
		if (accounts.length > 0) return accounts;
		throw new Error("Vault contains no valid accounts");
	}

	if (Array.isArray(candidate)) {
		const accounts = (candidate as unknown[]).filter(isValidAccount);
		if (accounts.length > 0) return accounts;
		throw new Error("Vault contains no valid accounts");
	}

	throw new Error("Unrecognized vault format");
}

function isValidAccount(value: unknown): value is Account {
	if (typeof value !== "object" || value === null) return false;
	const a = value as Partial<Account>;
	return (
		typeof a.id === "string" &&
		typeof a.issuer === "string" &&
		typeof a.accountName === "string" &&
		typeof a.secret === "string" &&
		isValidSecret(a.secret)
	);
}

export function downloadVaultFile(accounts: Account[], filename = "pr5auth-vault.json"): void {
	const blob = new Blob([exportVault(accounts)], { type: "application/json" });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename;
	anchor.click();
	URL.revokeObjectURL(url);
}
