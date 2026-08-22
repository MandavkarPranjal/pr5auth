# PR5Auth

PR5Auth is an offline-first desktop TOTP authenticator. Account secrets are kept in the local encrypted vault; QR images and `otpauth://` imports are decoded locally.

## Development

```sh
bun install
bun run start
```

Run the checks with `bun test` and `bunx tsc --noEmit`.

## Keyboard shortcuts

- `Ctrl/Cmd + K` focuses account search
- `N` opens Add account
- `1` Dashboard, `2` Import, `3` Settings, `4` About
- `Escape` closes the Add account dialog

## Release notes

v1 includes encrypted settings persistence, loading/empty/error states, accessible keyboard interactions, debounced issuer/account search, copy feedback, QR/URI import, backup restore, system tray support, and a local About screen.
