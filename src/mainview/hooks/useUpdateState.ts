import { useEffect, useState } from "react"
import { updateService } from "../services/updateService"
import type { UpdateStatePayload } from "../../shared/rpcSchema"

export function useUpdateState(): UpdateStatePayload {
	const [state, setState] = useState<UpdateStatePayload>(() => updateService.getState())
	useEffect(() => {
		const unsub = updateService.subscribe(setState)
		void updateService.refreshState().catch(() => {})
		return unsub
	}, [])
	return state
}

export function useLiveVersion(): string {
	const state = useUpdateState()
	return state.currentVersion || ""
}
