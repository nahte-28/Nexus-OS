#!/bin/sh
# Bouwt de pakketbron van NEXUS OS uit een map met .deb-bestanden, ondertekend met de sleutel
# die al in gpg staat (de geheime sleutel APT_SIGNING_KEY op GitHub).
#   distro/apt/build-repo.sh <map-met-debs> <uitvoermap>
# Uitvoer: <uitvoermap>/index.html (uitleg) en <uitvoermap>/apt/ (de bron zelf), zoals GitHub
# Pages ze toont op https://nahte-28.github.io/Nexus-OS/.
# Nodig: dpkg-dev of apt-utils (apt-ftparchive) en gnupg.
set -eu
debs="$1"
out="$2"
here="$(cd "$(dirname "$0")" && pwd)"
repo="$out/apt"
rm -rf "$out"
mkdir -p "$repo/pool/main" "$repo/dists/stable/main/binary-amd64"
cp "$debs"/*.deb "$repo/pool/main/"
cd "$repo"
# Pakketten van architectuur "all" (nexus-os-updates) staan mee in de lijst voor amd64.
apt-ftparchive packages pool > dists/stable/main/binary-amd64/Packages
gzip -9nk dists/stable/main/binary-amd64/Packages
apt-ftparchive \
  -o APT::FTPArchive::Release::Origin="NEXUS OS" \
  -o APT::FTPArchive::Release::Label="NEXUS OS" \
  -o APT::FTPArchive::Release::Suite=stable \
  -o APT::FTPArchive::Release::Codename=stable \
  -o APT::FTPArchive::Release::Architectures=amd64 \
  -o APT::FTPArchive::Release::Components=main \
  -o APT::FTPArchive::Release::Description="Eigen pakketbron van NEXUS OS" \
  release dists/stable > Release.tmp
mv Release.tmp dists/stable/Release
gpg --batch --yes --digest-algo SHA512 --clearsign -o dists/stable/InRelease dists/stable/Release
gpg --batch --yes --digest-algo SHA512 --armor --detach-sign -o dists/stable/Release.gpg dists/stable/Release
gpg --batch --armor --export > nexus-os.asc
# De nieuwste nexus-os-updates onder een vaste naam, voor wie de bron met de hand toevoegt.
newest="$(ls pool/main/nexus-os-updates_*_all.deb | sort -V | tail -n 1)"
cp "$newest" nexus-os-updates.deb
echo "Pakketbron:"
grep -E '^(Package|Version):' dists/stable/main/binary-amd64/Packages | paste - -
cp "$here/index.html" "$out/index.html"
touch "$out/.nojekyll"
