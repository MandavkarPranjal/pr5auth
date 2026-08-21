import { describe, expect, it } from "bun:test"
import {
	deserializeVault,
	serializeVault,
} from "../../mainview/services/accountService"
import type { Account } from "../../mainview/types/account"

const account: Account = {
	id: "acc-1",
	issuer: "Example",
	accountName: "user@example.com",
	secret: "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
	algorithm: "sha1",
	digits: 6,
	period: 30,
	createdAt: Date.now(),
}

describe("vault serialization", () => {
	it("round-trips a populated vault", () => {
		const json = serializeVault([account])
		expect(deserializeVault(json)).toEqual([account])
	})

	it("preserves an empty vault as an empty array", () => {
		const json = serializeVault([])
		expect(deserializeVault(json)).toEqual([])
	})

	it("returns null for corrupt or invalid vaults", () => {
		expect(deserializeVault("not-json")).toBeNull()
		expect(deserializeVault(JSON.stringify({ version: 99, accounts: [] }))).toBeNull()
		expect(deserializeVault(JSON.stringify({ version: 1, accounts: "nope" }))).toBeNull()
	})
})
