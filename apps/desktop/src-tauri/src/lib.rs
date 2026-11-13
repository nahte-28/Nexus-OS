use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, WindowEvent};

mod browser;
mod session;
mod store;
mod system;
mod update;
mod web;

/// Passed by the autostart entry, so NEXUS starts quietly in the tray at login.
const MINIMIZED_FLAG: &str = "--minimized";

fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // A second launch (e.g. from the Start menu) brings the running window back instead.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![MINIMIZED_FLAG]),
        ))
        .manage(browser::BrowserState::default())
        .invoke_handler(tauri::generate_handler![
            update::check_update,
            update::install_update,
            web::open_in_browser_command,
            browser::browser_open,
            browser::browser_tabs,
            browser::browser_select,
            browser::browser_close_tab,
            browser::browser_navigate,
            browser::browser_go,
            browser::browser_bookmark,
            browser::browser_zoom,
            browser::browser_downloads,
            browser::browser_show_download,
            browser::browser_clear_downloads,
            session::session_info,
            session::linux_apps,
            session::linux_app_open,
            session::session_power,
            system::system_wifi,
            system::system_wifi_power,
            system::system_wifi_connect,
            system::system_wifi_disconnect,
            system::system_wifi_forget,
            system::system_sound,
            system::system_volume,
            system::system_mute,
            system::system_audio_default,
            system::system_display,
            system::system_screen_set,
            system::system_brightness,
            system::system_bluetooth,
            system::system_bluetooth_power,
            system::system_bluetooth_device,
            store::store_installed,
            store::store_search,
            store::store_install,
            store::store_remove,
            store::store_update_all
        ])
        .setup(|app| {
            let open = MenuItem::with_id(app, "open", "NEXUS openen", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Afsluiten", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quit])?;
            TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().cloned().expect("app icon"))
                .tooltip("NEXUS OS")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show_main(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main(tray.app_handle());
                    }
                })
                .build(app)?;

            // The window starts hidden (see tauri.conf.json) to avoid a flash when starting minimized.
            if session::is_session() {
                // The screen resolutions chosen in Systeem, set again at every login.
                tauri::async_runtime::spawn(system::restore_screens());
                // NEXUS is the desktop: it fills the screen without a title bar, and Linux apps
                // open on top of it. Maximized rather than fullscreen, so those apps stay visible.
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_decorations(false);
                    let _ = window.maximize();
                }
                show_main(app.handle());
            } else if !std::env::args().any(|arg| arg == MINIMIZED_FLAG) {
                show_main(app.handle());
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing hides NEXUS to the tray so notifications keep arriving; quit from the tray menu.
            // The browser window really closes.
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    // In the NEXUS session there is nothing behind NEXUS to come back to.
                    if !session::is_session() {
                        let _ = window.hide();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("NEXUS OS kon niet starten");
}
