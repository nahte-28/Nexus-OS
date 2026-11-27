//! A shortcut for the whole computer: Ctrl+Shift+Space brings NEXUS to the front and opens
//! Snelle notitie, from any program. It is the same combination as inside NEXUS. When another
//! program already owns it, registering fails quietly and NEXUS works as before.

use tauri::{App, AppHandle, Emitter};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

/// The event the web app listens for (capture/QuickCaptureHost.tsx).
pub const QUICK_CAPTURE_EVENT: &str = "nexus-quick-capture";

fn quick_capture() -> Shortcut {
    Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space)
}

pub fn setup(app: &App, show_main: fn(&AppHandle)) -> tauri::Result<()> {
    let capture = quick_capture();
    app.handle().plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(move |app, shortcut, event| {
                if shortcut == &capture && event.state() == ShortcutState::Pressed {
                    show_main(app);
                    let _ = app.emit_to("main", QUICK_CAPTURE_EVENT, ());
                }
            })
            .build(),
    )?;
    if let Err(error) = app.global_shortcut().register(quick_capture()) {
        eprintln!("NEXUS: Ctrl+Shift+Spatie is al in gebruik door een ander programma ({error})");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_ctrl_shift_space() {
        let s = quick_capture();
        assert!(s.matches(Modifiers::CONTROL | Modifiers::SHIFT, Code::Space));
        assert!(!s.matches(Modifiers::CONTROL, Code::Space));
    }
}
