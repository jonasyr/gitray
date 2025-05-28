#!/usr/bin/env bash
set -euo pipefail

# Color codes
RED='\033[0;31m'; GREEN='\033[0;32m'; NC='\033[0m'

error_exit() {
  echo -e "${RED}Error:${NC} $1" >&2
  exit 1
}

# Fetch latest k6 tag (e.g. "v0.47.1")
get_latest_tag() {
  curl -fsSL https://api.github.com/repos/grafana/k6/releases/latest \
    | grep -m1 '"tag_name":' \
    | sed -E 's/.*"([^"]+)".*/\1/' || return 1
}

install_static() {
  TAG=$(get_latest_tag) || TAG="v0.47.0"
  VER=${TAG#v}
  ARCH=$(uname -m)
  [[ $ARCH == x86_64 ]] && ARCH=amd64 || ARCH=arm64
  T="k6-${TAG}-linux-${ARCH}.tar.gz"
  U="https://dl.k6.io/releases/${TAG}/${T}"
  echo "🔄 Falling back to static binary ${TAG}…"
  curl -fsSL "$U" -o "/tmp/$T" \
    || error_exit "Failed to download $T"
  tar -xzf "/tmp/$T" -C /tmp
  sudo mv "/tmp/k6-${TAG}-linux-${ARCH}/k6" /usr/local/bin/
  sudo chmod +x /usr/local/bin/k6
  echo -e "${GREEN}✔ k6 ${VER} installed to /usr/local/bin/k6${NC}"
}

install_snapd() {
  echo "🔄 Ensuring snapd is installed…"
  sudo apt-get update \
    && sudo apt-get install -y snapd \
    || error_exit "'apt install snapd' failed"
  echo -e "${GREEN}✔ snapd package ready${NC}"

  echo "🔄 Installing/updating core snap…"
  sudo snap install core || sudo snap refresh core || true
  echo -e "${GREEN}✔ core snap OK${NC}"

  sudo systemctl enable --now snapd.socket snapd.service \
    || error_exit "Failed to start snapd service"
  echo -e "${GREEN}✔ snapd service running${NC}"
}

install_k6_snap() {
  echo "🔄 Installing k6 via snap…"
  sudo snap install k6 \
    && echo -e "${GREEN}✔ k6 snap installed:$(snap run k6 version)${NC}" \
    && return 0
  echo -e "${RED}⚠ snap install k6 failed, falling back${NC}"
  install_static
}

install_linux() {
  if command -v k6 &>/dev/null; then
    echo -e "${GREEN}✔ k6 already installed, skipping${NC}"
  else
    install_snapd
    install_k6_snap
  fi
}

install_mac() {
  echo "ℹ Detected macOS"
  command -v k6 &>/dev/null \
    && echo -e "${GREEN}✔ k6 already installed, skipping${NC}" \
    || { command -v brew &>/dev/null \
        && brew install k6 \
        && echo -e "${GREEN}✔ k6 via Homebrew:$(k6 version)${NC}" \
        || error_exit "Homebrew not found"; }
}

install_windows() {
  echo "ℹ Detected Windows"
  command -v k6 &>/dev/null \
    && echo -e "${GREEN}✔ k6 already installed, skipping${NC}" \
    || { command -v choco &>/dev/null \
        && choco install k6 -y \
        && echo -e "${GREEN}✔ k6 via Chocolatey:$(k6 version)${NC}" \
        || error_exit "Chocolatey not found"; }
}

echo "🚀 Starting k6 installer…"
case "$(uname -s)" in
  Linux)   install_linux ;;
  Darwin)  install_mac   ;;
  CYGWIN*|MINGW*|MSYS*) install_windows ;;
  *)        error_exit "Unsupported OS: $(uname -s)" ;;
esac

