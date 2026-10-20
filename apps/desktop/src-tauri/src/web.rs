//! Websites that NEXUS opens as their own app (like KlasHub), each in a separate window.
//! These windows only show the website: they get none of the NEXUS permissions.

use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder};

/// A window label per website, so opening it again brings the same window back.
fn label_for(url: &Url) -> Option<String> {
    let host = url.host_str()?;
    Some(format!("web-{}", host.replace(|c: char| !c.is_ascii_alphanumeric(), "-")))
}

/// Only plain https addresses, without a login in the address.
fn parse(url: &str) -> Result<Url, String> {
    let url = Url::parse(url).map_err(|_| "Ongeldig adres".to_string())?;
    if url.scheme() != "https" || !url.username().is_empty() || url.password().is_some() {
        return Err("Alleen https-adressen kunnen als app openen".into());
    }
    Ok(url)
}

/// Opens the address in the default browser. Only called with an address that passed [parse].
fn open_in_browser(url: &Url) -> Result<(), String> {
    #[cfg(windows)]
    let mut command = {
        // No shell in between, so characters like & in the address are not interpreted.
        let mut c = std::process::Command::new("rundll32");
        c.args(["url.dll,FileProtocolHandler", url.as_str()]);
        c
    };
    #[cfg(not(windows))]
    let mut command = {
        let mut c = std::process::Command::new("xdg-open");
        c.arg(url.as_str());
        c
    };
    command.spawn().map(|_| ()).map_err(|err| format!("Browser openen mislukt: {err}"))
}

/// Opens a website in the default browser, when its own window does not work.
#[tauri::command]
pub fn open_in_browser_command(url: String) -> Result<(), String> {
    open_in_browser(&parse(&url)?)
}

// Async so the window is built off the main thread; a sync command would deadlock on Windows.
#[tauri::command]
pub async fn open_web_window(app: AppHandle, url: String, title: String) -> Result<(), String> {
    let url = parse(&url)?;
    let label = label_for(&url).ok_or("Ongeldig adres")?;
    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }
    let built = WebviewWindowBuilder::new(&app, label, WebviewUrl::External(url.clone()))
        .title(title)
        .inner_size(1200.0, 820.0)
        .min_inner_size(480.0, 400.0)
        .build();
    match built {
        Ok(_) => Ok(()),
        // The website still opens, just in the browser instead of its own window.
        Err(err) => open_in_browser(&url).map_err(|browser| format!("{err}; {browser}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_https_and_names_windows_by_host() {
        let url = parse("https://klashub.vercel.app/").unwrap();
        assert_eq!(label_for(&url).unwrap(), "web-klashub-vercel-app");
        assert!(parse("http://klashub.vercel.app").is_err());
        assert!(parse("https://a:b@klashub.vercel.app").is_err());
        assert!(parse("javascript:alert(1)").is_err());
    }
}
