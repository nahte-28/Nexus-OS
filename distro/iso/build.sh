#!/bin/sh
# Builds the NEXUS OS live ISO with Debian live-build. Runs as root on Debian 13 (trixie),
# for example in a privileged debian:trixie container (see .github/workflows/iso.yml).
#   distro/iso/build.sh <nexus-os.deb> <version> [nexus-os-updates.deb]
# With nexus-os-updates (distro/apt) the system gets the own package source of NEXUS OS and
# keeps NEXUS up to date from it.
# The ISO lands in distro/iso/out/nexus-os-<version>-amd64.iso.
set -eu
deb="$1"
version="$2"
here="$(cd "$(dirname "$0")" && pwd)"
work="$(mktemp -d)"
cp -r "$here/config" "$work/config"
cp "$deb" "$work/config/packages.chroot/nexus-os_${version}_amd64.deb"
updates="${3:-}"
if [ -n "$updates" ]; then
  cp "$updates" "$work/config/packages.chroot/"
else
  echo "Zonder nexus-os-updates: geen eigen pakketbron in deze ISO."
fi
# The session files of this commit win over those in the (older) released .deb.
session="$here/../session"
inc="$work/config/includes.chroot"
install -D -m 644 "$session/nexus.desktop" "$inc/usr/share/wayland-sessions/nexus.desktop"
install -D -m 755 "$session/nexus-session" "$inc/usr/bin/nexus-session"
install -D -m 755 "$session/keep-nexus" "$inc/usr/lib/nexus-session/keep-nexus"
for f in rc.xml menu.xml environment autostart; do
  install -D -m 644 "$session/labwc/$f" "$inc/usr/share/nexus-session/labwc/$f"
done
# NEXUS OS look: images for the boot splash and the installed boot menu, and the version.
brand="$here/../branding/images"
install -D -m 644 "$brand/plymouth-logo.png" "$inc/usr/share/nexus-os/logo.png"
install -D -m 644 "$brand/boot-1920x1080.png" "$inc/usr/share/nexus-os/boot.png"
echo "$version" > "$inc/usr/share/nexus-os/version"
# The banner of the graphical installer.
install -D -m 644 "$brand/installer-banner.png" "$work/config/includes.installer/usr/share/graphics/logo_debian.png"
install -D -m 644 "$brand/installer-banner-dark.png" "$work/config/includes.installer/usr/share/graphics/logo_debian_dark.png"
# The boot menus of the usb stick: live-build's own menus, with the NEXUS background and name.
cp -r /usr/share/live/build/bootloaders "$work/config/bootloaders"
find "$work/config/bootloaders" -type f | sort
for f in $(find "$work/config/bootloaders" -name 'splash.png'); do
  case "$f" in
    *isolinux*|*syslinux*|*extlinux*|*pxelinux*) cp "$brand/splash-640x480.png" "$f" ;;
    *) cp "$brand/boot-1920x1080.png" "$f" ;;
  esac
done
for f in $(find "$work/config/bootloaders" -name 'splash.svg*'); do
  # syslinux menus are drawn from an svg: one that only holds the NEXUS picture.
  printf '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="640" height="480"><image width="640" height="480" xlink:href="data:image/png;base64,%s"/></svg>\n' \
    "$(base64 -w0 "$brand/splash-640x480.png")" > "$f"
done
grep -rlI 'Debian GNU/Linux' "$work/config/bootloaders" | xargs -r sed -i 's|Debian GNU/Linux|NEXUS OS|g'
grep -rhI -iE 'menuentry|menu label|title' "$work/config/bootloaders" | sort -u | head -40
cd "$work"
# The NEXUS package source (nexus-os-updates) is already active while the image is built and may
# hold newer NEXUS versions than this ISO; the packages of this build win (--allow-downgrades),
# and the installed system updates itself afterwards.
lb config \
  --distribution trixie \
  --architectures amd64 \
  --archive-areas "main contrib non-free non-free-firmware" \
  --binary-images iso-hybrid \
  --debian-installer live \
  --debian-installer-gui true \
  --apt-recommends false \
  --apt-options "--yes --allow-downgrades -o Acquire::Retries=5" \
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
