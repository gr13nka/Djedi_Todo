#!/usr/bin/env bash
# Installs the Android SDK/NDK required for local Tauri Android builds.
set -eu

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# getent is glibc-only; hosts without it (macOS, BSD) fall back to $HOME.
user_home=$(getent passwd "$(id -u)" 2>/dev/null | cut -d: -f6 || true)
user_home=${user_home:-$HOME}
android_sdk_root=${ANDROID_SDK_ROOT:-"$user_home/.local/opt/android-sdk"}
ndk_version=${ANDROID_NDK_VERSION:-27.2.12479018}
tools_url='https://dl.google.com/android/repository/commandlinetools-linux-15859902_latest.zip'
tools_sha256='4e4c464f145a7512b57d088ac6c278c03c9eea610886b35a5e0804e74eedf583'

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "ERROR: $1 is required. See docs/android-build-and-install.md." >&2
    exit 1
  fi
}

for required_command in curl unzip sha256sum java rustup; do
  require_command "$required_command"
done

sdkmanager_bin="$android_sdk_root/cmdline-tools/latest/bin/sdkmanager"
if [ ! -x "$sdkmanager_bin" ]; then
  echo "==> Installing Android command-line tools in $android_sdk_root"
  android_tools_tmp=$(mktemp -d)
  trap 'rm -rf -- "$android_tools_tmp"' EXIT
  curl --fail --location --silent --show-error "$tools_url" --output "$android_tools_tmp/commandlinetools.zip"
  actual_sha256=$(sha256sum "$android_tools_tmp/commandlinetools.zip" | awk '{print $1}')
  if [ "$actual_sha256" != "$tools_sha256" ]; then
    echo "ERROR: Android command-line tools checksum did not match." >&2
    exit 1
  fi
  mkdir -p "$android_sdk_root/cmdline-tools"
  unzip -q "$android_tools_tmp/commandlinetools.zip" -d "$android_tools_tmp/unpacked"
  mv "$android_tools_tmp/unpacked/cmdline-tools" "$android_sdk_root/cmdline-tools/latest"
fi

echo "==> Accepting Android SDK licenses..."
yes | "$sdkmanager_bin" --sdk_root="$android_sdk_root" --licenses >/dev/null

echo "==> Installing Android SDK, build tools, and NDK..."
"$sdkmanager_bin" --sdk_root="$android_sdk_root" \
  'platform-tools' \
  'platforms;android-36' \
  'build-tools;35.0.0' \
  'build-tools;36.0.0' \
  "ndk;$ndk_version"

echo "==> Installing Rust support for ARM64 Android..."
rustup target add aarch64-linux-android

cat <<EOF

Android build tools are ready.

SDK: $android_sdk_root
NDK: $android_sdk_root/ndk/$ndk_version

Connect an ARM64 Android phone, enable USB debugging, then run:
  $script_dir/build-android.sh
EOF
