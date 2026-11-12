//! Self-update: looks for a newer installer among the GitHub releases, downloads it and installs
//! it over the running version. Windows runs the setup in passive mode; on Linux an AppImage
//! replaces itself and a .deb installs through pkexec (a password prompt), then NEXUS restarts.
//!
//! The releases feed on github.com comes first: the GitHub API allows only 60 requests an hour
//! per network address without an account, which a school or home network shares, so the API is
//! only the fallback when the feed lists no desktop release.

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

const RELEASES_API: &str = "https://api.github.com/repos/nahte-28/Nexus-OS/releases?per_page=30";
/// The newest releases (about 10) as an Atom feed, on github.com itself, without the API limit.
const RELEASES_FEED: &str = "https://github.com/nahte-28/Nexus-OS/releases.atom";
const FEED_TAG: &str = "/releases/tag/desktop-v";
/// Only installers from this repository's releases are ever downloaded.
const DOWNLOAD_PREFIX: &str = "https://github.com/nahte-28/Nexus-OS/releases/download/desktop-v";
const TAG_PREFIX: &str = "desktop-v";
/// The file that updates this copy of NEXUS, per platform and way of installing.
#[derive(Clone, Copy, Debug, PartialEq)]
enum Kind {
    WindowsSetup,
    AppImage,
    Deb,
}

impl Kind {
    fn current() -> Kind {
        if cfg!(windows) {
            Kind::WindowsSetup
        } else if std::env::var_os("APPIMAGE").is_some() {
            Kind::AppImage
        } else {
            Kind::Deb
        }
    }

    fn asset(self) -> &'static str {
        match self {
            Kind::WindowsSetup => "nexus-os-setup.exe",
            Kind::AppImage => "nexus-os.AppImage",
            Kind::Deb => "nexus-os.deb",
        }
    }
}

#[derive(Deserialize)]
struct Release {
    tag_name: String,
    draft: bool,
    prerelease: bool,
    assets: Vec<Asset>,
}

#[derive(Deserialize)]
struct Asset {
    name: String,
    browser_download_url: String,
}

#[derive(Serialize)]
pub struct UpdateInfo {
    version: String,
    url: String,
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("NEXUS-OS-desktop")
        .build()
        .map_err(|e| e.to_string())
}

/// The newest published installer, or None when this version is already the newest.
#[tauri::command]
pub async fn check_update(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
    let current = app.package_info().version.clone();
    let kind = Kind::current();
    let client = client()?;
    if let Some(found) = from_feed(&client, &current, kind).await {
        return Ok(found);
    }
    let releases: Vec<Release> = client
        .get(RELEASES_API)
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|e| {
            if e.status().is_some_and(|s| s.as_u16() == 403 || s.as_u16() == 429) {
                "GitHub laat even geen opvragingen meer toe vanaf dit netwerk. Probeer het over een uur opnieuw.".to_string()
            } else {
                format!("GitHub niet bereikbaar: {e}")
            }
        })?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    Ok(newest(&releases, &current, kind))
}

/// Some(answer) when the feed settles it; None to ask the API instead (feed unreachable, no
/// desktop release among its entries, or the installer of the newest one is missing).
async fn from_feed(client: &reqwest::Client, current: &semver::Version, kind: Kind) -> Option<Option<UpdateInfo>> {
    let feed = client.get(RELEASES_FEED).send().await.ok()?.error_for_status().ok()?.text().await.ok()?;
    let version = newest_in_feed(&feed)?;
    if version <= *current {
        return Some(None);
    }
    let url = format!("{DOWNLOAD_PREFIX}{version}/{}", kind.asset());
    // github.com answers an existing download with a redirect (not followed here) and a missing
    // installer with a 404.
    let probe = reqwest::Client::builder()
        .user_agent("NEXUS-OS-desktop")
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .ok()?;
    probe.head(&url).send().await.ok()?.error_for_status().ok()?;
    Some(Some(UpdateInfo { version: version.to_string(), url }))
}

/// The highest desktop version in the releases feed (tags like desktop-v1.0.116).
fn newest_in_feed(feed: &str) -> Option<semver::Version> {
    feed.match_indices(FEED_TAG)
        .filter_map(|(at, _)| {
            let rest = &feed[at + FEED_TAG.len()..];
            let end = rest.find(|c: char| !(c.is_ascii_digit() || c == '.')).unwrap_or(rest.len());
            semver::Version::parse(&rest[..end]).ok()
        })
        .max()
}

fn newest(releases: &[Release], current: &semver::Version, kind: Kind) -> Option<UpdateInfo> {
    releases
        .iter()
        .filter(|r| !r.draft && !r.prerelease)
        .filter_map(|r| {
            let version = semver::Version::parse(r.tag_name.strip_prefix(TAG_PREFIX)?).ok()?;
            let asset = r.assets.iter().find(|a| a.name == kind.asset())?;
            Some((version, asset.browser_download_url.clone()))
        })
        .filter(|(version, _)| version > current)
        .max_by(|a, b| a.0.cmp(&b.0))
        .map(|(version, url)| UpdateInfo { version: version.to_string(), url })
}

/// Downloads the installer and starts it; the installer closes NEXUS, updates it and starts it again.
#[tauri::command]
pub async fn install_update(app: AppHandle, url: String) -> Result<(), String> {
    let kind = Kind::current();
    if !url.starts_with(DOWNLOAD_PREFIX) || !url.ends_with(&format!("/{}", kind.asset())) {
        return Err("Onbekend downloadadres.".into());
    }
    let bytes = client()?
        .get(&url)
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|e| format!("Downloaden mislukt: {e}"))?
        .bytes()
        .await
        .map_err(|e| format!("Downloaden mislukt: {e}"))?;
    match kind {
        Kind::WindowsSetup => {
            let path = std::env::temp_dir().join("nexus-os-update-setup.exe");
            std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
            // /P: passive (progress only, no questions), /R: start NEXUS again when done.
            std::process::Command::new(&path)
                .args(["/P", "/R"])
                .spawn()
                .map_err(|e| format!("Installatie starten mislukt: {e}"))?;
        }
        Kind::AppImage => {
            let target = std::path::PathBuf::from(std::env::var_os("APPIMAGE").ok_or("Geen AppImage")?);
            replace_appimage(&target, &bytes)?;
            std::process::Command::new(&target)
                .spawn()
                .map_err(|e| format!("NEXUS opnieuw starten mislukt: {e}"))?;
        }
        Kind::Deb => {
            let path = std::env::temp_dir().join("nexus-os-update.deb");
            std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
            // pkexec asks for the password in a system dialog; apt replaces the files in place.
            let status = tauri::async_runtime::spawn_blocking(move || {
                std::process::Command::new("pkexec").args(["apt-get", "install", "-y"]).arg(&path).status()
            })
            .await
            .map_err(|e| e.to_string())?
            .map_err(|e| format!("Installatie starten mislukt: {e}"))?;
            if !status.success() {
                return Err("De installatie werd afgebroken of mislukte.".into());
            }
            // As the desktop of the NEXUS session, keep-nexus starts NEXUS again by itself.
            if !std::env::args().any(|a| a == "--session") {
                std::process::Command::new(installed_exe(std::env::current_exe().ok()))
                    .spawn()
                    .map_err(|e| format!("NEXUS opnieuw starten mislukt: {e}"))?;
            }
        }
    }
    app.exit(0);
    Ok(())
}

/// The program to start after apt replaced it. Linux names the running program
/// "/usr/bin/nexus-desktop (deleted)" once its file is replaced, which does not exist.
fn installed_exe(current: Option<std::path::PathBuf>) -> std::path::PathBuf {
    let fallback = std::path::PathBuf::from("/usr/bin/nexus-desktop");
    let Some(path) = current else { return fallback };
    let text = path.to_string_lossy();
    match text.strip_suffix(" (deleted)") {
        Some(original) => std::path::PathBuf::from(original),
        None => path,
    }
}

/// Writes the new AppImage next to the old one and swaps them in one step, so a failed
/// download never leaves a broken NEXUS behind.
fn replace_appimage(target: &std::path::Path, bytes: &[u8]) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let next = target.with_extension("update");
        std::fs::write(&next, bytes).map_err(|e| format!("Opslaan mislukt: {e}"))?;
        std::fs::set_permissions(&next, std::fs::Permissions::from_mode(0o755)).map_err(|e| e.to_string())?;
        std::fs::rename(&next, target).map_err(|e| format!("Vervangen mislukt: {e}"))
    }
    #[cfg(not(unix))]
    {
        let _ = (target, bytes);
        Err("Alleen op Linux".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn release(tag: &str, asset: &str) -> Release {
        Release {
            tag_name: tag.into(),
            draft: false,
            prerelease: false,
            assets: vec![Asset { name: asset.into(), browser_download_url: format!("{DOWNLOAD_PREFIX}x/{asset}") }],
        }
    }

    #[test]
    fn picks_the_newest_newer_installer() {
        let releases = vec![
            release("desktop-v0.8.3", "nexus-os-setup.exe"),
            release("desktop-v0.8.10", "nexus-os-setup.exe"),
            release("companion-v0.8.20", "nexus-companion.apk"),
            release("desktop-v0.8.12", "other.zip"),
        ];
        let v = |s: &str| semver::Version::parse(s).unwrap();
        let found = newest(&releases, &v("0.8.4"), Kind::WindowsSetup).unwrap();
        assert_eq!(found.version, "0.8.10");
        assert!(newest(&releases, &v("0.8.10"), Kind::WindowsSetup).is_none());
        assert!(newest(&releases, &v("0.8.4"), Kind::AppImage).is_none());
    }

    #[test]
    fn linux_picks_its_own_file() {
        let releases = vec![release("desktop-v1.0.120", "nexus-os.AppImage"), release("desktop-v1.0.121", "nexus-os.deb")];
        let v = semver::Version::parse("1.0.119").unwrap();
        assert_eq!(newest(&releases, &v, Kind::AppImage).unwrap().version, "1.0.120");
        assert_eq!(newest(&releases, &v, Kind::Deb).unwrap().version, "1.0.121");
    }

    #[cfg(unix)]
    #[test]
    fn restarts_the_replaced_program_by_its_real_path() {
        use std::path::PathBuf;
        assert_eq!(installed_exe(Some(PathBuf::from("/usr/bin/nexus-desktop (deleted)"))), PathBuf::from("/usr/bin/nexus-desktop"));
        assert_eq!(installed_exe(Some(PathBuf::from("/opt/x/nexus-desktop"))), PathBuf::from("/opt/x/nexus-desktop"));
        assert_eq!(installed_exe(None), PathBuf::from("/usr/bin/nexus-desktop"));
    }

    #[test]
    fn replaces_an_appimage_in_one_step() {
        use std::os::unix::fs::PermissionsExt;
        let dir = std::env::temp_dir().join(format!("nexus-appimage-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let target = dir.join("NEXUS.AppImage");
        std::fs::write(&target, b"old").unwrap();
        replace_appimage(&target, b"new").unwrap();
        assert_eq!(std::fs::read(&target).unwrap(), b"new");
        assert_eq!(std::fs::metadata(&target).unwrap().permissions().mode() & 0o777, 0o755);
        assert!(!dir.join("NEXUS.update").exists());
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn reads_the_newest_desktop_version_from_the_feed() {
        let feed = r#"<feed><entry><link rel="alternate" type="text/html" href="https://github.com/nahte-28/Nexus-OS/releases/tag/companion-v1.0.90"/></entry>
<entry><link rel="alternate" type="text/html" href="https://github.com/nahte-28/Nexus-OS/releases/tag/desktop-v1.0.117"/><id>tag:github.com,2008:Repository/1/desktop-v1.0.117</id></entry>
<entry><link rel="alternate" type="text/html" href="https://github.com/nahte-28/Nexus-OS/releases/tag/desktop-v1.0.9"/></entry></feed>"#;
        assert_eq!(newest_in_feed(feed), Some(semver::Version::parse("1.0.117").unwrap()));
        assert_eq!(newest_in_feed("<feed></feed>"), None);
    }
}
