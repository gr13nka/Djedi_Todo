#!/usr/bin/env bash
# Builds the ARM64 debug APK, installs it on an authorized phone, and launches it.
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# getent is glibc-only; hosts without it (macOS, BSD) fall back to $HOME.
user_home=$(getent passwd "$(id -u)" 2>/dev/null | cut -d: -f6 || true)
user_home=${user_home:-$HOME}
android_sdk_root=${ANDROID_SDK_ROOT:-"$user_home/.local/opt/android-sdk"}
ndk_version=${ANDROID_NDK_VERSION:-27.2.12479018}
ndk_root=${NDK_HOME:-"$android_sdk_root/ndk/$ndk_version"}
adb_bin="$android_sdk_root/platform-tools/adb"
package_name='com.jedinotebook.app'
apk_file='src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk'

if [ ! -x "$adb_bin" ] || [ ! -d "$ndk_root" ]; then
  echo "ERROR: Android SDK or NDK is missing. Run ./setup-android-build-tools.sh first." >&2
  exit 1
fi

for required_command in npm npx rustup; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    echo "ERROR: $required_command is required. See docs/android-build-and-install.md." >&2
    exit 1
  fi
done

export ANDROID_HOME="$android_sdk_root"
export ANDROID_SDK_ROOT="$android_sdk_root"
export NDK_HOME="$ndk_root"
export PATH="$user_home/.cargo/bin:$android_sdk_root/platform-tools:$PATH"

mapfile -t connected_devices < <("$adb_bin" devices | awk '$2 == "device" {print $1}')
if [ ${#connected_devices[@]} -eq 0 ]; then
  echo "ERROR: No authorized Android device found." >&2
  "$adb_bin" devices -l >&2
  echo "Unlock the phone and accept the USB debugging prompt, then retry." >&2
  exit 1
fi

device_serial=${ANDROID_SERIAL:-"${connected_devices[0]}"}
device_abi=$("$adb_bin" -s "$device_serial" shell getprop ro.product.cpu.abi | tr -d '\r')
if [ "$device_abi" != 'arm64-v8a' ]; then
  echo "ERROR: This script currently supports ARM64 phones only; connected device ABI: $device_abi" >&2
  exit 1
fi

echo "==> Using device: $device_serial ($device_abi)"
cd "$script_dir/client"

echo "==> Installing frontend dependencies..."
npm ci

echo "==> Running tests..."
npm run test

echo "==> Building the ARM64 Tauri Android debug APK..."
npx tauri android build --apk --debug --target aarch64 --ci

if [ ! -f "$apk_file" ]; then
  echo "ERROR: APK not found at $apk_file" >&2
  exit 1
fi

echo "==> Installing or updating $package_name (preserving app data)..."
"$adb_bin" -s "$device_serial" install -r "$apk_file"

echo "==> Launching JediNotebook..."
"$adb_bin" -s "$device_serial" shell am start -n "$package_name/.MainActivity"
"$adb_bin" -s "$device_serial" shell dumpsys package "$package_name" | \
  awk '/versionCode=|versionName=|lastUpdateTime=/{print}'

echo "Done."
