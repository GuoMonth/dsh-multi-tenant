#!/usr/bin/env bash
set -euo pipefail
# Installer checks exercise the same fixed Helm version as local acceptance.
helm_version=v3.21.3
helm_tmp=$(mktemp -d)
trap 'rm -rf "$helm_tmp"' EXIT
curl -fsSL "https://get.helm.sh/helm-${helm_version}-linux-amd64.tar.gz" -o "$helm_tmp/helm.tar.gz"
curl -fsSL "https://get.helm.sh/helm-${helm_version}-linux-amd64.tar.gz.sha256sum" -o "$helm_tmp/checksum"
expected=$(cut -d ' ' -f1 "$helm_tmp/checksum")
printf '%s  %s\n' "$expected" "$helm_tmp/helm.tar.gz" | sha256sum -c -
tar -xzf "$helm_tmp/helm.tar.gz" -C "$helm_tmp"
mkdir -p "$HOME/.local/bin"
install -m755 "$helm_tmp/linux-amd64/helm" "$HOME/.local/bin/helm"
if [ -n "${GITHUB_PATH:-}" ]; then echo "$HOME/.local/bin" >> "$GITHUB_PATH"; fi
