export type HashAlgorithm = "sha1" | "sha256" | "sha512";

export type Digits = 6 | 7 | 8;

export interface Account {
	id: string;
	issuer: string;
	accountName: string;
	secret: string;
	algorithm: HashAlgorithm;
	digits: Digits;
	period: number;
	createdAt: number;
}

export interface AddAccountInput {
	issuer: string;
	accountName: string;
	secret: string;
	algorithm?: HashAlgorithm;
	digits?: Digits;
	period?: number;
}

export interface AppSettings {
	autoLock: boolean;
	minimizeToTray: boolean;
	closeToTray: boolean;
}

export type Page = "dashboard" | "import" | "settings" | "about";

export type ImportStrategy = "merge" | "replace" | "skip-duplicates";
