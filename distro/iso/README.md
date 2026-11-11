# NEXUS OS ISO

Een live-ISO van NEXUS OS: Debian 13 (trixie) met de [NEXUS-sessie](../session/README.md) als
bureaublad. Start je ze, dan meldt de live-gebruiker `nexus` (wachtwoord `live`) zich meteen aan
in NEXUS. Kies je in het opstartmenu "Install", dan zet het Debian-installatieprogramma hetzelfde
systeem op de schijf; daarna meld je je aan op het aanmeldscherm (greetd met tuigreet) met de
sessie NEXUS OS.

## Bouwen

GitHub bouwt de ISO (`.github/workflows/iso.yml`): met de hand via Actions › NEXUS OS ISO › Run
workflow, en bij elke wijziging in `distro/` op `main`. De ISO komt als release `iso-v1.0.<n>`.
De workflow start de ISO daarna in QEMU en bewaart een schermafbeelding (artefact
`nexus-os-iso-test`); is het scherm nog een tekstconsole, dan faalt de run.

Zelf bouwen kan op Debian 13 als root: `distro/iso/build.sh nexus-os.deb 1.0.0`.

## Wat erin zit

| Bestand | Rol |
|---|---|
| `config/package-lists/nexus.list.chroot` | de pakketten: labwc, aanmeldscherm, geluid, wifi, firmware, Firefox |
| `config/packages.chroot/` | hier zet `build.sh` de NEXUS-.deb uit de nieuwste release |
| `config/hooks/normal/0100-nexus.hook.chroot` | aanmeldscherm aan, Nederlands (België), AZERTY |
| `config/includes.chroot/etc/greetd/config.toml` | het aanmeldscherm |
| `config/includes.chroot/usr/lib/live/config/2000-nexus-autologin` | alleen live: meteen aanmelden |
| `build.sh` | roept `lb config` en `lb build` aan |
| `smoke.sh` | start de ISO in QEMU en kijkt of NEXUS op het scherm staat |

## Eigen uiterlijk

De beelden staan in `distro/branding/images` en komen uit `distro/branding/make-images.py` (opnieuw draaien na een nieuw logo). `build.sh` zet ze in het opstartmenu van de usb-stick en in het installatieprogramma; `hooks/normal/0200-nexus-branding.hook.chroot` maakt van het systeem "NEXUS OS" (`/etc/os-release`, `ID_LIKE=debian`), zet het laadscherm (plymouth) en verbergt het opstartmenu van een geïnstalleerd systeem. `bootmenu.sh` controleert in de workflow dat beide opstartmenu's (BIOS en UEFI) het NEXUS-beeld tonen.
