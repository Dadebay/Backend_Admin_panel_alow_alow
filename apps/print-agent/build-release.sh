#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
mkdir -p dist

release_version=${VERSION:-dev}
build() {
  local target_os=$1
  local target_arch=$2
  local suffix=$3
  CGO_ENABLED=0 GOOS="$target_os" GOARCH="$target_arch" \
    go build -trimpath -ldflags "-s -w -X main.version=$release_version" \
      -o "dist/a7-tagam-print-agent-$suffix" .
}

build darwin amd64 darwin-amd64
build darwin arm64 darwin-arm64
build windows amd64 windows-amd64.exe
build windows arm64 windows-arm64.exe
