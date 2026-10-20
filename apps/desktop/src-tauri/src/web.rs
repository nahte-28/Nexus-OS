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
    WebviewWindowBuilder::new(&app, label, WebviewUrl::External(url))
        .title(title)
        .inner_size(1200.0, 820.0)
        .min_inner_size(480.0, 400.0)
        .build()
        .map(|_| ())
        .map_err(|err| err.to_string())
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
