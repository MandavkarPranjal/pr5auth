import { useEffect, useState } from "react"
import { updateService } from "../services/updateService"
import type { UpdateStatePayload } from "../../shared/rpcSchema"

let sharedRefresh: Promise<UpdateStatePayload> | null = null
let lastRefreshAt = 0
const REFRESH_COOLDOWN_MS = 5000

export function useUpdateState(): UpdateStatePayload {
	const [state, setState] = useState<UpdateStatePayload>(() => updateService.getState())
	useEffect(() => {
		const unsub = updateService.subscribe(setState)
		const now = Date.now()
		const isCooldown = now - lastRefreshAt < REFRESH_COOLDOWN_MS
		if (!sharedRefresh && !isCooldown) {
			lastRefreshAt = now
			sharedRefresh = updateService
				.refreshState()
				.catch(() => updateService.getState())
				.finally(() => {
					// keep sharedRefresh for cooldown window to coalesce rapid mounts
					setTimeout(() => {
						sharedRefresh = null
					}, REFRESH_COOLDOWN_MS)
				})
		}
		if (sharedRefresh) void sharedRefresh.catch(() => {})
		return unsub
	}, [])
	return state
}

export function useLiveVersion(): string {
	const state = useUpdateState()
	return state.currentVersion || ""
}
