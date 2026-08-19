export type StorageKind = "os-keychain" | "file-encrypted" | "unknown"

export interface StorageStatus {
	platform: string
	kind: StorageKind
	available: boolean
	detail?: string
}

export type StorageErrorCode =
	| "unavailable"
	| "corrupt"
	| "unrecoverable"
	| "io"
	| "denied"

export class StorageError extends Error {
	readonly code: StorageErrorCode

	constructor(message: string, code: StorageErrorCode) {
		super(message)
		this.name = "StorageError"
		this.code = code
	}
}

export const VAULT_KEY = "pr5auth.vault.v1"
export const SETTINGS_KEY = "pr5auth.settings.v1"

export interface StorageProvider {
	getItem(key: string): Promise<string | null>
	setItem(key: string, value: string): Promise<void>
	removeItem(key: string): Promise<void>
	reset(): Promise<void>
}

export interface StorageStatusProvider {
	getStatus(): Promise<StorageStatus>
}

export function isStorageStatusProvider(
	value: unknown,
): value is StorageProvider & StorageStatusProvider {
	return (
		typeof value === "object" &&
		value !== null &&
		"getStatus" in value &&
		typeof (value as StorageStatusProvider).getStatus === "function"
	)
}