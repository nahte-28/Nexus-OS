#!/bin/sh
# Starts the ISO like a usb stick, once as an older pc (BIOS) and once as a newer one (UEFI),
# and takes a picture of the boot menu. Fails when a menu is plain text instead of the NEXUS
# picture (black with a few colours): then the menu files of build.sh are broken.
#   distro/iso/bootmenu.sh <dir with the iso>
set -eu
dir="$1"
iso="$(ls "$dir"/*.iso | head -1)"
accel=""
[ -w /dev/kvm ] && accel="-enable-kvm -cpu host"
fail=0
for mode in bios uefi; do
  firmware=""
  if [ "$mode" = uefi ]; then
    code=$(ls /usr/share/OVMF/OVMF_CODE_4M.fd /usr/share/OVMF/OVMF_CODE.fd 2>/dev/null | head -1)
    firmware="-drive if=pflash,format=raw,readonly=on,file=$code"
  fi
  sock="$dir/monitor-$mode.sock"
  # shellcheck disable=SC2086
  qemu-system-x86_64 $accel -m 2048 -display none -vga std $firmware -cdrom "$iso" \
    -monitor unix:"$sock",server,nowait &
  qemu=$!
  sleep "${BOOTMENU_WAIT:-25}"
  echo "screendump $dir/boot-$mode.ppm" | socat - UNIX-CONNECT:"$sock" >/dev/null
  sleep 2
  kill "$qemu" || true
  wait "$qemu" 2>/dev/null || true
  convert "$dir/boot-$mode.ppm" "$dir/boot-$mode.png"
  colours=$(convert "$dir/boot-$mode.png" -format %k info:)
  echo "Opstartmenu $mode: $colours kleuren"
  if [ "$colours" -lt 50 ]; then
    echo "Het opstartmenu ($mode) toont het NEXUS-beeld niet." >&2
    fail=1
  fi
done
exit "$fail"
