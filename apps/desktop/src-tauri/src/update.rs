//! Self-update: looks for a newer installer among the GitHub releases, downloads it and runs it
//! in passive mode, so a new version installs over the running one without a setup wizard.

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

const RELEASES_API: &str = "https://api.github.com/repos/nahte-28/Nexus-OS/releases?per_page=30";
/// Only installers from this repository's releases are ever downloaded.
const DOWNLOAD_PREFIX: &str = "https://github.com/nahte-28/Nexus-OS/releases/download/desktop-v";
const TAG_PREFIX: &str = "desktop-v";
const INSTALLER_NAME: &str = "nexus-os-setup.exe";

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
    let releases: Vec<Release> = client()?
        .get(RELEASES_API)
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|e| format!("GitHub niet bereikbaar: {e}"))?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    Ok(newest(&releases, &current))
}

fn newest(releases: &[Release], current: &semver::Version) -> Option<UpdateInfo> {
    releases
        .iter()
        .filter(|r| !r.draft && !r.prerelease)
        .filter_map(|r| {
            let version = semver::Version::parse(r.tag_name.strip_prefix(TAG_PREFIX)?).ok()?;
            let asset = r.assets.iter().find(|a| a.name == INSTALLER_NAME)?;
            Some((version, asset.browser_download_url.clone()))
        })
        .filter(|(version, _)| version > current)
        .max_by(|a, b| a.0.cmp(&b.0))
        .map(|(version, url)| UpdateInfo { version: version.to_string(), url })
}

/// Downloads the installer and starts it; the installer closes NEXUS, updates it and starts it again.
#[tauri::command]
pub async fn install_update(app: AppHandle, url: String) -> Result<(), String> {
    if !url.starts_with(DOWNLOAD_PREFIX) {
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
    let path = std::env::temp_dir().join("nexus-os-update-setup.exe");
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    // /P: passive (progress only, no questions), /R: start NEXUS again when done.
    std::process::Command::new(&path)
        .args(["/P", "/R"])
        .spawn()
        .map_err(|e| format!("Installatie starten mislukt: {e}"))?;
    app.exit(0);
    Ok(())
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
            release("desktop-v0.8.3", INSTALLER_NAME),
            release("desktop-v0.8.10", INSTALLER_NAME),
            release("companion-v0.8.20", "nexus-companion.apk"),
            release("desktop-v0.8.12", "other.zip"),
        ];
        let found = newest(&releases, &semver::Version::parse("0.8.4").unwrap()).unwrap();
        assert_eq!(found.version, "0.8.10");
        assert!(newest(&releases, &semver::Version::parse("0.8.10").unwrap()).is_none());
    }
}
