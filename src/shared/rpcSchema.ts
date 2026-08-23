import type { StorageStatus } from "./storageProvider"

export interface VaultStatus {
	hasPassword: boolean
	isLocked: boolean
}

export type UpdateStatus =
	| "idle"
	| "checking"
	| "no-update"
	| "update-available"
	| "downloading"
	| "installing"
	| "failed"

export interface UpdateStatePayload {
	status: UpdateStatus
	currentVersion: string
	newVersion: string | null
	releaseNotes: string | null
	error: string | null
	progress: number | null
	checkedAt: number | null
	channel: string | null
	updateReady: boolean
}

export interface UpdateCheckResult extends UpdateStatePayload {
	updateAvailable: boolean
}

export interface UpdateProgressEvent {
	status: import("electrobun/bun").UpdateStatusType | UpdateStatus
	message: string
	progress?: number
	bytesDownloaded?: number
	totalBytes?: number
	errorMessage?: string
}

export interface SecureStorageSchema {
	bun: {
		requests: {
			"storage:getItem": { params: { key: string }; response: string | null }
			"storage:setItem": {
				params: { key: string; value: string }
				response: void
			}
			"storage:removeItem": { params: { key: string }; response: void }
			"storage:status": { params: undefined; response: StorageStatus }
			"storage:reset": { params: undefined; response: void }
			"tray:updateCount": { params: { count: number }; response: void }
			"tray:updateSettings": {
				params: { minimizeToTray: boolean; closeToTray: boolean }
				response: void
			}
			"vault:status": { params: undefined; response: VaultStatus }
			"vault:createPassword": { params: { password: string }; response: void }
			"vault:unlock": { params: { password: string }; response: void }
			"vault:lock": { params: undefined; response: void }
			"vault:changePassword": {
				params: { oldPassword: string; newPassword: string }
				response: void
			}
			"vault:reset": { params: undefined; response: void }
			"updater:check": {
				params: { force?: boolean }
				response: UpdateCheckResult
			}
			"updater:download": { params: undefined; response: UpdateCheckResult }
			"updater:apply": { params: undefined; response: void }
			"updater:getState": { params: undefined; response: UpdateStatePayload }
		}
		messages: {}
	}
	webview: {
		requests: {}
		messages: {
			"tray:lock": { params: undefined }
			"updater:progress": { params: UpdateProgressEvent }
		}
	}
}
