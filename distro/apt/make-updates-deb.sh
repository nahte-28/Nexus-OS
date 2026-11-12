#!/bin/sh
# Maakt het pakket nexus-os-updates: de eigen pakketbron van NEXUS OS (adres en publieke
# sleutel) en een timer die NEXUS daaruit bijwerkt. Komt in de ISO en in de pakketbron zelf,
# zodat een nieuwe sleutel of een nieuw adres ook via een update binnenkomt.
#   distro/apt/make-updates-deb.sh <publieke-sleutel.asc> <versie> <uitvoermap>
set -eu
key="$1"
version="$2"
out="$3"
here="$(cd "$(dirname "$0")" && pwd)"
grep -q 'BEGIN PGP PUBLIC KEY BLOCK' "$key" || { echo "Geen publieke sleutel: $key" >&2; exit 1; }
pkg="$(mktemp -d)/nexus-os-updates"
install -D -m 644 "$key" "$pkg/usr/share/keyrings/nexus-os.asc"
install -D -m 644 "$here/updates/nexus-os.sources" "$pkg/etc/apt/sources.list.d/nexus-os.sources"
install -D -m 755 "$here/updates/nexus-os-update" "$pkg/usr/libexec/nexus-os-update"
install -D -m 644 "$here/updates/nexus-os-update.service" "$pkg/usr/lib/systemd/system/nexus-os-update.service"
install -D -m 644 "$here/updates/nexus-os-update.timer" "$pkg/usr/lib/systemd/system/nexus-os-update.timer"
mkdir -p "$pkg/DEBIAN"
cat > "$pkg/DEBIAN/control" <<CONTROL
Package: nexus-os-updates
Version: $version
Architecture: all
Maintainer: NEXUS OS <https://github.com/nahte-28/Nexus-OS>
Depends: apt, systemd
Priority: optional
Section: admin
Homepage: https://nahte-28.github.io/Nexus-OS/
Description: Eigen pakketbron en automatische updates van NEXUS OS
 Voegt de pakketbron van NEXUS OS toe (met haar publieke sleutel) en werkt NEXUS
 om de zes uur bij, zonder wachtwoord. Debian zelf wordt hierdoor niet bijgewerkt.
CONTROL
echo /etc/apt/sources.list.d/nexus-os.sources > "$pkg/DEBIAN/conffiles"
cat > "$pkg/DEBIAN/postinst" <<'SCRIPT'
#!/bin/sh
set -e
if [ "$1" = configure ]; then
  # Ook in een chroot (het bouwen van de ISO): enable zet alleen de koppeling.
  systemctl enable nexus-os-update.timer >/dev/null 2>&1 || true
  if [ -d /run/systemd/system ]; then
    systemctl daemon-reload || true
    systemctl start nexus-os-update.timer || true
  fi
fi
SCRIPT
cat > "$pkg/DEBIAN/prerm" <<'SCRIPT'
#!/bin/sh
set -e
if [ "$1" = remove ]; then
  if [ -d /run/systemd/system ]; then systemctl stop nexus-os-update.timer || true; fi
  systemctl disable nexus-os-update.timer >/dev/null 2>&1 || true
fi
SCRIPT
chmod 755 "$pkg/DEBIAN/postinst" "$pkg/DEBIAN/prerm"
mkdir -p "$out"
dpkg-deb --root-owner-group --build "$pkg" "$out/nexus-os-updates_${version}_all.deb"
