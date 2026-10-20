//! Websites that NEXUS opens as an app (like KlasHub). They open in the default browser:
//! a separate NEXUS window stayed black on Windows, and the browser keeps you logged in.

use tauri::Url;

/// Only plain https addresses, without a login in the address.
fn parse(url: &str) -> Result<Url, String> {
    let url = Url::parse(url).map_err(|_| "Ongeldig adres".to_string())?;
    if url.scheme() != "https" || !url.username().is_empty() || url.password().is_some() {
        return Err("Alleen https-adressen kunnen als app openen".into());
    }
    Ok(url)
}

/// Opens the website in the default browser.
#[tauri::command]
pub fn open_in_browser_command(url: String) -> Result<(), String> {
    let url = parse(&url)?;
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_https() {
        assert!(parse("https://klashub.vercel.app/").is_ok());
        assert!(parse("http://klashub.vercel.app").is_err());
        assert!(parse("https://a:b@klashub.vercel.app").is_err());
        assert!(parse("javascript:alert(1)").is_err());
    }
}
