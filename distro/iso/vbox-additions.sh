#!/bin/sh
# Downloads the newest VirtualBox Guest Additions and keeps only the programs the NEXUS session
# needs for the shared clipboard (VBoxClient and its helper vboxwl). Debian 13 has no
# VirtualBox guest packages; the kernel module (vboxguest) is already in Debian's kernel.
#   distro/iso/vbox-additions.sh <out dir>   -> <out dir>/bin/VBoxClient ...
# Needs curl, xorriso, tar and bzip2. The checksum comes from Oracle's SHA256SUMS.
set -eu
out="$1"
base=https://download.virtualbox.org/virtualbox
version=$(curl -fsSL --retry 3 "$base/LATEST-STABLE.TXT" | tr -d '[:space:]')
case "$version" in
  [0-9]*.[0-9]*.[0-9]*) ;;
  *) echo "Onbekende VirtualBox-versie: $version" >&2; exit 1 ;;
esac
iso="VBoxGuestAdditions_$version.iso"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
curl -fsSL --retry 3 -o "$tmp/$iso" "$base/$version/$iso"
curl -fsSL --retry 3 -o "$tmp/SHA256SUMS" "$base/$version/SHA256SUMS"
(cd "$tmp" && grep " \*\?$iso\$" SHA256SUMS | sed 's/ \*/  /' | sha256sum -c -)
xorriso -osirrox on -indev "$tmp/$iso" -extract /VBoxLinuxAdditions.run "$tmp/additions.run" >/dev/null 2>&1
chmod u+w "$tmp/additions.run"
# A makeself archive: unpack it without running the installer.
sh "$tmp/additions.run" --noexec --target "$tmp/run" >/dev/null
mkdir -p "$tmp/ga"
tar -xjf "$tmp/run/VBoxGuestAdditions-amd64.tar.bz2" -C "$tmp/ga"
mkdir -p "$out/bin"
install -m 755 "$tmp/ga/bin/VBoxClient" "$out/bin/VBoxClient"
[ -f "$tmp/ga/bin/vboxwl" ] && install -m 755 "$tmp/ga/bin/vboxwl" "$out/bin/vboxwl"
echo "$version" > "$out/version"
# Guest Additions are GPLv2; their license text goes along.
for f in "$tmp/ga/LICENSE" "$tmp/run/LICENSE"; do
  [ -f "$f" ] && { install -m 644 "$f" "$out/LICENSE"; break; }
done
ls -l "$out/bin"
echo "VirtualBox Guest Additions $version (klembord)"
