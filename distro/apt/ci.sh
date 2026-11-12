#!/bin/sh
# Bouwt de pakketbron in de workflow, in docker debian:trixie.
#   distro/apt/ci.sh <map-met-debs> <uitvoermap>
# APT_SIGNING_KEY: de geheime sleutel (leeg in een pull request: dan een testsleutel).
# UPDATES_VERSION: de versie van nexus-os-updates.
set -eu
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq && apt-get install -y -qq gnupg apt-utils >/dev/null
if [ -n "${APT_SIGNING_KEY:-}" ]; then
  printf '%s\n' "$APT_SIGNING_KEY" | gpg --batch --import
else
  echo "Geen APT_SIGNING_KEY: ondertekend met een testsleutel."
  gpg --batch --passphrase '' --quick-gen-key "NEXUS OS testsleutel" ed25519 sign 0
fi
key="$(mktemp)"
gpg --armor --export > "$key"
distro/apt/make-updates-deb.sh "$key" "$UPDATES_VERSION" "$1"
distro/apt/build-repo.sh "$1" "$2"
