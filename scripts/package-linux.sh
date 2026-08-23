#!/usr/bin/env bash
set -euo pipefail

# Create convenient Linux distribution formats from Electrobun's Linux app
# bundle. The .tar.zst remains the updater artifact; the .tar and AppImage are
# standalone downloads for users.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACT_DIR="${ROOT_DIR}/artifacts"
ARCH="${ELECTROBUN_ARCH:-$(uname -m)}"
case "${ARCH}" in
  x64|x86_64) ARCH="x64"; APPIMAGE_ARCH="x86_64" ;;
  arm64|aarch64) ARCH="arm64"; APPIMAGE_ARCH="aarch64" ;;
  *) echo "Unsupported Linux architecture: ${ARCH}" >&2; exit 1 ;;
esac

ZST_FILES=("${ARTIFACT_DIR}/"*"-linux-${ARCH}-"*.tar.zst)
if [[ ${#ZST_FILES[@]} -ne 1 ]]; then
  echo "Expected exactly one Linux ${ARCH} .tar.zst artifact" >&2
  printf 'Found: %s\n' "${ZST_FILES[@]:-none}" >&2
  exit 1
fi

ZST_FILE="${ZST_FILES[0]}"
BASE_NAME="$(basename "${ZST_FILE}" .tar.zst)"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "${WORK_DIR}"' EXIT

mkdir -p "${WORK_DIR}/AppDir"
zstd -dc "${ZST_FILE}" | tar -xf - -C "${WORK_DIR}/AppDir" --strip-components=1

# AppImage expects AppRun and a desktop entry at the AppDir root. The launcher
# resolves its resources relative to bin/, so this preserves Electrobun's
# original bundle layout.
cat > "${WORK_DIR}/AppDir/AppRun" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
exec "${HERE}/bin/launcher" "$@"
EOF
chmod 755 "${WORK_DIR}/AppDir/AppRun"

cp "${ROOT_DIR}/assets/app-icon.png" "${WORK_DIR}/AppDir/appIcon.png"
cat > "${WORK_DIR}/AppDir/PR5Auth.desktop" <<'EOF'
[Desktop Entry]
Version=1.0
Type=Application
Name=PR5Auth
Comment=Offline-first desktop TOTP authenticator
Exec=PR5Auth
Icon=appIcon
Terminal=false
Categories=Utility;
EOF

TAR_FILE="${ARTIFACT_DIR}/${BASE_NAME}.tar"
tar -cf "${TAR_FILE}" -C "${WORK_DIR}/AppDir" .

APPIMAGE_TOOL="${APPIMAGETOOL:-${ROOT_DIR}/.cache/appimagetool-${APPIMAGE_ARCH}.AppImage}"
if [[ ! -x "${APPIMAGE_TOOL}" ]]; then
  echo "AppImage tool not found or not executable: ${APPIMAGE_TOOL}" >&2
  exit 1
fi

APPIMAGE_FILE="${ARTIFACT_DIR}/${BASE_NAME}.AppImage"
"${APPIMAGE_TOOL}" --appimage-extract-and-run "${WORK_DIR}/AppDir" "${APPIMAGE_FILE}"
chmod 755 "${APPIMAGE_FILE}"
echo "Created ${TAR_FILE}"
echo "Created ${APPIMAGE_FILE}"
