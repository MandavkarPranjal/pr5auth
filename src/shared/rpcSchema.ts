import type { StorageStatus } from "./storageProvider"

export interface VaultStatus {
	hasPassword: boolean
	isLocked: boolean
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
		}
		messages: {}
	}
	webview: {
		requests: {}
		messages: {
			"tray:lock": { params: undefined }
		}
	}
}
