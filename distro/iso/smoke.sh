#!/bin/sh
# Starts the ISO in QEMU without its boot menu, waits until the NEXUS session should be up and
# saves a screenshot. Fails when the screen is still a text console (black with a few colours).
#   distro/iso/smoke.sh <dir with the iso, vmlinuz and initrd.img>
set -eu
dir="$1"
iso="$(ls "$dir"/*.iso | head -1)"
accel=""
[ -w /dev/kvm ] && accel="-enable-kvm -cpu host"
# shellcheck disable=SC2086
qemu-system-x86_64 $accel -m 4096 -smp 2 -display none -vga virtio \
  -cdrom "$iso" -kernel "$dir/vmlinuz" -initrd "$dir/initrd.img" \
  -append "boot=live components username=nexus hostname=nexus locales=nl_BE.UTF-8 keyboard-layouts=be console=ttyS0" \
  -serial file:"$dir/serial.log" -monitor unix:"$dir/monitor.sock",server,nowait &
qemu=$!
wait_s=${SMOKE_WAIT:-240}
sleep "$wait_s"
echo "screendump $dir/screen.ppm" | socat - UNIX-CONNECT:"$dir/monitor.sock" >/dev/null
sleep 2
kill "$qemu" || true
convert "$dir/screen.ppm" "$dir/screen.png"
colours=$(convert "$dir/screen.png" -format %k info:)
echo "Kleuren op het scherm na $wait_s s: $colours"
grep -E "greetd|labwc|nexus" "$dir/serial.log" | tail -20 || true
if [ "$colours" -lt 50 ]; then
  echo "Het scherm lijkt nog een tekstconsole: de NEXUS-sessie startte niet." >&2
  exit 1
fi
