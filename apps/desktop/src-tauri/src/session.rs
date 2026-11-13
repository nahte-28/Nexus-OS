//! The NEXUS session on Linux: NEXUS as the whole desktop (started by `nexus-session` with
//! `--session`), the Linux apps installed on the computer, and logging out or shutting down.
//! Linux apps open as normal windows of the compositor (labwc), on top of NEXUS.

use serde::Serialize;
use std::collections::BTreeMap;
use std::path::PathBuf;
use tauri::Webview;

/// Passed by `nexus-session`: NEXUS fills the screen and its window cannot be closed.
pub const SESSION_FLAG: &str = "--session";

pub fn is_session() -> bool {
    std::env::args().any(|arg| arg == SESSION_FLAG)
}

/// Only the NEXUS interface itself may start programs or shut the computer down.
fn allowed(webview: &Webview) -> Result<(), String> {
    if webview.label() == "main" {
        Ok(())
    } else {
        Err("Niet toegestaan".into())
    }
}

#[derive(Serialize)]
pub struct SessionInfo {
    /// True when NEXUS is the desktop (the NEXUS session), not an app in another desktop.
    session: bool,
    linux: bool,
    /// Started from the NEXUS OS usb stick (live), where NEXUS OS can be installed.
    live: bool,
}

/// live-boot mounts the usb stick here; an installed system has no such folder.
fn is_live() -> bool {
    std::path::Path::new("/run/live/medium").is_dir()
}

#[tauri::command]
pub async fn session_info() -> SessionInfo {
    SessionInfo { session: is_session(), linux: cfg!(target_os = "linux"), live: cfg!(target_os = "linux") && is_live() }
}

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct LinuxApp {
    /// The .desktop file name without extension, like org.gnome.Nautilus.
    id: String,
    name: String,
    comment: String,
}

/// What NEXUS needs from a .desktop file (freedesktop Desktop Entry).
#[derive(Debug, PartialEq)]
struct Entry {
    name: String,
    comment: String,
    exec: String,
    terminal: bool,
}

/// Reads the [Desktop Entry] group; None for entries that are hidden, not applications or
/// have nothing to start. Dutch names (nl_BE, then nl) win over the default name.
fn parse_entry(text: &str) -> Option<Entry> {
    let mut in_main = false;
    let mut values: BTreeMap<String, String> = BTreeMap::new();
    for line in text.lines() {
        let line = line.trim();
        if line.starts_with('[') {
            in_main = line == "[Desktop Entry]";
            continue;
        }
        if !in_main || line.starts_with('#') {
            continue;
        }
        if let Some((key, value)) = line.split_once('=') {
            values.entry(key.trim().to_string()).or_insert_with(|| value.trim().to_string());
        }
    }
    let get = |key: &str| values.get(key).map(String::as_str);
    if get("Type") != Some("Application") || get("NoDisplay") == Some("true") || get("Hidden") == Some("true") {
        return None;
    }
    let localized = |key: &str| {
        get(&format!("{key}[nl_BE]")).or_else(|| get(&format!("{key}[nl]"))).or_else(|| get(key)).map(str::to_string)
    };
    let exec = get("Exec")?.to_string();
    Some(Entry {
        name: localized("Name")?,
        comment: localized("Comment").unwrap_or_default(),
        exec,
        terminal: get("Terminal") == Some("true"),
    })
}

/// Splits an Exec line into the program and its arguments, without a shell: quotes group,
/// a backslash escapes, and field codes like %U or %f are dropped (NEXUS opens no files).
fn exec_args(exec: &str) -> Vec<String> {
    let mut args = Vec::new();
    let mut current = String::new();
    let mut has = false;
    let mut quoted = false;
    let mut chars = exec.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '"' => {
                quoted = !quoted;
                has = true;
            }
            '\\' if quoted => {
                if let Some(next) = chars.next() {
                    current.push(next);
                }
            }
            '%' => {
                if chars.next() == Some('%') {
                    current.push('%');
                }
            }
            c if c.is_whitespace() && !quoted => {
                if has || !current.is_empty() {
                    args.push(std::mem::take(&mut current));
                }
                has = false;
            }
            c => current.push(c),
        }
    }
    if has || !current.is_empty() {
        args.push(current);
    }
    args.retain(|a| !a.is_empty());
    args
}

/// The application folders in freedesktop order: the user's own first, then the system ones.
fn app_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    match std::env::var_os("XDG_DATA_HOME") {
        Some(home) if !home.is_empty() => dirs.push(PathBuf::from(home)),
        _ => {
            if let Some(home) = std::env::var_os("HOME") {
                dirs.push(PathBuf::from(home).join(".local/share"));
            }
        }
    }
    let system = std::env::var("XDG_DATA_DIRS").ok().filter(|s| !s.is_empty()).unwrap_or("/usr/local/share:/usr/share".into());
    dirs.extend(system.split(':').map(PathBuf::from));
    // Apps from Flathub (the Linux-apps store installs them for this user). Flatpak adds these
    // folders to XDG_DATA_DIRS only in a login shell, which the NEXUS session is not.
    if let Some(home) = std::env::var_os("HOME") {
        dirs.push(PathBuf::from(home).join(".local/share/flatpak/exports/share"));
    }
    dirs.push(PathBuf::from("/var/lib/flatpak/exports/share"));
    dirs.dedup();
    dirs.into_iter().map(|d| d.join("applications")).collect()
}

/// Every installed app by id; an earlier folder wins, as in other desktops.
fn installed() -> BTreeMap<String, Entry> {
    let mut apps = BTreeMap::new();
    for dir in app_dirs() {
        let Ok(files) = std::fs::read_dir(&dir) else { continue };
        for file in files.flatten() {
            let path = file.path();
            if path.extension().and_then(|e| e.to_str()) != Some("desktop") {
                continue;
            }
            let Some(id) = path.file_stem().and_then(|s| s.to_str()).map(str::to_string) else { continue };
            if apps.contains_key(&id) {
                continue;
            }
            let Some(entry) = std::fs::read_to_string(&path).ok().as_deref().and_then(parse_entry) else { continue };
            // NEXUS itself is already open.
            if exec_args(&entry.exec).first().is_some_and(|p| p.ends_with("nexus-desktop")) {
                continue;
            }
            apps.insert(id, entry);
        }
    }
    apps
}

#[tauri::command]
pub async fn linux_apps(webview: Webview) -> Result<Vec<LinuxApp>, String> {
    allowed(&webview)?;
    let mut list: Vec<LinuxApp> = installed()
        .into_iter()
        .map(|(id, e)| LinuxApp { id, name: e.name, comment: e.comment })
        .collect();
    list.sort_by_key(|a| a.name.to_lowercase());
    Ok(list)
}

#[tauri::command]
pub async fn linux_app_open(webview: Webview, id: String) -> Result<(), String> {
    allowed(&webview)?;
    let entry = installed().remove(&id).ok_or("App niet gevonden")?;
    let mut args = exec_args(&entry.exec);
    if args.is_empty() {
        return Err("Deze app zegt niet hoe ze start".into());
    }
    if entry.terminal {
        args.splice(0..0, ["x-terminal-emulator".to_string(), "-e".to_string()]);
    }
    std::process::Command::new(&args[0])
        .args(&args[1..])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("{} starten mislukt: {e}", entry.name))
}

/// Starts the installer (Calamares) on the live usb stick; it asks for the password itself.
#[tauri::command]
pub async fn session_install_os(webview: Webview) -> Result<(), String> {
    allowed(&webview)?;
    if !is_live() {
        return Err("NEXUS OS is al geïnstalleerd op deze computer".into());
    }
    std::process::Command::new("calamares-install-debian")
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Installatieprogramma starten mislukt: {e}"))
}

/// Logs out of the NEXUS session, or locks, sleeps, restarts or shuts down the computer.
/// systemd-logind lets the person at the computer do this without a password.
#[tauri::command]
pub async fn session_power(webview: Webview, action: String) -> Result<(), String> {
    allowed(&webview)?;
    let (program, args): (&str, &[&str]) = match action.as_str() {
        "logout" if is_session() => ("labwc", &["--exit"]),
        "suspend" => ("systemctl", &["suspend"]),
        "reboot" => ("systemctl", &["reboot"]),
        "poweroff" => ("systemctl", &["poweroff"]),
        _ => return Err("Onbekende actie".into()),
    };
    let status = std::process::Command::new(program)
        .args(args)
        .status()
        .map_err(|e| format!("Lukte niet: {e}"))?;
    if status.success() {
        Ok(())
    } else {
        Err("Lukte niet: het systeem weigerde".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_a_desktop_entry() {
        let text = "# comment\n[Desktop Entry]\nType=Application\nName=Files\nName[nl]=Bestanden\nComment=Access files\nExec=nautilus --new-window %U\nTerminal=false\n\n[Desktop Action new]\nName=New\nExec=other\n";
        let entry = parse_entry(text).unwrap();
        assert_eq!(entry.name, "Bestanden");
        assert_eq!(entry.comment, "Access files");
        assert_eq!(exec_args(&entry.exec), vec!["nautilus", "--new-window"]);
        assert!(!entry.terminal);
    }

    #[test]
    fn skips_hidden_and_non_apps() {
        assert!(parse_entry("[Desktop Entry]\nType=Application\nName=X\nExec=x\nNoDisplay=true").is_none());
        assert!(parse_entry("[Desktop Entry]\nType=Link\nName=X\nURL=https://a").is_none());
        assert!(parse_entry("[Desktop Entry]\nType=Application\nName=X").is_none());
    }

    #[test]
    fn splits_exec_lines_without_a_shell() {
        assert_eq!(exec_args(r#""/opt/My App/run" --name "a \"b\"" 100%% %f"#), vec!["/opt/My App/run", "--name", "a \"b\"", "100%"]);
        assert_eq!(exec_args("firefox; rm -rf ~"), vec!["firefox;", "rm", "-rf", "~"]);
        assert!(exec_args("  %U ").is_empty());
    }
}
