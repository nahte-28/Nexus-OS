#!/bin/sh
# Builds the NEXUS OS live ISO with Debian live-build. Runs as root on Debian 13 (trixie),
# for example in a privileged debian:trixie container (see .github/workflows/iso.yml).
#   distro/iso/build.sh <nexus-os.deb> <version>
# The ISO lands in distro/iso/out/nexus-os-<version>-amd64.iso.
set -eu
deb="$1"
version="$2"
here="$(cd "$(dirname "$0")" && pwd)"
work="$(mktemp -d)"
cp -r "$here/config" "$work/config"
cp "$deb" "$work/config/packages.chroot/nexus-os_${version}_amd64.deb"
# The session files of this commit win over those in the (older) released .deb.
session="$here/../session"
inc="$work/config/includes.chroot"
install -D -m 644 "$session/nexus.desktop" "$inc/usr/share/wayland-sessions/nexus.desktop"
install -D -m 755 "$session/nexus-session" "$inc/usr/bin/nexus-session"
install -D -m 755 "$session/keep-nexus" "$inc/usr/lib/nexus-session/keep-nexus"
for f in rc.xml menu.xml environment autostart; do
  install -D -m 644 "$session/labwc/$f" "$inc/usr/share/nexus-session/labwc/$f"
done
cd "$work"
lb config \
  --distribution trixie \
  --architectures amd64 \
  --archive-areas "main contrib non-free non-free-firmware" \
  --binary-images iso-hybrid \
  --debian-installer live \
  --debian-installer-gui true \
  --apt-recommends false \
  --iso-application "NEXUS OS" \
  --iso-publisher "NEXUS OS; https://github.com/nahte-28/Nexus-OS" \
  --iso-volume "NEXUS OS $version" \
  --image-name nexus-os \
  --bootappend-live "boot=live components quiet splash noautologin username=nexus hostname=nexus locales=nl_BE.UTF-8 keyboard-layouts=be timezone=Europe/Brussels"
lb build
mkdir -p "$here/out"
mv nexus-os-amd64.hybrid.iso "$here/out/nexus-os-$version-amd64.iso"
# The kernel and initrd, so a test can start the ISO without its boot menu.
cp "$(ls binary/live/vmlinuz* | head -1)" "$here/out/vmlinuz"
cp "$(ls binary/live/initrd.img* | head -1)" "$here/out/initrd.img"
