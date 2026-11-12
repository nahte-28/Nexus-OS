# Pakketbron van NEXUS OS

NEXUS OS haalt zijn updates uit een eigen apt-pakketbron op GitHub Pages:
https://nahte-28.github.io/Nexus-OS/. Zo komt een nieuwe NEXUS op een geïnstalleerde NEXUS OS
zonder nieuwe ISO en zonder wachtwoord.

## Hoe het werkt

- `.github/workflows/apt.yml` bouwt de bron na elke run van "Windows- en Linux-app" op `main`
  (en bij een wijziging hier). In de bron staan de drie nieuwste `nexus-os.deb` uit de releases
  en het pakket `nexus-os-updates`.
- `nexus-os-updates` (`make-updates-deb.sh`, bestanden in `updates/`) zet de bron in
  `/etc/apt/sources.list.d/nexus-os.sources`, de publieke sleutel in
  `/usr/share/keyrings/nexus-os.asc` en de timer `nexus-os-update.timer`. Die draait 5 minuten na
  het opstarten en daarna om de zes uur `/usr/libexec/nexus-os-update`: alleen de NEXUS-bron
  wordt opgehaald en alleen `nexus-os` en `nexus-os-updates` worden bijgewerkt. Debian zelf
  werk je bij zoals altijd (`sudo apt upgrade`), en dan komt NEXUS ook mee.
- De ISO-workflow zet `nexus-os-updates` in de ISO, dus elke NEXUS OS vanaf die ISO heeft de bron.
- `build-repo.sh` maakt de bron (`apt-ftparchive`) en ondertekent ze met `gpg`;
  `test-repo.sh` installeert in een schone Debian 13 een oudere NEXUS en kijkt of
  `nexus-os-update` hem naar de nieuwste brengt. In een pull request tekent een wegwerpsleutel.
- De versie van `nexus-os-updates` is `1.<datum en tijd van de laatste commit in distro/apt>`,
  zodat de ISO en de bron dezelfde versie maken.

## Eenmalig instellen (Ethan)

1. **De sleutel maken.** Open Git Bash (komt met Git voor Windows) en typ:

   ```sh
   gpg --batch --passphrase '' --quick-gen-key "NEXUS OS pakketbron" ed25519 sign 0
   gpg --armor --export-secret-keys "NEXUS OS pakketbron" > nexus-pakketbron-geheim.asc
   ```

   Bewaar `nexus-pakketbron-geheim.asc` op een veilige plek (bv. een usb-stick of je
   wachtwoordbeheerder) en zet het nooit in de repo of in een chat. Raak je de sleutel kwijt,
   dan moet elke NEXUS OS opnieuw geïnstalleerd worden of de nieuwe sleutel met de hand krijgen.
2. **De sleutel aan GitHub geven.** Op GitHub: de repo › Settings › Secrets and variables ›
   Actions › New repository secret. Naam `APT_SIGNING_KEY`, waarde: de hele inhoud van
   `nexus-pakketbron-geheim.asc` (van `-----BEGIN` tot en met `-----END ...-----`).
3. **GitHub Pages aanzetten.** Settings › Pages › Build and deployment › Source: kies
   **GitHub Actions**.
4. **Eerste keer bouwen.** Actions › Pakketbron › Run workflow. Daarna staat de bron op
   https://nahte-28.github.io/Nexus-OS/ en bouwt een nieuwe ISO met de bron erin
   (Actions › NEXUS OS ISO › Run workflow).

## Op een andere Debian, Ubuntu of Mint

```sh
curl -fsSLo /tmp/nexus-os-updates.deb https://nahte-28.github.io/Nexus-OS/apt/nexus-os-updates.deb
sudo apt install /tmp/nexus-os-updates.deb
sudo apt update && sudo apt install nexus-os
```

Meteen bijwerken: `sudo systemctl start nexus-os-update`. Wat de laatste keer gebeurde:
`journalctl -u nexus-os-update`.
