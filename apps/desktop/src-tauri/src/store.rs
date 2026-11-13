//! Apps installeren on Linux: searching, installing, updating and removing apps from Flathub
//! with the flatpak tool. Everything is installed for this user only (--user), so no password
//! is asked and nothing outside the home folder changes.

use serde::Serialize;
use tauri::Webview;

const FLATHUB: &str = "https://dl.flathub.org/repo/flathub.flatpakrepo";

fn allowed(webview: &Webview) -> Result<(), String> {
    if webview.label() == "main" {
        Ok(())
    } else {
        Err("Niet toegestaan".into())
    }
}

async fn flatpak(args: Vec<String>) -> Result<String, String> {
    let output = tauri::async_runtime::spawn_blocking(move || {
        std::process::Command::new("flatpak")
            .args(&args)
            .env("LC_ALL", "C")
            .stdin(std::process::Stdio::null())
            .output()
    })
    .await
    .map_err(|e| format!("flatpak starten mislukt: {e}"))?
    .map_err(|e| match e.kind() {
        std::io::ErrorKind::NotFound => "Flatpak is niet geïnstalleerd (sudo apt install flatpak)".to_string(),
        _ => format!("flatpak starten mislukt: {e}"),
    })?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    } else {
        let err = String::from_utf8_lossy(&output.stderr);
        let line = err.lines().rev().find(|l| !l.trim().is_empty()).unwrap_or("Lukte niet").trim();
        Err(line.strip_prefix("error: ").or_else(|| line.strip_prefix("Error: ")).unwrap_or(line).to_string())
    }
}

fn args(list: &[&str]) -> Vec<String> {
    list.iter().map(|s| s.to_string()).collect()
}

/// A Flathub app id like org.videolan.VLC: reverse domain, at least three parts. Also keeps
/// anything that looks like an option out of the flatpak arguments.
fn valid_id(id: &str) -> bool {
    let parts: Vec<&str> = id.split('.').collect();
    parts.len() >= 3
        && !id.starts_with('-')
        && parts.iter().all(|p| !p.is_empty() && p.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-'))
}

#[derive(Serialize, Debug, PartialEq, Clone)]
pub struct StoreApp {
    id: String,
    name: String,
    summary: String,
    version: String,
    installed: bool,
}

/// Parses flatpak's table output when it is not on a terminal: one row per line, columns
/// separated by tabs, in the order asked with --columns.
fn rows(text: &str) -> Vec<Vec<String>> {
    text.lines()
        .filter(|l| !l.trim().is_empty() && !l.starts_with("No matches"))
        .map(|l| l.split('\t').map(|c| c.trim().to_string()).collect())
        .collect()
}

/// Rows of `--columns=application,name,description,version` into apps; runtimes and
/// extensions (ids ending in .Locale, .Debug, or with "Platform"/"Sdk") are left out.
fn parse_apps(text: &str, installed: &[String]) -> Vec<StoreApp> {
    let mut list: Vec<StoreApp> = Vec::new();
    for row in rows(text) {
        let get = |i: usize| row.get(i).cloned().unwrap_or_default();
        let id = get(0);
        if !valid_id(&id) || id.ends_with(".Locale") || id.ends_with(".Debug") || id.contains(".Platform") || id.contains(".Sdk") {
            continue;
        }
        if list.iter().any(|a| a.id == id) {
            continue;
        }
        list.push(StoreApp {
            installed: installed.contains(&id),
            name: if get(1).is_empty() { id.clone() } else { get(1) },
            summary: get(2),
            version: get(3),
            id,
        });
    }
    list
}

/// Adds Flathub for this user once, with its app list for searching.
async fn ensure_flathub() -> Result<(), String> {
    let remotes = flatpak(args(&["remotes", "--user", "--columns=name"])).await.unwrap_or_default();
    if rows(&remotes).iter().any(|r| r.first().map(String::as_str) == Some("flathub")) {
        return Ok(());
    }
    flatpak(args(&["remote-add", "--user", "--if-not-exists", "flathub", FLATHUB])).await.map_err(|e| format!("Flathub toevoegen mislukt: {e}"))?;
    flatpak(args(&["update", "--user", "--appstream", "--noninteractive"])).await.map(|_| ())
}

async fn installed_ids() -> Vec<String> {
    let text = flatpak(args(&["list", "--app", "--columns=application"])).await.unwrap_or_default();
    rows(&text).into_iter().filter_map(|r| r.into_iter().next()).collect()
}

/// The apps installed with flatpak (for this user and for the whole computer).
#[tauri::command]
pub async fn store_installed(webview: Webview) -> Result<Vec<StoreApp>, String> {
    allowed(&webview)?;
    let text = flatpak(args(&["list", "--app", "--columns=application,name,description,version"])).await?;
    let mut list = parse_apps(&text, &[]);
    for app in &mut list {
        app.installed = true;
    }
    list.sort_by_key(|a| a.name.to_lowercase());
    Ok(list)
}

#[tauri::command]
pub async fn store_search(webview: Webview, query: String) -> Result<Vec<StoreApp>, String> {
    allowed(&webview)?;
    let query = query.trim();
    if query.len() < 2 {
        return Ok(Vec::new());
    }
    ensure_flathub().await?;
    let installed = installed_ids().await;
    let text = flatpak(vec!["search".into(), "--columns=application,name,description,version".into(), "--".into(), query.to_string()]).await?;
    let mut list = parse_apps(&text, &installed);
    list.truncate(40);
    Ok(list)
}

#[tauri::command]
pub async fn store_install(webview: Webview, id: String) -> Result<(), String> {
    allowed(&webview)?;
    if !valid_id(&id) {
        return Err("Ongeldige app".into());
    }
    ensure_flathub().await?;
    flatpak(vec!["install".into(), "--user".into(), "-y".into(), "--noninteractive".into(), "flathub".into(), id]).await.map(|_| ())
}

#[tauri::command]
pub async fn store_remove(webview: Webview, id: String) -> Result<(), String> {
    allowed(&webview)?;
    if !valid_id(&id) {
        return Err("Ongeldige app".into());
    }
    flatpak(vec!["uninstall".into(), "--user".into(), "-y".into(), "--noninteractive".into(), id]).await.map(|_| ())
}

/// Updates every app installed for this user; returns how many had an update.
#[tauri::command]
pub async fn store_update_all(webview: Webview) -> Result<usize, String> {
    allowed(&webview)?;
    let pending = flatpak(args(&["remote-ls", "--user", "--updates", "--app", "--columns=application"])).await.unwrap_or_default();
    let count = rows(&pending).len();
    flatpak(args(&["update", "--user", "-y", "--noninteractive"])).await?;
    // Also refreshes Flathub's app list, so searching finds new apps and versions.
    let _ = flatpak(args(&["update", "--user", "--appstream", "--noninteractive"])).await;
    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn checks_app_ids() {
        assert!(valid_id("org.videolan.VLC"));
        assert!(valid_id("com.spotify.Client"));
        assert!(valid_id("io.github.some_dev.my-app"));
        assert!(!valid_id("--system"));
        assert!(!valid_id("vlc"));
        assert!(!valid_id("org..x"));
        assert!(!valid_id("org.x.y; rm"));
    }

    #[test]
    fn reads_search_results() {
        let text = "org.videolan.VLC\tVLC\tVLC media player, the open-source multimedia framework\t3.0.21\n\
                    org.videolan.VLC\tVLC\tduplicate\t3.0.21\n\
                    org.freedesktop.Platform.ffmpeg-full\tffmpeg\tCodecs\t23.08\n\
                    org.gnome.Celluloid\tCelluloid\tPlay videos\t0.27\n\
                    No matches found\n";
        let apps = parse_apps(text, &["org.gnome.Celluloid".to_string()]);
        assert_eq!(apps.len(), 2);
        assert_eq!(apps[0], StoreApp {
            id: "org.videolan.VLC".into(),
            name: "VLC".into(),
            summary: "VLC media player, the open-source multimedia framework".into(),
            version: "3.0.21".into(),
            installed: false,
        });
        assert!(apps[1].installed);
    }
}
