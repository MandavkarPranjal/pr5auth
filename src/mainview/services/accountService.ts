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
	try {
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
	} catch {
		return null;
	}
}

export const VAULT_SCHEMA_VERSION = 1

export interface VaultFile {
	app: string;
	version: number;
	exportedAt: string;
	accounts: Account[];
}

function buildVaultFile(accounts: Account[], exportedAt: string): VaultFile {
	return {
		app: "PR5Auth",
		version: VAULT_SCHEMA_VERSION,
		exportedAt,
		accounts,
	};
}

export function serializeVault(
	accounts: Account[],
	exportedAt = new Date().toISOString(),
): string {
	return JSON.stringify(buildVaultFile(accounts, exportedAt));
}

export function deserializeVault(json: string): Account[] | null {
	try {
		const parsed: unknown = JSON.parse(json);
		if (typeof parsed !== "object" || parsed === null) return null;
		const candidate = parsed as Partial<VaultFile>;
		if (
			candidate.version !== VAULT_SCHEMA_VERSION ||
			!Array.isArray(candidate.accounts)
		) {
			return null;
		}
		const accounts = candidate.accounts.filter(isValidAccount);
		return accounts;
	} catch {
		return null;
	}
}

export function exportVault(accounts: Account[]): string {
	return JSON.stringify(
		buildVaultFile(accounts, new Date().toISOString()),
		null,
		2,
	);
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

export function isValidAccount(value: unknown): value is Account {
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

function isValidLegacyAccount(value: unknown): boolean {
	if (typeof value !== "object" || value === null) return false;
	const a = value as Partial<Account>;
	return (
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

// ─── Standard otpauth batch import ─────────────────────────────────────────

export interface OtpauthBatchResult {
	parsed: ParsedOtpauth[];
	errors: Array<{ raw: string; reason: string }>;
}

/**
 * Parse one or many standard otpauth://totp/ URIs from a free-form string.
 * Accepts newline, comma or whitespace separated entries, trims each line,
 * and collects per-entry errors so callers can surface migration feedback.
 */
export function parseOtpauthUris(input: string): ParsedOtpauth[] {
	return parseOtpauthBatch(input).parsed;
}

export function parseOtpauthBatch(input: string): OtpauthBatchResult {
	const parsed: ParsedOtpauth[] = [];
	const errors: Array<{ raw: string; reason: string }> = [];
	if (!input || !input.trim()) return { parsed, errors };

	// Split on newlines first to preserve line-aware errors, then split
	// comma/space separated tokens within each line if not already a URI.
	const lines = input.split(/\r?\n/);
	for (const line of lines) {
		const trimmedLine = line.trim();
		if (!trimmedLine) continue;

		// Explicitly detect Google Authenticator migration URIs
		if (/^otpauth-migration:\/\//i.test(trimmedLine)) {
			errors.push({
				raw: trimmedLine,
				reason: "otpauth-migration:// URIs require migration decoding (not a plain otpauth://totp/ URI)",
			});
			continue;
		}

		// If line contains multiple URIs separated by comma or whitespace+otpauth://, split
		// Use a regex to extract all otpauth://totp/... occurrences
		const uriRegex = /otpauth:\/\/totp\/[^\s,]+(?:\?[^\s,]*)?/gi;
		const matches = trimmedLine.match(uriRegex);

		if (matches && matches.length > 0) {
			// If the whole line is a single URI (or multiple URIs matched), parse each match
			// Also handle case where line has surrounding text
			for (const rawUri of matches) {
				try {
					const entry = parseOtpauthUri(rawUri);
					if (entry) parsed.push(entry);
					else errors.push({ raw: rawUri, reason: "Invalid otpauth URI or secret" });
				} catch (err) {
					errors.push({ raw: rawUri, reason: err instanceof Error ? err.message : "Invalid otpauth URI or secret" });
				}
			}
		} else {
			// No otpauth:// pattern found – try parsing the whole line as a URI
			try {
				const entry = parseOtpauthUri(trimmedLine);
				if (entry) parsed.push(entry);
				else {
					// Also support comma-separated raw strings without newlines
					const commaParts = trimmedLine.split(",").map((s) => s.trim()).filter(Boolean);
					if (commaParts.length > 1) {
						for (const part of commaParts) {
							try {
								const e = parseOtpauthUri(part);
								if (e) parsed.push(e);
								else errors.push({ raw: part, reason: "Invalid otpauth URI or secret" });
							} catch (err) {
								errors.push({ raw: part, reason: err instanceof Error ? err.message : "Invalid otpauth URI or secret" });
							}
						}
					} else {
						errors.push({ raw: trimmedLine, reason: "Invalid otpauth URI or secret" });
					}
				}
			} catch (err) {
				errors.push({ raw: trimmedLine, reason: err instanceof Error ? err.message : "Invalid otpauth URI or secret" });
			}
		}
	}

	return { parsed, errors };
}

// Alias for migration workflow callers
export const parseBulkOtpauth = parseOtpauthBatch;
export const parseStandardOtpauthEntries = parseOtpauthUris;

// ─── Duplicate detection ───────────────────────────────────────────────────

export interface DuplicateCheckResult<T> {
	duplicates: T[];
	uniques: T[];
}

function normalizeKey(value: string): string {
	return value.trim().toLowerCase();
}

function accountDuplicateKey(account: { issuer: string; accountName: string; secret: string }): string[] {
	// Two keys for duplicate detection: normalized secret and issuer+name composite
	const secretKey = `secret:${normalizeSecret(account.secret)}`;
	const identityKey = `identity:${normalizeKey(account.issuer)}::${normalizeKey(account.accountName)}`;
	return [secretKey, identityKey];
}

export function isDuplicateAccount(
	a: { issuer: string; accountName: string; secret: string },
	b: { issuer: string; accountName: string; secret: string },
): boolean {
	const aSecret = normalizeSecret(a.secret);
	const bSecret = normalizeSecret(b.secret);
	if (aSecret && bSecret && aSecret === bSecret) return true;
	if (
		normalizeKey(a.issuer) === normalizeKey(b.issuer) &&
		normalizeKey(a.accountName) === normalizeKey(b.accountName)
	) {
		return true;
	}
	return false;
}

// Alias names for test compatibility
export const areDuplicates = isDuplicateAccount;
export const isDuplicate = isDuplicateAccount;

export function detectDuplicates<T extends { issuer: string; accountName: string; secret: string }>(
	existing: Array<{ issuer: string; accountName: string; secret: string }>,
	incoming: T[],
): DuplicateCheckResult<T> {
	const existingKeys = new Set<string>();
	for (const acc of existing) {
		for (const k of accountDuplicateKey(acc)) existingKeys.add(k);
	}

	const duplicates: T[] = [];
	const uniques: T[] = [];
	const seenIncoming = new Set<string>();

	for (const item of incoming) {
		const keys = accountDuplicateKey(item);
		const isDupExisting = keys.some((k) => existingKeys.has(k));
		const isDupIncoming = keys.some((k) => seenIncoming.has(k));
		if (isDupExisting || isDupIncoming) {
			duplicates.push(item);
		} else {
			uniques.push(item);
			for (const k of keys) seenIncoming.add(k);
		}
	}

	return { duplicates, uniques };
}

export const findDuplicates = detectDuplicates;
export const getDuplicates = detectDuplicates;

export function filterDuplicateAccounts<T extends { issuer: string; accountName: string; secret: string }>(
	existing: Array<{ issuer: string; accountName: string; secret: string }>,
	incoming: T[],
): T[] {
	return detectDuplicates(existing, incoming).uniques;
}

export const deduplicateAccounts = filterDuplicateAccounts;
export const filterDuplicates = filterDuplicateAccounts;

// ─── Account creation from parsed otpauth ──────────────────────────────────

export function createAccountsFromParsed(parsed: ParsedOtpauth[]): Account[] {
	return parsed.map((p) =>
		createAccount({
			issuer: p.issuer,
			accountName: p.accountName,
			secret: p.secret,
			algorithm: p.algorithm,
			digits: p.digits,
			period: p.period,
		}),
	);
}

// ─── Exported JSON import (multi-format) ───────────────────────────────────

export interface JsonImportResult {
	accounts: Account[];
	source: "pr5auth-vault" | "pr5auth-array" | "generic-array" | "aegis" | "otpauth-uris" | "unknown";
	warnings: string[];
}

function normalizeAlgorithm(raw: unknown): HashAlgorithm {
	const v = typeof raw === "string" ? raw.toLowerCase() : "sha1";
	if (v === "sha256") return "sha256";
	if (v === "sha512") return "sha512";
	return "sha1";
}

function normalizeDigits(raw: unknown): Digits {
	const n = Number(raw);
	if (n === 7) return 7;
	if (n === 8) return 8;
	return 6;
}

function normalizePeriod(raw: unknown): number {
	const n = Number(raw);
	return Number.isFinite(n) && n >= 5 && n <= 300 ? n : 30;
}

function tryParseAegis(parsed: unknown): Account[] | null {
	try {
		if (typeof parsed !== "object" || parsed === null) return null;
		const obj = parsed as Record<string, unknown>;
		// Aegis format: { db: { entries: [...] } } or { entries: [...] }
		const db = (obj.db as Record<string, unknown> | undefined) ?? obj;
		const entries = (db.entries ?? db.accounts ?? obj.entries) as unknown;
		if (!Array.isArray(entries)) return null;
		const accounts: Account[] = [];
		for (const e of entries) {
			if (typeof e !== "object" || e === null) continue;
			const entry = e as Record<string, unknown>;
			const info = (entry.info as Record<string, unknown> | undefined) ?? entry;
			const secret = typeof info.secret === "string" ? info.secret : typeof entry.secret === "string" ? entry.secret : "";
			if (!isValidSecret(normalizeSecret(secret))) continue;
			// Aegis name often like "GitHub: user@example.com"
			const rawName = typeof entry.name === "string" ? entry.name : typeof entry.label === "string" ? entry.label : "";
			const issuerFromEntry = typeof entry.issuer === "string" ? entry.issuer : typeof info.issuer === "string" ? info.issuer : "";
			let issuer = issuerFromEntry;
			let accountName = rawName;
			if (rawName.includes(":")) {
				const idx = rawName.indexOf(":");
				issuer = issuer || rawName.slice(0, idx).trim();
				accountName = rawName.slice(idx + 1).trim();
			}
			// Aegis algo is upper like "SHA1"
			accounts.push(
				createAccount({
					issuer: issuer || "Unknown",
					accountName: accountName || (typeof info.name === "string" ? info.name : "Account"),
					secret: normalizeSecret(secret),
					algorithm: normalizeAlgorithm(info.algo ?? info.algorithm),
					digits: normalizeDigits(info.digits),
					period: normalizePeriod(info.period),
				}),
			);
		}
		return accounts.length > 0 ? accounts : null;
	} catch {
		return null;
	}
}

function tryParseOtpauthUriArray(parsed: unknown, warnings?: string[]): Account[] | null {
	if (!Array.isArray(parsed)) return null;
	if (parsed.length === 0) return null;
	const stringEntries = parsed.filter((v): v is string => typeof v === "string");
	if (stringEntries.length === 0) return null;
	if (!stringEntries.some((s) => /^otpauth:\/\//i.test(s.trim()))) return null;
	const nonStringCount = parsed.length - stringEntries.length;
	if (nonStringCount > 0 && warnings) {
		for (const item of parsed) {
			if (typeof item !== "string") {
				let preview: string;
				try {
					preview = JSON.stringify(item)?.slice(0, 80) ?? String(item).slice(0, 80);
				} catch {
					preview = String(item).slice(0, 80);
				}
				warnings.push(`Non-string entry ignored: ${preview}`);
			}
		}
	}
	const batch = parseOtpauthBatch(stringEntries.join("\n"));
	if (warnings) {
		for (const err of batch.errors) {
			warnings.push(`${err.raw}: ${err.reason}`);
		}
	}
	if (batch.parsed.length > 0) return createAccountsFromParsed(batch.parsed);
	return null;
}

/**
 * Parse an exported JSON file from various authenticator apps.
 * Supports:
 *  - PR5Auth vault file { app, version, exportedAt, accounts }
 *  - Plain array of Account objects
 *  - Object with { accounts: [...] }
 *  - Aegis JSON { db: { entries: [...] } }
 *  - Array of otpauth:// URIs
 *  - Object with { uris, otpauth, entries } containing URIs or account objects
 */
export function parseExportedJson(json: string): Account[] {
	const result = parseJsonImport(json);
	if (result.accounts.length === 0) throw new Error("Vault contains no valid accounts");
	return result.accounts;
}

export function parseJsonImport(json: string): JsonImportResult {
	let parsed: unknown;
	try {
		parsed = JSON.parse(json);
	} catch {
		throw new Error("Invalid JSON file");
	}
	if (typeof parsed !== "object" || parsed === null) throw new Error("Invalid vault file");

	const warnings: string[] = [];

	// 1. Already handled by deserializeVault? Try PR5Auth vault file first
	if (!Array.isArray(parsed)) {
		const candidate = parsed as Partial<VaultFile>;
		if (Array.isArray(candidate.accounts)) {
			const accounts = (candidate.accounts as unknown[]).filter(isValidLegacyAccount) as Account[];
			// Migrate older versions: accept version 1, but also migrate older without version
			if (accounts.length > 0) {
				// If vault is PR5Auth format, normalize accounts to ensure IDs/createdAt
				const normalized = accounts.map((a) => ({
					...a,
					id: typeof a.id === "string" && a.id ? a.id : createId(),
					createdAt: typeof a.createdAt === "number" ? a.createdAt : Date.now(),
				}));
				const source = candidate.app === "PR5Auth" || candidate.version === VAULT_SCHEMA_VERSION ? "pr5auth-vault" as const : "generic-array" as const;
				return { accounts: normalized, source, warnings };
			}
		}
	}

	// 2. Plain array of accounts
	if (Array.isArray(parsed)) {
		const uriAccounts = tryParseOtpauthUriArray(parsed, warnings);
		if (uriAccounts) return { accounts: uriAccounts, source: "otpauth-uris", warnings };
		const accounts = (parsed as unknown[]).filter(isValidAccount) as Account[];
		if (accounts.length > 0) return { accounts, source: "pr5auth-array", warnings };
	}

	// 3. Object containing accounts/entries/uris
	if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
		const obj = parsed as Record<string, unknown>;

		// Check for uris / otpauth arrays
		for (const key of ["uris", "otpauth", "otpauth_uris", "urls", "entries"]) {
			if (Array.isArray(obj[key])) {
				const uriAccounts = tryParseOtpauthUriArray(obj[key], warnings);
				if (uriAccounts) return { accounts: uriAccounts, source: "otpauth-uris", warnings };
			}
		}

		// Check for string blob of URIs
		for (const key of ["otpauth", "data", "content"]) {
			if (typeof obj[key] === "string" && /^otpauth:\/\//i.test((obj[key] as string).trim())) {
				const batch = parseOtpauthBatch(obj[key] as string);
				if (batch.parsed.length > 0) return { accounts: createAccountsFromParsed(batch.parsed), source: "otpauth-uris", warnings };
			}
		}

		// Generic object with accounts key
		if (Array.isArray(obj.accounts)) {
			const accounts = (obj.accounts as unknown[]).filter(isValidAccount) as Account[];
			if (accounts.length > 0) return { accounts, source: "generic-array", warnings };
		}

		// Aegis format
		const aegis = tryParseAegis(parsed);
		if (aegis) return { accounts: aegis, source: "aegis", warnings };
	}

	// 4. Fallback: try Aegis even for array-like
	const aegisFallback = tryParseAegis(parsed);
	if (aegisFallback) return { accounts: aegisFallback, source: "aegis", warnings };

	throw new Error("Unrecognized vault format");
}

// Aliases for import tests
export const parseImportedJson = parseJsonImport;
export const parseExportedVaultJson = parseJsonImport;

// ─── Migration workflow ────────────────────────────────────────────────────

export type ImportStrategy = "merge" | "replace" | "skip-duplicates";

export interface MigrationPlan {
	toImport: Account[];
	duplicates: Account[];
	uniques: Account[];
	strategy: ImportStrategy;
	total: number;
	existingCount: number;
	wouldReplace: boolean;
}

export function planMigration(
	existing: Account[],
	imported: Account[],
	strategy: ImportStrategy = "merge",
): MigrationPlan {
	const { duplicates, uniques } = detectDuplicates(existing, imported);
	return {
		toImport: strategy === "replace" ? imported : uniques,
		duplicates,
		uniques,
		strategy,
		total: imported.length,
		existingCount: existing.length,
		wouldReplace: strategy === "replace",
	};
}

export function applyMigration(
	existing: Account[],
	imported: Account[],
	strategy: ImportStrategy = "merge",
): Account[] {
	if (strategy === "replace") {
		// Ensure imported IDs are unique so deleting one cannot remove both
		const used = new Set<string>();
		return imported.map((a) => {
			if (a.id && !used.has(a.id)) {
				used.add(a.id);
				return a;
			}
			let nextId: string;
			do {
				nextId = createId();
			} while (used.has(nextId));
			used.add(nextId);
			return { ...a, id: nextId };
		});
	}
	// merge / skip-duplicates: keep existing, append uniques with fresh IDs if needed
	const { uniques } = detectDuplicates(existing, imported);
	// Track IDs used by existing and already-normalized incoming accounts
	const usedIds = new Set(existing.map((e) => e.id));
	const normalizedUniques = uniques.map((a) => {
		if (a.id && !usedIds.has(a.id)) {
			usedIds.add(a.id);
			return a;
		}
		let nextId: string;
		do {
			nextId = createId();
		} while (usedIds.has(nextId));
		usedIds.add(nextId);
		return { ...a, id: nextId };
	});
	return [...existing, ...normalizedUniques];
}

// Convenience for wizard: prepare import from raw json string + existing vault
export function prepareImport(
	existing: Account[],
	json: string,
	strategy: ImportStrategy = "merge",
): { accounts: Account[]; plan: MigrationPlan; source: JsonImportResult["source"] } {
	const { accounts: imported, source } = parseJsonImport(json);
	const plan = planMigration(existing, imported, strategy);
	const accounts = applyMigration(existing, imported, strategy);
	return { accounts, plan, source };
}

export function prepareOtpauthImport(
	existing: Account[],
	otpauthInput: string,
	strategy: ImportStrategy = "merge",
): { accounts: Account[]; plan: MigrationPlan; parsed: ParsedOtpauth[]; errors: OtpauthBatchResult["errors"] } {
	const { parsed, errors } = parseOtpauthBatch(otpauthInput);
	const imported = createAccountsFromParsed(parsed);
	const plan = planMigration(existing, imported, strategy);
	const accounts = applyMigration(existing, imported, strategy);
	return { accounts, plan, parsed, errors };
}

// ─── Import wizard helpers ─────────────────────────────────────────────────

export interface ImportPreview {
	total: number;
	valid: number;
	invalid: number;
	duplicates: number;
	uniques: number;
	duplicateAccounts: Account[];
	uniqueAccounts: Account[];
	errors: OtpauthBatchResult["errors"];
	source: JsonImportResult["source"] | "otpauth";
}

export function buildImportPreview(
	existing: Account[],
	candidates: Account[],
	errors: OtpauthBatchResult["errors"] = [],
	source: ImportPreview["source"] = "otpauth",
): ImportPreview {
	const { duplicates, uniques } = detectDuplicates(existing, candidates);
	return {
		total: candidates.length + errors.length,
		valid: candidates.length,
		invalid: errors.length,
		duplicates: duplicates.length,
		uniques: uniques.length,
		duplicateAccounts: duplicates,
		uniqueAccounts: uniques,
		errors,
		source,
	};
}

export function buildJsonImportPreview(existing: Account[], json: string): ImportPreview {
	try {
		const { accounts, source, warnings } = parseJsonImport(json);
		const errors = warnings.map((w) => ({ raw: w.slice(0, 200), reason: w }));
		return buildImportPreview(existing, accounts, errors, source);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		return {
			total: 1,
			valid: 0,
			invalid: 1,
			duplicates: 0,
			uniques: 0,
			duplicateAccounts: [],
			uniqueAccounts: [],
			errors: [{ raw: json.slice(0, 200), reason: msg }],
			source: "unknown",
		};
	}
}

export function buildOtpauthImportPreview(existing: Account[], input: string): ImportPreview {
	const { parsed, errors } = parseOtpauthBatch(input);
	const accounts = createAccountsFromParsed(parsed);
	return buildImportPreview(existing, accounts, errors, "otpauth");
}
