# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Developers and power users who hold many TOTP accounts across many services and prefer managing them from their desktop instead of a phone app. They work keyboard-first, value speed of retrieval and searchability, and care about where their secrets live.

## Product Purpose

PR5Auth is an offline-first desktop TOTP authenticator. It stores account secrets in a locally encrypted vault protected by a master password, generates time-based one-time codes, and makes copying a code take seconds. Success is trustworthy, instant code retrieval with no network dependency and no third party involved.

## Positioning

Truly offline / zero-cloud: no cloud sync, no accounts, no telemetry — the vault never leaves the machine. This refusal is the product claim; neighboring authenticators that treat cloud sync as a feature cannot truthfully copy it.

## Operating Context

- First run: user creates a master password (minimum 8 characters) before the vault is usable.
- Daily login flows: user opens PR5Auth (often from system tray), searches or clicks an account, copies the current TOTP code into a site's 2FA prompt before it rotates.
- Desktop operating systems: Linux, macOS, Windows (Electrobun packaging via GitHub Actions releases).
- Tray-resident usage: minimize-to-tray and close-to-tray options; tray tooltip shows account count; tray menu can lock the vault.
- Migration into the app happens from other authenticators via QR images, `otpauth://` URIs, and JSON backups — all decoded/imported locally.
- Backup ritual: encrypted backup export/restore from Settings (AES-256-GCM envelope, separate export password).

## Capabilities and Constraints

Capabilities:

- Encrypted vault with master password creation/unlock/lock; change master password; lock now from Settings or tray; auto-lock after 5 minutes of inactivity (toggleable). Master password minimum is 8 characters.
- Vault storage: OS keychain when available, otherwise Argon2id-encrypted file.
- TOTP code display with countdown ring, click-to-copy with toast feedback, debounced issuer/account search (`Ctrl/Cmd+K`).
- Add account manually, by QR image, or by `otpauth://` URI — parsed locally only. Manual add requires a Base32 secret of at least 16 characters. TOTP parameters (SHA1/SHA256/SHA512, 6–8 digits, period) are preserved from URI/JSON import; manual add defaults to SHA1, 6 digits, 30 seconds.
- Import page with merge/skip-duplicates/replace strategies; JSON export/import and legacy vault restore in Settings.
- Encrypted backup export/restore (AES-256-GCM) with a separate password; plain JSON vault import remains a fallback.
- Keyboard shortcuts: `N` add, `1–4` navigate Dashboard/Import/Settings/About, `Escape` closes dialog.
- Loading skeletons, empty states, error boundary, storage-error banner with vault reset.

Constraints:

- Offline-only operation; secrets must never leave the device. Cloud sync is explicitly out of scope.
- Unknown or failed vault-state RPC must fail closed (locked), never fail open.
- Runs outside Electrobun (vite preview) without vault locking; UI must tolerate absent desktop RPC.

Terminology: vault, master password, issuer, account name, TOTP, `otpauth://`.

## Brand Commitments

- Name: **PR5Auth** (wordmark styled as PR5 + accented "Auth").
- License stays open source (user-confirmed binding commitment).
- Voice: private, local-first, understated — e.g. "A private, local-first home for your authenticator codes."

## Evidence on Hand

- App icon: `assets/app-icon.svg`; tray icon: `assets/tray-icon.png`.
- README release notes enumerate shipped v1 features (encrypted persistence, import/restore, tray, accessibility).
- No testimonials, benchmarks, press, or marketing proof exist; future work must not fabricate any.

## Product Principles

1. Secrets never leave the machine — every feature must remain fully functional offline and justifiable against the zero-cloud claim.
2. Speed of retrieval is the job: launch to copied code in seconds, keyboard-first throughout.
3. Fail closed: when vault state is uncertain, protect the secrets.
4. Trust through transparency: open source and locally inspectable; no telemetry.
5. Desktop-native ergonomics: shortcuts, tray residency, and instant copy are first-class, not conveniences.

## Accessibility & Inclusion

- Full keyboard operability is a shipped requirement (shortcuts, focus-visible outlines, Escape handling).
- Respect `prefers-reduced-motion` globally.
