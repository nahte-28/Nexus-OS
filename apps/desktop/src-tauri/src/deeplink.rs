//! nexus:// links: opened from a browser, a shortcut or another program. The installer registers
//! the scheme (tauri.conf.json › plugins › deep-link). A second launch with a link reaches the
//! running app through the single-instance plugin. The web side decides what a link does
//! (packages/core/src/nexusLink.ts); here only links of our own scheme pass, and not huge ones.

use std::sync::Mutex;
use tauri::{App, AppHandle, Emitter, Manager, State};
use tauri_plugin_deep_link::DeepLinkExt;

pub const DEEP_LINK_EVENT: &str = "nexus-deep-link";
const MAX_LINK: usize = 4096;

/// The link NEXUS was started with, until the interface has taken it.
#[derive(Default)]
pub struct DeepLinkState(Mutex<Option<String>>);

/// The link when it is one of ours and of a sane length.
fn nexus_link(raw: &str) -> Option<String> {
    let link = raw.trim();
    let ours = link.len() <= MAX_LINK && link.get(..6).is_some_and(|scheme| scheme.eq_ignore_ascii_case("nexus:"));
    ours.then(|| link.to_string())
}

fn first_link<'a>(links: impl IntoIterator<Item = &'a str>) -> Option<String> {
    links.into_iter().find_map(nexus_link)
}

pub fn setup(app: &App, show_main: fn(&AppHandle)) -> tauri::Result<()> {
    // The installer registers nexus:// too; doing it again keeps the link pointing at this
    // nexus.exe if the app was moved. On Linux the .deb's desktop file already holds it.
    #[cfg(windows)]
    if let Err(error) = app.deep_link().register_all() {
        eprintln!("NEXUS: nexus://-links konden niet geregistreerd worden ({error})");
    }
    let started_with = app
        .deep_link()
        .get_current()
        .ok()
        .flatten()
        .and_then(|urls| first_link(urls.iter().map(|url| url.as_str())));
    if let Ok(mut pending) = app.state::<DeepLinkState>().0.lock() {
        *pending = started_with;
    }

    let handle = app.handle().clone();
    app.deep_link().on_open_url(move |event| {
        if let Some(link) = first_link(event.urls().iter().map(|url| url.as_str())) {
            show_main(&handle);
            let _ = handle.emit_to("main", DEEP_LINK_EVENT, link);
        }
    });
    Ok(())
}

/// Called once by the interface at startup: the link NEXUS was started with, if any.
#[tauri::command]
pub fn deep_link_take(state: State<'_, DeepLinkState>) -> Option<String> {
    state.0.lock().ok().and_then(|mut pending| pending.take())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_our_scheme_passes() {
        assert_eq!(nexus_link(" nexus://app/agenda "), Some("nexus://app/agenda".to_string()));
        assert_eq!(nexus_link("NEXUS://snel"), Some("NEXUS://snel".to_string()));
        assert_eq!(nexus_link("https://example.com"), None);
        assert_eq!(nexus_link("nex"), None);
        assert_eq!(nexus_link("ñexus://x"), None);
    }

    #[test]
    fn refuses_huge_links() {
        let long = format!("nexus://snel?text={}", "a".repeat(MAX_LINK));
        assert_eq!(nexus_link(&long), None);
    }

    #[test]
    fn takes_the_first_link_of_ours() {
        assert_eq!(first_link(["https://a.be", "nexus://app/notes"]), Some("nexus://app/notes".to_string()));
        assert_eq!(first_link(["https://a.be"]), None);
    }
}
