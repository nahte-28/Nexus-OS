#!/bin/sh
# Test van de pakketbron op een schone Debian 13 (als root, bv. in docker debian:trixie):
# apt moet de handtekening aanvaarden, een oudere NEXUS installeren en die met
# nexus-os-update naar de nieuwste brengen.
#   distro/apt/test-repo.sh <uitvoermap-van-build-repo>
set -eu
site="$(cd "$1" && pwd)"
repo="$site/apt"
# apt haalt bestanden op als de gebruiker _apt.
chmod -R a+rX "$site"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
# Eerst de bron zelf, zoals iemand die ze met de hand toevoegt.
apt-get install -y -qq "$repo/nexus-os-updates.deb" >/dev/null
test -f /usr/share/keyrings/nexus-os.asc
test -L /etc/systemd/system/timers.target.wants/nexus-os-update.timer
test -f /etc/apt/apt.conf.d/20nexus-auto-upgrades
# Hier wijst de bron naar de map in plaats van naar GitHub Pages.
sed -i "s|^URIs:.*|URIs: file:$repo|" /etc/apt/sources.list.d/nexus-os.sources
apt-get update 2>&1 | tee /tmp/update.log
if grep -qE 'NO_PUBKEY|is not signed|GPG error|OpenPGP|^E:' /tmp/update.log; then
  echo "apt aanvaardt de pakketbron niet." >&2; exit 1
fi
versions="$(apt-cache madison nexus-os | awk '{print $3}' | sort -V)"
echo "NEXUS in de bron: $(echo $versions)"
oldest="$(echo "$versions" | head -n 1)"
newest="$(echo "$versions" | tail -n 1)"
apt-get install -y -qq --no-install-recommends "nexus-os=$oldest" >/dev/null
echo "Geïnstalleerd: $(dpkg-query -W -f='${Version}' nexus-os)"
/usr/libexec/nexus-os-update
now="$(dpkg-query -W -f='${Version}' nexus-os)"
echo "Na nexus-os-update: $now"
if [ "$now" != "$newest" ]; then
  echo "nexus-os-update bracht NEXUS niet naar $newest." >&2; exit 1
fi
# De lijsten van Debian bleven staan.
apt-cache policy labwc | grep -q deb.debian.org || { echo "De Debian-lijsten zijn weg." >&2; exit 1; }
echo "Pakketbron werkt."
