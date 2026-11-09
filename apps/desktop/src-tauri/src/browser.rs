//! NEXUS Browser on Windows: one window with a NEXUS toolbar on top (address bar, tabs,
//! back/forward, bookmarks) and one webview per tab below it. Sites run in their own webviews
//! without access to NEXUS: only the toolbar (a NEXUS page) and the main window may call these
//! commands. Needs Tauri's multi-webview support (feature "unstable").
//! Per tab it also keeps the zoom level, and it lists what the tabs downloaded (to the usual
//! Downloads folder) so NEXUS can show them.

use std::path::PathBuf;
use std::sync::Mutex;

use serde::Serialize;
use tauri::webview::{DownloadEvent, NewWindowResponse, PageLoadEvent};
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Url, Webview, WebviewBuilder, WebviewUrl, WindowBuilder, WindowEvent};

pub const WINDOW: &str = "browser";
pub const CHROME: &str = "browser-chrome";
/// Height of the NEXUS toolbar: tabs, address bar and bookmarks.
const CHROME_HEIGHT: f64 = 108.0;
const MAX_TABS: usize = 20;
const MAX_DOWNLOADS: usize = 20;
const ZOOM_MIN: f64 = 0.3;
const ZOOM_MAX: f64 = 3.0;

#[derive(Clone, Serialize)]
pub struct Tab {
    pub id: u32,
    pub url: String,
    pub title: String,
    pub loading: bool,
    /// 1.0 is 100 %.
    pub zoom: f64,
}

#[derive(Clone, Serialize, Default)]
pub struct Tabs {
    pub tabs: Vec<Tab>,
    pub active: Option<u32>,
}

#[derive(Default)]
pub struct BrowserState {
    next_id: Mutex<u32>,
    tabs: Mutex<Tabs>,
    downloads: Mutex<Vec<Download>>,
}

#[derive(Clone, Serialize)]
pub struct Download {
    pub id: u32,
    pub url: String,
    /// The file name only; the folder stays on this pc.
    pub file: String,
    /// "busy", "done" or "failed".
    pub state: &'static str,
    #[serde(skip)]
    path: PathBuf,
}

/// The next zoom step for "in", "out" or "reset", within 30 % and 300 %.
pub fn zoom_step(current: f64, action: &str) -> Option<f64> {
    let next = match action {
        "in" => current + 0.1,
        "out" => current - 0.1,
        "reset" => 1.0,
        _ => return None,
    };
    Some(((next * 10.0).round() / 10.0).clamp(ZOOM_MIN, ZOOM_MAX))
}

fn label(id: u32) -> String {
    format!("browser-tab-{id}")
}

/// Only http(s) without a login in the address; the toolbar decides between search and address.
pub fn parse(url: &str) -> Result<Url, String> {
    let url = Url::parse(url).map_err(|_| "Ongeldig adres".to_string())?;
    if !matches!(url.scheme(), "https" | "http") || !url.username().is_empty() || url.password().is_some() {
        return Err("Alleen http- en https-adressen".into());
    }
    Ok(url)
}

/// Only NEXUS itself (main window or the toolbar) may steer the browser, never a site in a tab.
fn allowed(caller: &Webview) -> Result<(), String> {
    if caller.label() == "main" || caller.label() == CHROME {
        Ok(())
    } else {
        Err("Niet toegestaan".into())
    }
}

fn publish(app: &AppHandle) {
    let state = app.state::<BrowserState>();
    let tabs = state.tabs.lock().unwrap().clone();
    let _ = app.emit_to(CHROME, "browser-tabs", tabs);
}

fn update_tab(app: &AppHandle, id: u32, change: impl FnOnce(&mut Tab)) {
    {
        let state = app.state::<BrowserState>();
        let mut tabs = state.tabs.lock().unwrap();
        if let Some(tab) = tabs.tabs.iter_mut().find(|t| t.id == id) {
            change(tab);
        }
    }
    publish(app);
}

/// The area below the toolbar, in logical pixels.
fn content_area(app: &AppHandle) -> (f64, f64) {
    let Some(window) = app.get_window(WINDOW) else { return (1200.0, 800.0 - CHROME_HEIGHT) };
    let scale = window.scale_factor().unwrap_or(1.0);
    let size = window.inner_size().map(|s| s.to_logical::<f64>(scale)).unwrap_or(LogicalSize::new(1200.0, 800.0));
    (size.width, (size.height - CHROME_HEIGHT).max(0.0))
}

fn layout(app: &AppHandle) {
    let (width, height) = content_area(app);
    if let Some(chrome) = app.get_webview(CHROME) {
        let _ = chrome.set_bounds(tauri::Rect { position: LogicalPosition::new(0.0, 0.0).into(), size: LogicalSize::new(width, CHROME_HEIGHT).into() });
    }
    let active = app.state::<BrowserState>().tabs.lock().unwrap().active;
    let ids: Vec<u32> = app.state::<BrowserState>().tabs.lock().unwrap().tabs.iter().map(|t| t.id).collect();
    for id in ids {
        if let Some(view) = app.get_webview(&label(id)) {
            let _ = view.set_bounds(tauri::Rect { position: LogicalPosition::new(0.0, CHROME_HEIGHT).into(), size: LogicalSize::new(width, height).into() });
            let _ = if Some(id) == active { view.show() } else { view.hide() };
        }
    }
}

/// The browser window with its toolbar, created on first use.
fn ensure_window(app: &AppHandle) -> Result<tauri::Window, String> {
    if let Some(window) = app.get_window(WINDOW) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(window);
    }
    let window = WindowBuilder::new(app, WINDOW)
        .title("NEXUS Browser")
        .inner_size(1200.0, 820.0)
        .min_inner_size(520.0, 360.0)
        .center()
        .build()
        .map_err(|e| format!("Browservenster openen mislukt: {e}"))?;
    let chrome = WebviewBuilder::new(CHROME, WebviewUrl::App("browser.html".into()));
    window
        .add_child(chrome, LogicalPosition::new(0.0, 0.0), LogicalSize::new(1200.0, CHROME_HEIGHT))
        .map_err(|e| format!("Werkbalk laden mislukt: {e}"))?;
    let handle = app.clone();
    window.on_window_event(move |event| match event {
        WindowEvent::Resized(_) | WindowEvent::ScaleFactorChanged { .. } => layout(&handle),
        WindowEvent::Destroyed => {
            let state = handle.state::<BrowserState>();
            *state.tabs.lock().unwrap() = Tabs::default();
        }
        _ => {}
    });
    Ok(window)
}

fn publish_downloads(app: &AppHandle) {
    let list = app.state::<BrowserState>().downloads.lock().unwrap().clone();
    let _ = app.emit_to(CHROME, "browser-downloads", list.clone());
    let _ = app.emit_to("main", "browser-downloads", list);
}

fn download_started(app: &AppHandle, url: String, file: String, path: PathBuf) {
    {
        let state = app.state::<BrowserState>();
        let id = {
            let mut next = state.next_id.lock().unwrap();
            *next += 1;
            *next
        };
        let mut list = state.downloads.lock().unwrap();
        list.insert(0, Download { id, url, file, state: "busy", path });
        list.truncate(MAX_DOWNLOADS);
    }
    publish_downloads(app);
}

fn download_finished(app: &AppHandle, url: &str, path: Option<PathBuf>, success: bool) {
    {
        let state = app.state::<BrowserState>();
        let mut list = state.downloads.lock().unwrap();
        if let Some(d) = list.iter_mut().find(|d| d.url == url && d.state == "busy") {
            d.state = if success { "done" } else { "failed" };
            if let Some(path) = path {
                if let Some(name) = path.file_name() {
                    d.file = name.to_string_lossy().into_owned();
                }
                d.path = path;
            }
        }
    }
    publish_downloads(app);
}

fn new_tab(app: &AppHandle, url: Url) -> Result<u32, String> {
    let window = ensure_window(app)?;
    let state = app.state::<BrowserState>();
    if state.tabs.lock().unwrap().tabs.len() >= MAX_TABS {
        return Err(format!("Hoogstens {MAX_TABS} tabbladen"));
    }
    let id = {
        let mut next = state.next_id.lock().unwrap();
        *next += 1;
        *next
    };
    let (width, height) = content_area(app);
    let on_load = app.clone();
    let on_title = app.clone();
    let on_popup = app.clone();
    let on_download = app.clone();
    let builder = WebviewBuilder::new(label(id), WebviewUrl::External(url.clone()))
        // Only web pages in a tab; mailto:, file: and the like are not followed.
        .on_navigation(|url| matches!(url.scheme(), "https" | "http" | "about" | "blob"))
        .on_page_load(move |_view, payload| {
            let url = payload.url().to_string();
            let loading = matches!(payload.event(), PageLoadEvent::Started);
            update_tab(&on_load, id, |tab| {
                tab.url = url;
                tab.loading = loading;
            });
        })
        .on_document_title_changed(move |_view, title| update_tab(&on_title, id, |tab| tab.title = title))
        .on_download(move |_view, event| {
            match event {
                DownloadEvent::Requested { url, destination } => {
                    let file = destination.file_name().map(|f| f.to_string_lossy().into_owned()).unwrap_or_else(|| "download".into());
                    download_started(&on_download, url.to_string(), file, destination.clone());
                }
                DownloadEvent::Finished { url, path, success } => download_finished(&on_download, url.as_str(), path, success),
                _ => {}
            }
            true
        })
        // A link that opens a new window becomes a new tab.
        .on_new_window(move |url, _features| {
            if matches!(url.scheme(), "https" | "http") {
                let app = on_popup.clone();
                let _ = on_popup.run_on_main_thread(move || {
                    let _ = new_tab(&app, url).map(|id| select(&app, id));
                });
            }
            NewWindowResponse::Deny
        });
    window
        .add_child(builder, LogicalPosition::new(0.0, CHROME_HEIGHT), LogicalSize::new(width, height))
        .map_err(|e| format!("Tabblad openen mislukt: {e}"))?;
    {
        let mut tabs = state.tabs.lock().unwrap();
        tabs.tabs.push(Tab { id, url: url.to_string(), title: String::new(), loading: true, zoom: 1.0 });
        tabs.active = Some(id);
    }
    layout(app);
    publish(app);
    Ok(id)
}

fn select(app: &AppHandle, id: u32) {
    {
        let state = app.state::<BrowserState>();
        let mut tabs = state.tabs.lock().unwrap();
        if tabs.tabs.iter().any(|t| t.id == id) {
            tabs.active = Some(id);
        }
    }
    layout(app);
    publish(app);
}

fn active_view(app: &AppHandle) -> Result<Webview, String> {
    let active = app.state::<BrowserState>().tabs.lock().unwrap().active.ok_or("Geen tabblad open")?;
    app.get_webview(&label(active)).ok_or_else(|| "Tabblad niet gevonden".to_string())
}

// The commands are async on purpose: a sync command runs on the main thread, and creating a
// window or webview there deadlocks WebView2 on Windows, which left the browser window white.

/// Opens [url] in a new tab of the NEXUS Browser (and the window, when it is not open yet).
#[tauri::command]
pub async fn browser_open(app: AppHandle, webview: Webview, url: String) -> Result<u32, String> {
    allowed(&webview)?;
    new_tab(&app, parse(&url)?)
}

#[tauri::command]
pub async fn browser_tabs(app: AppHandle, webview: Webview) -> Result<Tabs, String> {
    allowed(&webview)?;
    Ok(app.state::<BrowserState>().tabs.lock().unwrap().clone())
}

#[tauri::command]
pub async fn browser_select(app: AppHandle, webview: Webview, id: u32) -> Result<(), String> {
    allowed(&webview)?;
    select(&app, id);
    Ok(())
}

#[tauri::command]
pub async fn browser_close_tab(app: AppHandle, webview: Webview, id: u32) -> Result<(), String> {
    allowed(&webview)?;
    if let Some(view) = app.get_webview(&label(id)) {
        let _ = view.close();
    }
    let empty = {
        let state = app.state::<BrowserState>();
        let mut tabs = state.tabs.lock().unwrap();
        let index = tabs.tabs.iter().position(|t| t.id == id);
        tabs.tabs.retain(|t| t.id != id);
        if tabs.active == Some(id) {
            let next = index.map(|i| i.min(tabs.tabs.len().saturating_sub(1)));
            tabs.active = next.and_then(|i| tabs.tabs.get(i)).map(|t| t.id);
        }
        tabs.tabs.is_empty()
    };
    if empty {
        // The last tab closes the window, like other browsers.
        if let Some(window) = app.get_window(WINDOW) {
            let _ = window.close();
        }
        return Ok(());
    }
    layout(&app);
    publish(&app);
    Ok(())
}

/// Goes to [url] in the open tab, or opens a tab when there is none.
#[tauri::command]
pub async fn browser_navigate(app: AppHandle, webview: Webview, url: String) -> Result<(), String> {
    allowed(&webview)?;
    let url = parse(&url)?;
    match active_view(&app) {
        Ok(view) => view.navigate(url).map_err(|e| e.to_string()),
        Err(_) => new_tab(&app, url).map(|_| ()),
    }
}

/// "back", "forward" or "reload" in the open tab.
#[tauri::command]
pub async fn browser_go(app: AppHandle, webview: Webview, action: String) -> Result<(), String> {
    allowed(&webview)?;
    let view = active_view(&app)?;
    match action.as_str() {
        "back" => view.eval("history.back()").map_err(|e| e.to_string()),
        "forward" => view.eval("history.forward()").map_err(|e| e.to_string()),
        "reload" => view.reload().map_err(|e| e.to_string()),
        _ => Err("Onbekende actie".into()),
    }
}

/// "in", "out" or "reset" for the zoom of the open tab; returns the new zoom (1.0 is 100 %).
#[tauri::command]
pub async fn browser_zoom(app: AppHandle, webview: Webview, action: String) -> Result<f64, String> {
    allowed(&webview)?;
    let view = active_view(&app)?;
    let id = app.state::<BrowserState>().tabs.lock().unwrap().active.ok_or("Geen tabblad open")?;
    let current = app.state::<BrowserState>().tabs.lock().unwrap().tabs.iter().find(|t| t.id == id).map(|t| t.zoom).unwrap_or(1.0);
    let zoom = zoom_step(current, &action).ok_or("Onbekende actie")?;
    view.set_zoom(zoom).map_err(|e| e.to_string())?;
    update_tab(&app, id, |tab| tab.zoom = zoom);
    Ok(zoom)
}

#[tauri::command]
pub async fn browser_downloads(app: AppHandle, webview: Webview) -> Result<Vec<Download>, String> {
    allowed(&webview)?;
    Ok(app.state::<BrowserState>().downloads.lock().unwrap().clone())
}

/// Shows a finished download in its folder. Downloaded files are never started from NEXUS.
#[tauri::command]
pub async fn browser_show_download(app: AppHandle, webview: Webview, id: u32) -> Result<(), String> {
    allowed(&webview)?;
    let path = app
        .state::<BrowserState>()
        .downloads
        .lock()
        .unwrap()
        .iter()
        .find(|d| d.id == id && d.state == "done")
        .map(|d| d.path.clone())
        .ok_or("Download niet gevonden")?;
    show_in_folder(&path)
}

#[cfg(windows)]
fn show_in_folder(path: &std::path::Path) -> Result<(), String> {
    let mut arg = std::ffi::OsString::from("/select,");
    arg.push(path.as_os_str());
    std::process::Command::new("explorer").arg(arg).spawn().map(|_| ()).map_err(|e| e.to_string())
}

#[cfg(not(windows))]
fn show_in_folder(_path: &std::path::Path) -> Result<(), String> {
    Err("Alleen in de Windows-app".into())
}

#[tauri::command]
pub async fn browser_clear_downloads(app: AppHandle, webview: Webview) -> Result<(), String> {
    allowed(&webview)?;
    app.state::<BrowserState>().downloads.lock().unwrap().retain(|d| d.state == "busy");
    publish_downloads(&app);
    Ok(())
}

/// The toolbar asks the main window to save a bookmark there, so it syncs with the account.
#[tauri::command]
pub async fn browser_bookmark(app: AppHandle, webview: Webview, url: String, title: String) -> Result<(), String> {
    allowed(&webview)?;
    let url = parse(&url)?;
    let title: String = title.chars().take(80).collect();
    app.emit_to("main", "browser-bookmark", BookmarkPayload { url: url.to_string(), title }).map_err(|e| e.to_string())
}

#[derive(Clone, Serialize)]
struct BookmarkPayload {
    url: String,
    title: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn opens_only_web_addresses() {
        assert!(parse("https://vrt.be/nws").is_ok());
        assert!(parse("http://localhost:5173/").is_ok());
        assert!(parse("file:///C:/Windows").is_err());
        assert!(parse("javascript:alert(1)").is_err());
        assert!(parse("https://a:b@vrt.be").is_err());
    }

    #[test]
    fn zooms_in_steps_within_limits() {
        assert_eq!(zoom_step(1.0, "in"), Some(1.1));
        assert_eq!(zoom_step(1.0, "out"), Some(0.9));
        assert_eq!(zoom_step(2.95, "in"), Some(3.0));
        assert_eq!(zoom_step(0.3, "out"), Some(0.3));
        assert_eq!(zoom_step(1.7, "reset"), Some(1.0));
        assert_eq!(zoom_step(1.0, "sideways"), None);
    }
}
