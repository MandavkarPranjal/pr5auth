# Windows self-signed signing

The Windows release job uses one password-protected PKCS#12/PFX bundle stored in GitHub Actions secrets. The certificate is imported into the Windows runner only for the duration of the build, used by `signtool.exe`, verified, and removed in cleanup. No certificate or private key belongs in this repository.

## Generate the certificate on Omarchy

From the repository root:

```bash
chmod +x scripts/generate-windows-certificate.sh
./scripts/generate-windows-certificate.sh
```

The script creates `.windows-signing/Pr5Auth.key`, `.windows-signing/Pr5Auth.crt`, and `.windows-signing/Pr5Auth.pfx`. It prompts for the PFX password and never stores that password in the repository.

To use a different publisher/subject name:

```bash
PR5AUTH_PUBLISHER="Pr5Auth Inc" ./scripts/generate-windows-certificate.sh
```

The certificate is valid for 10 years. For a self-signed certificate, Windows will still display an untrusted-publisher warning unless the certificate is installed as trusted on the target machine. Timestamping preserves the signature validity after the certificate expires.

## Create the GitHub secrets

Base64-encode the PFX without line wrapping:

```bash
base64 -w 0 .windows-signing/Pr5Auth.pfx > .windows-signing/Pr5Auth.pfx.base64
```

Using the GitHub CLI, from the repository root:

```bash
gh secret set WINDOWS_CERTIFICATE < .windows-signing/Pr5Auth.pfx.base64
gh secret set WINDOWS_CERTIFICATE_PASSWORD
```

The second command prompts for the PFX password. Alternatively, go to the repository’s **Settings → Secrets and variables → Actions → New repository secret** and create:

- `WINDOWS_CERTIFICATE`: contents of `.windows-signing/Pr5Auth.pfx.base64`
- `WINDOWS_CERTIFICATE_PASSWORD`: the password entered when the PFX was generated

The generated files are covered by `.gitignore`. Do not paste the private key, PFX, or password into an issue, commit, workflow file, or log.

## Verify locally with OpenSSL

Inspect the certificate and confirm the code-signing extension:

```bash
openssl x509 -in .windows-signing/Pr5Auth.crt -noout -subject -issuer -dates -fingerprint -sha256
openssl x509 -in .windows-signing/Pr5Auth.crt -text -noout | rg -A2 "Extended Key Usage"
```

Inspect the PFX contents. OpenSSL will prompt for the PFX password:

```bash
openssl pkcs12 -info -in .windows-signing/Pr5Auth.pfx -noout
```

The subject and issuer should both identify the configured publisher, and Extended Key Usage should include `Code Signing`.

## Release flow

Pushing a semantic-version tag such as `v1.0.0` starts `.github/workflows/release.yml`. On `windows-latest`, the job decodes the certificate, imports it into the runner’s CurrentUser stores, runs the existing `bun run build:release` command, locates the ZIP produced by Electrobun, signs every executable inside it with SHA-256 and a timestamp, verifies each signature, then repacks the ZIP before publishing it to the GitHub Release.

## Rotate the certificate

To rotate it later, generate a new PFX in a new directory or after securely archiving/removing the old files:

```bash
PR5AUTH_PUBLISHER="Pr5Auth" ./scripts/generate-windows-certificate.sh .windows-signing-next
base64 -w 0 .windows-signing-next/Pr5Auth.pfx > .windows-signing-next/Pr5Auth.pfx.base64
gh secret set WINDOWS_CERTIFICATE < .windows-signing-next/Pr5Auth.pfx.base64
gh secret set WINDOWS_CERTIFICATE_PASSWORD
```

The next release will use the replacement certificate. Existing releases remain signed by the old certificate, so keep the old PFX securely if you need to reproduce or verify them.
