#!/usr/bin/env bash
# Build, install and launch JediNotebook for the current Linux user.
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# getent is glibc-only; hosts without it (macOS, BSD) fall back to $HOME.
user_home=$(getent passwd "$(id -u)" 2>/dev/null | cut -d: -f6 || true)
user_home=${user_home:-$HOME}
user_local="$user_home/.local"
binary_source="$script_dir/client/src-tauri/target/release/jedinotebook"
desktop_source="$script_dir/client/src-tauri/target/release/bundle/deb/JediNotebook_0.3.0_amd64/data/usr/share/applications/JediNotebook.desktop"

# Prefer Rustup over an older distribution Cargo, which cannot read modern lockfiles.
export PATH="$user_home/.cargo/bin:$PATH"

for required_command in npm npx cargo rustc; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    echo "ERROR: $required_command is required. See docs/linux-build-and-install.md." >&2
    exit 1
  fi
done

echo "==> Using $(cargo --version)"
echo "==> Installing locked frontend dependencies..."
cd "$script_dir/client"
npm ci

echo "==> Running tests..."
npm test

echo "==> Building Linux Tauri bundle..."
npx tauri build

if [ ! -x "$binary_source" ] || [ ! -f "$desktop_source" ]; then
  echo "ERROR: The Linux binary or desktop launcher was not produced." >&2
  exit 1
fi

echo "==> Closing the previous JediNotebook process..."
pkill -x jedinotebook 2>/dev/null || true

echo "==> Installing for the current user in $user_local..."
install -Dm755 "$binary_source" "$user_local/bin/jedinotebook"
install -Dm644 "$desktop_source" "$user_local/share/applications/JediNotebook.desktop"
update-desktop-database "$user_local/share/applications" 2>/dev/null || true

if [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then
  echo "==> Launching JediNotebook..."
  nohup "$user_local/bin/jedinotebook" >/tmp/jedinotebook-launch.log 2>&1 &
else
  echo "Built and installed. Start JediNotebook from your desktop session."
fi

echo "Done."
