import { createHash, randomBytes } from "node:crypto"
import { spawn } from "node:child_process"
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import { homedir, platform } from "node:os"
import path from "node:path"

export interface KeyStorage {
	readonly kind: "os-keychain" | "file-encrypted"
	readonly detail: string
	findKey(): Promise<Uint8Array | null>
	getKey(): Promise<Uint8Array>
}

const SERVICE = "pr5auth.electrobun.dev"
const ACCOUNT = "vault-key"
const WINDOWS_TARGET = "PR5Auth/vault-key"
const KEY_SIZE = 32
const COMMAND_TIMEOUT_MS = 20_000
const DPAPI_EXIT_KEY_MISSING = 3

export class StorageBackendUnavailableError extends Error {
	constructor(message: string) {
		super(message)
		this.name = "StorageBackendUnavailableError"
	}
}

interface CommandResult {
	code: number | null
	stdout: string
	stderr: string
}

function run(
	cmd: string,
	args: string[],
	input?: string,
): Promise<CommandResult> {
	return new Promise((resolve, reject) => {
		const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] })
		let stdout = ""
		let stderr = ""
		let settled = false

		const timer = setTimeout(() => {
			if (settled) return
			settled = true
			child.kill("SIGKILL")
			reject(
				new StorageBackendUnavailableError(
					`${cmd} timed out after ${COMMAND_TIMEOUT_MS}ms`,
				),
			)
		}, COMMAND_TIMEOUT_MS)

		child.stdout.on("data", (chunk: Buffer) => {
			stdout += chunk.toString()
		})
		child.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString()
		})
		child.on("error", (err) => {
			if (settled) return
			settled = true
			clearTimeout(timer)
			reject(err)
		})
		child.on("close", (code) => {
			if (settled) return
			settled = true
			clearTimeout(timer)
			resolve({ code, stdout, stderr })
		})

		if (input !== undefined) {
			child.stdin.write(input)
		}
		child.stdin.end()
	})
}

function decodeKeyHex(hex: string): Uint8Array | null {
	const trimmed = hex.trim()
	const decoded = Buffer.from(trimmed, "hex")
	if (decoded.length !== KEY_SIZE) return null
	return new Uint8Array(decoded)
}

function decodeKeyBase64(base64: string): Uint8Array | null {
	const trimmed = base64.trim()
	let decoded: Buffer
	try {
		decoded = Buffer.from(trimmed, "base64")
	} catch {
		return null
	}
	if (decoded.length !== KEY_SIZE) return null
	return new Uint8Array(decoded)
}

class MacKeyStorage implements KeyStorage {
	readonly kind = "os-keychain" as const
	readonly detail = "macOS Keychain (security CLI)"

	async findKey(): Promise<Uint8Array | null> {
		const find = await run("security", [
			"find-generic-password",
			"-s",
			SERVICE,
			"-a",
			ACCOUNT,
			"-w",
		])
		if (find.code !== 0) return null
		const existing = decodeKeyHex(find.stdout)
		if (!existing) {
			throw new StorageBackendUnavailableError(
				"macOS Keychain entry is malformed",
			)
		}
		return existing
	}

	async getKey(): Promise<Uint8Array> {
		const existing = await this.findKey()
		if (existing) return existing

		const key = randomBytes(KEY_SIZE)
		const add = await run(
			"security",
			[
				"add-generic-password",
				"-s",
				SERVICE,
				"-a",
				ACCOUNT,
				"-w",
				key.toString("hex"),
				"-U",
			],
			undefined,
		)
		if (add.code !== 0) {
			throw new StorageBackendUnavailableError(
				`macOS Keychain write failed: ${add.stderr.trim()}`,
			)
		}
		return new Uint8Array(key)
	}
}

const DPAPI_PS1 = `param(
    [Parameter(Mandatory=$true)][string]$Action,
    [Parameter(Mandatory=$true)][string]$Path
)

Add-Type -AssemblyName System.Security

if ($Action -eq 'read') {
    if (-not (Test-Path -LiteralPath $Path)) { exit ${DPAPI_EXIT_KEY_MISSING} }
    try {
        $blob = [IO.File]::ReadAllBytes($Path)
        $clear = [System.Security.Cryptography.ProtectedData]::Unprotect(
            $blob, $null,
            [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
    } catch {
        exit 1
    }
    if ($clear.Length -ne ${KEY_SIZE}) { exit 1 }
    [Console]::Out.Write([Convert]::ToBase64String($clear))
    exit 0
} elseif ($Action -eq 'write') {
    $value = [Console]::In.ReadToEnd()
    $clear = [Convert]::FromBase64String($value.Trim())
    $blob = [System.Security.Cryptography.ProtectedData]::Protect(
        $clear, $null,
        [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
    [IO.File]::WriteAllBytes($Path, $blob)
    exit 0
}
exit 2
`

class DpapiKeyStorage implements KeyStorage {
	readonly kind = "file-encrypted" as const
	readonly detail: string

	private dataDir: string
	private scriptPath: string
	private keyPath: string

	constructor(dataDir: string) {
		this.dataDir = dataDir
		this.scriptPath = path.join(dataDir, "dpapi.ps1")
		this.keyPath = path.join(dataDir, "vault.key")
		this.detail = `DPAPI-protected key file (${this.keyPath})`
	}

	private async ensureScript(): Promise<string> {
		await mkdir(this.dataDir, { recursive: true })
		await writeFile(this.scriptPath, DPAPI_PS1, { mode: 0o600 })
		return this.scriptPath
	}

	async findKey(): Promise<Uint8Array | null> {
		const script = await this.ensureScript()

		const read = await run("powershell.exe", [
			"-NoProfile",
			"-NonInteractive",
			"-ExecutionPolicy",
			"Bypass",
			"-File",
			script,
			"-Action",
			"read",
			"-Path",
			this.keyPath,
		])
		if (read.code === DPAPI_EXIT_KEY_MISSING) return null
		if (read.code !== 0) {
			throw new StorageBackendUnavailableError(
				`DPAPI key file could not be read (exit code ${read.code}): ${read.stderr.trim()}`,
			)
		}
		const existing = decodeKeyBase64(read.stdout)
		if (!existing) {
			throw new StorageBackendUnavailableError(
				"DPAPI key file returned malformed data",
			)
		}
		return existing
	}

	async getKey(): Promise<Uint8Array> {
		const existing = await this.findKey()
		if (existing) return existing

		const script = await this.ensureScript()
		const key = randomBytes(KEY_SIZE)
		const write = await run(
			"powershell.exe",
			[
				"-NoProfile",
				"-NonInteractive",
				"-ExecutionPolicy",
				"Bypass",
				"-File",
				script,
				"-Action",
				"write",
				"-Path",
				this.keyPath,
			],
			key.toString("base64"),
		)
		if (write.code !== 0) {
			throw new StorageBackendUnavailableError(
				`DPAPI key protection failed: ${write.stderr.trim()}`,
			)
		}
		return new Uint8Array(key)
	}
}

const CREDMAN_PS1 = `param(
    [Parameter(Mandatory=$true)][string]$Action,
    [string]$Target = '${WINDOWS_TARGET}'
)

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class CredMan
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct CREDENTIAL
    {
        public uint Flags;
        public int Type;
        public IntPtr TargetName;
        public IntPtr Comment;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
        public uint CredentialBlobSize;
        public IntPtr CredentialBlob;
        public uint Persist;
        public uint AttributeCount;
        public IntPtr Attributes;
        public IntPtr TargetAlias;
        public IntPtr UserName;
    }

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool CredWrite(ref CREDENTIAL credential, uint flags);

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool CredRead(string target, int type, uint flags, out IntPtr credential);

    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern bool CredFree(IntPtr buffer);

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool CredDelete(string target, int type, uint flags);

    public static bool Write(string target, string value)
    {
        byte[] bytes = System.Text.Encoding.Unicode.GetBytes(value);
        CREDENTIAL cred = new CREDENTIAL();
        cred.Type = 1;
        cred.TargetName = Marshal.StringToCoTaskMemUni(target);
        cred.CredentialBlobSize = (uint)bytes.Length;
        cred.CredentialBlob = Marshal.AllocCoTaskMem(bytes.Length);
        Marshal.Copy(bytes, 0, cred.CredentialBlob, bytes.Length);
        cred.Persist = 2;
        cred.UserName = Marshal.StringToCoTaskMemUni("PR5Auth");
        bool ok = CredWrite(ref cred, 0);
        Marshal.FreeCoTaskMem(cred.TargetName);
        Marshal.FreeCoTaskMem(cred.CredentialBlob);
        Marshal.FreeCoTaskMem(cred.UserName);
        return ok;
    }

    public static string Read(string target)
    {
        IntPtr p;
        if (!CredRead(target, 1, 0, out p)) return null;
        try
        {
            CREDENTIAL cred = (CREDENTIAL)Marshal.PtrToStructure(p, typeof(CREDENTIAL));
            byte[] bytes = new byte[cred.CredentialBlobSize];
            Marshal.Copy(cred.CredentialBlob, bytes, 0, (int)cred.CredentialBlobSize);
            return System.Text.Encoding.Unicode.GetString(bytes);
        }
        finally
        {
            CredFree(p);
        }
    }

    public static bool Delete(string target)
    {
        return CredDelete(target, 1, 0);
    }
}
"@

if ($Action -eq 'write') {
    $value = [Console]::In.ReadToEnd()
    if ([CredMan]::Write($Target, $value.Trim())) { exit 0 }
    exit 1
} elseif ($Action -eq 'read') {
    $value = [CredMan]::Read($Target)
    if ($null -eq $value) { exit 1 }
    [Console]::Out.Write($value)
    exit 0
} elseif ($Action -eq 'delete') {
    [CredMan]::Delete($Target) | Out-Null
    exit 0
}
exit 2
`

class WindowsKeyStorage implements KeyStorage {
	readonly kind = "os-keychain" as const
	readonly detail = "Windows Credential Manager (PowerShell)"

	private scriptPath: string

	constructor(dataDir: string) {
		this.scriptPath = path.join(dataDir, "credman.ps1")
	}

	private async ensureScript(): Promise<string> {
		await mkdir(path.dirname(this.scriptPath), { recursive: true })
		await writeFile(this.scriptPath, CREDMAN_PS1, { mode: 0o600 })
		return this.scriptPath
	}

	async findKey(): Promise<Uint8Array | null> {
		const script = await this.ensureScript()
		const read = await run("powershell.exe", [
			"-NoProfile",
			"-NonInteractive",
			"-ExecutionPolicy",
			"Bypass",
			"-File",
			script,
			"-Action",
			"read",
			"-Target",
			WINDOWS_TARGET,
		])
		if (read.code !== 0) return null
		const existing = decodeKeyHex(read.stdout)
		if (!existing) {
			throw new StorageBackendUnavailableError(
				"Windows Credential Manager entry is malformed",
			)
		}
		return existing
	}

	async getKey(): Promise<Uint8Array> {
		const existing = await this.findKey()
		if (existing) return existing

		const script = await this.ensureScript()
		const key = randomBytes(KEY_SIZE)
		const write = await run(
			"powershell.exe",
			[
				"-NoProfile",
				"-NonInteractive",
				"-ExecutionPolicy",
				"Bypass",
				"-File",
				script,
				"-Action",
				"write",
				"-Target",
				WINDOWS_TARGET,
			],
			key.toString("hex"),
		)
		if (write.code !== 0) {
			throw new StorageBackendUnavailableError(
				`Windows Credential Manager write failed: ${write.stderr.trim()}`,
			)
		}
		return new Uint8Array(key)
	}
}

class LinuxKeyStorage implements KeyStorage {
	readonly kind = "os-keychain" as const
	readonly detail = "Secret Service (secret-tool)"

	async findKey(): Promise<Uint8Array | null> {
		const lookup = await run("secret-tool", [
			"lookup",
			"service",
			SERVICE,
			"account",
			ACCOUNT,
		])
		if (this.serviceUnavailable(lookup)) {
			throw new StorageBackendUnavailableError(
				"Secret Service is not available on this system",
			)
		}
		if (lookup.code !== 0) return null
		const existing = decodeKeyHex(lookup.stdout)
		if (!existing) {
			throw new StorageBackendUnavailableError(
				"Secret Service entry is malformed",
			)
		}
		return existing
	}

	async getKey(): Promise<Uint8Array> {
		const existing = await this.findKey()
		if (existing) return existing

		const key = randomBytes(KEY_SIZE)
		const store = await run(
			"secret-tool",
			[
				"store",
				"--label=PR5Auth vault key",
				"service",
				SERVICE,
				"account",
				ACCOUNT,
			],
			key.toString("hex"),
		)
		if (store.code !== 0) {
			throw new StorageBackendUnavailableError(
				`secret-tool store failed: ${store.stderr.trim()}`,
			)
		}
		return new Uint8Array(key)
	}

	private serviceUnavailable(result: CommandResult): boolean {
		const combined = `${result.stdout}\n${result.stderr}`
		return /org\.freedesktop\.(secrets|DBus)|not provided|couldn.t connect|cannot autolaunch|no secret service/i.test(
			combined,
		)
	}
}

class MachineIdKeyStorage implements KeyStorage {
	readonly kind = "file-encrypted" as const
	readonly detail = "Key derived from machine-id (Linux fallback)"

	async findKey(): Promise<Uint8Array | null> {
		return null
	}

	async getKey(): Promise<Uint8Array> {
		const machineId = await this.readMachineId()
		return new Uint8Array(
			createHash("sha256").update(`${machineId}:${SERVICE}`).digest(),
		)
	}

	private async readMachineId(): Promise<string> {
		for (const candidate of ["/etc/machine-id", "/var/lib/dbus/machine-id"]) {
			try {
				const id = (await readFile(candidate, "utf8")).trim()
				if (id) return id
			} catch {
				// try next candidate
			}
		}
		return homedir()
	}
}

async function hasVaultData(dataDir: string): Promise<boolean> {
	try {
		const entries = await readdir(dataDir)
		return entries.some((entry) => entry.endsWith(".enc"))
	} catch {
		return false
	}
}

export async function createKeyStorage(dataDir: string): Promise<KeyStorage> {
	const current = platform()

	let candidates: KeyStorage[]
	if (current === "darwin") {
		candidates = [new MacKeyStorage()]
	} else if (current === "win32") {
		candidates = [new WindowsKeyStorage(dataDir), new DpapiKeyStorage(dataDir)]
	} else {
		candidates = [
			new LinuxKeyStorage(),
			new MachineIdKeyStorage(),
		]
	}

	let lastError: unknown = null
	for (const candidate of candidates) {
		try {
			const existing = await candidate.findKey()
			if (existing) {
				console.log(
					`[keychain] Using ${candidate.kind} (${candidate.detail})`,
				)
				return candidate
			}
		} catch (err) {
			lastError = err
			console.warn(
				`[keychain] ${candidate.detail} unavailable: ${(err as Error).message}`,
			)
		}
	}

	if (await hasVaultData(dataDir)) {
		throw new StorageBackendUnavailableError(
			"Existing vault data found but no key storage backend could provide its key; refusing to create a new key",
		)
	}

	for (const candidate of candidates) {
		try {
			await candidate.getKey()
			console.log(
				`[keychain] Using ${candidate.kind} (${candidate.detail})`,
			)
			return candidate
		} catch (err) {
			lastError = err
			console.warn(
				`[keychain] ${candidate.detail} unavailable: ${(err as Error).message}`,
			)
		}
	}

	throw new StorageBackendUnavailableError(
		`No key storage backend available: ${
			lastError instanceof Error ? lastError.message : String(lastError)
		}`,
	)
}