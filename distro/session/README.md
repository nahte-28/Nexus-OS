# NEXUS-sessie (Linux)

Met deze bestanden is NEXUS op Linux de hele desktop. Op het aanmeldscherm kies je **NEXUS OS**;
dan start de compositor [labwc](https://labwc.github.io) met NEXUS schermvullend als bureaublad.
Linux-apps (Firefox, LibreOffice, een terminal...) start je vanuit NEXUS (Start of de app
Linux-apps) en ze openen als gewone vensters boven NEXUS.

De .deb van NEXUS installeert alles:

| Bestand | Komt in |
|---|---|
| `nexus.desktop` | `/usr/share/wayland-sessions/` (de keuze op het aanmeldscherm) |
| `nexus-session` | `/usr/bin/` (zet de omgeving en start labwc) |
| `keep-nexus` | `/usr/lib/nexus-session/` (start NEXUS opnieuw als het stopt) |
| `labwc/` | `/usr/share/nexus-session/labwc/` (sneltoetsen, menu, toetsenbord, wachtwoordvenster bij opstarten) |

labwc en een terminal (foot) staan bij de aanbevolen pakketten: `sudo apt install ./nexus-os.deb`
installeert ze mee.

Sneltoetsen: Alt+Tab wisselt van venster, Super+Spatie haalt NEXUS naar voren, Super+Enter
opent een terminal, Super+pijltjes zet een venster links, rechts of groot, Alt+F4 sluit.
Rechtsklik op de achtergrond geeft een menu met afmelden en uitschakelen.

Eigen instellingen: kopieer `/usr/share/nexus-session/labwc` naar `~/.config/nexus-session` en
pas ze daar aan (bv. het toetsenbord in `environment`, nu Belgisch AZERTY).

Uitproberen zonder af te melden: `labwc -C distro/session/labwc -s "nexus-desktop --session"`
in een bestaande desktop opent de sessie in een venster.
