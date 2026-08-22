#!/usr/bin/env bash
set -euo pipefail

# Generate a long-lived self-signed Windows code-signing certificate.
# The output directory is intentionally ignored by git.
publisher="${PR5AUTH_PUBLISHER:-MandavkarPranjal}"
output_dir="${1:-.windows-signing}"

if ! command -v openssl >/dev/null 2>&1; then
	echo "Error: openssl is required. Install it with: sudo pacman -S openssl" >&2
	exit 1
fi

mkdir -p "$output_dir"
umask 077

key_path="$output_dir/${publisher}.key"
cert_path="$output_dir/${publisher}.crt"
pfx_path="$output_dir/${publisher}.pfx"

if [[ -e "$key_path" || -e "$cert_path" || -e "$pfx_path" ]]; then
	echo "Refusing to overwrite existing signing files in: $output_dir" >&2
	exit 1
fi

read -r -s -p "PFX password: " pfx_password
echo
read -r -s -p "Confirm PFX password: " pfx_password_confirm
echo
if [[ -z "$pfx_password" || "$pfx_password" != "$pfx_password_confirm" ]]; then
	echo "Error: passwords are empty or do not match." >&2
	exit 1
fi

echo "Generating a 4096-bit RSA private key..."
openssl genrsa -out "$key_path" 4096 >/dev/null 2>&1

echo "Generating a SHA-256 self-signed code-signing certificate for: $publisher"
openssl req -new -x509 \
	-sha256 \
	-days 3650 \
	-key "$key_path" \
	-out "$cert_path" \
	-subj "/CN=$publisher" \
	-addext "basicConstraints=critical,CA:FALSE" \
	-addext "keyUsage=critical,digitalSignature" \
	-addext "extendedKeyUsage=codeSigning" \
	>/dev/null 2>&1

echo "Exporting password-protected PKCS#12/PFX..."
printf '%s' "$pfx_password" | openssl pkcs12 -export \
	-out "$pfx_path" \
	-inkey "$key_path" \
	-in "$cert_path" \
	-name "$publisher" \
	-passout stdin \
	>/dev/null 2>&1

chmod 600 "$key_path" "$pfx_path"
chmod 644 "$cert_path"

unset pfx_password pfx_password_confirm

echo
echo "Created signing files in: $output_dir"
echo "  Certificate: $cert_path"
echo "  PFX bundle:  $pfx_path"
echo
echo "Keep the .key and .pfx private. The next step is to Base64-encode the PFX for GitHub Actions."
