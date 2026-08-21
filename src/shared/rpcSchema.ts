import type { StorageStatus } from "./storageProvider"

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
		}
		messages: {}
	}
	webview: {
		requests: {}
		messages: {}
	}
}
