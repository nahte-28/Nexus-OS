#!/bin/sh
# GitHub's Linux runners fetch Ubuntu packages from azure.archive.ubuntu.com. When that name
# does not resolve (it happened for hours on 2026-11-11), every apt step hangs or fails. Use
# Ubuntu's own archive instead; it serves the same packages.
set -eu
for f in /etc/apt/apt-mirrors.txt /etc/apt/sources.list /etc/apt/sources.list.d/*.sources /etc/apt/sources.list.d/*.list; do
  [ -f "$f" ] && sudo sed -i 's|azure\.archive\.ubuntu\.com|archive.ubuntu.com|g' "$f"
done
true
