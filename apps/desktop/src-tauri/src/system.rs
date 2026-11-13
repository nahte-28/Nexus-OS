//! Systeeminstellingen on Linux: wifi (NetworkManager, nmcli), sound (PipeWire, wpctl),
//! screens (wlr-randr) with brightness (brightnessctl) and Bluetooth (bluetoothctl).
//! NEXUS calls the same command line tools a person would; nothing runs through a shell.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Webview;

/// Only the NEXUS interface itself may change the computer's settings.
fn allowed(webview: &Webview) -> Result<(), String> {
    if webview.label() == "main" {
        Ok(())
    } else {
        Err("Niet toegestaan".into())
    }
}

/// Runs a tool with English output (the parsers below read that) and returns what it printed.
async fn run(program: &str, args: &[&str]) -> Result<String, String> {
    let name = program.to_string();
    let owned: Vec<String> = args.iter().map(|a| a.to_string()).collect();
    let output = tauri::async_runtime::spawn_blocking(move || {
        std::process::Command::new(&name)
            .args(&owned)
            .env("LC_ALL", "C")
            .stdin(std::process::Stdio::null())
            .output()
    })
    .await
    .map_err(|e| format!("{program} starten mislukt: {e}"))?
    .map_err(|e| match e.kind() {
        std::io::ErrorKind::NotFound => format!("{program} is niet geïnstalleerd"),
        _ => format!("{program} starten mislukt: {e}"),
    })?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    } else {
        let err = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let out = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Err(clean_error(if err.is_empty() { &out } else { &err }))
    }
}

/// The last useful line of a tool's error, without the "Error:" prefix.
fn clean_error(text: &str) -> String {
    let line = text.lines().rev().find(|l| !l.trim().is_empty()).unwrap_or("Lukte niet").trim();
    line.strip_prefix("Error: ").unwrap_or(line).to_string()
}

// ---------------------------------------------------------------- wifi

/// Splits a line of nmcli's terse output (-t): fields end at ':', and '\:' is a colon in a value.
fn nm_fields(line: &str) -> Vec<String> {
    let mut fields = vec![String::new()];
    let mut chars = line.chars();
    while let Some(c) = chars.next() {
        match c {
            '\\' => {
                if let Some(next) = chars.next() {
                    fields.last_mut().unwrap().push(next);
                }
            }
            ':' => fields.push(String::new()),
            c => fields.last_mut().unwrap().push(c),
        }
    }
    fields
}

#[derive(Serialize, Debug, PartialEq, Clone)]
pub struct WifiNetwork {
    ssid: String,
    /// 0 to 100.
    signal: u8,
    /// True when a password is needed.
    secure: bool,
    connected: bool,
    /// True when NEXUS knows this network already (no password needed again).
    saved: bool,
}

/// Parses `nmcli -t -f IN-USE,SSID,SIGNAL,SECURITY device wifi list`. Hidden networks (no
/// name) are left out; a name seen on several access points appears once, with the best signal.
fn parse_wifi(text: &str, saved: &[String]) -> Vec<WifiNetwork> {
    let mut list: Vec<WifiNetwork> = Vec::new();
    for line in text.lines() {
        let f = nm_fields(line);
        if f.len() < 4 || f[1].is_empty() {
            continue;
        }
        let network = WifiNetwork {
            ssid: f[1].clone(),
            signal: f[2].parse().unwrap_or(0),
            secure: !f[3].trim().is_empty() && f[3].trim() != "--",
            connected: f[0].trim() == "*",
            saved: saved.contains(&f[1]),
        };
        match list.iter_mut().find(|n| n.ssid == network.ssid) {
            Some(known) => {
                known.connected |= network.connected;
                known.signal = known.signal.max(network.signal);
            }
            None => list.push(network),
        }
    }
    list.sort_by(|a, b| b.connected.cmp(&a.connected).then(b.signal.cmp(&a.signal)));
    list
}

#[derive(Serialize, Debug, PartialEq)]
pub struct NetDevice {
    device: String,
    /// wifi, ethernet, ...
    kind: String,
    connected: bool,
    connection: String,
}

/// Parses `nmcli -t -f DEVICE,TYPE,STATE,CONNECTION device`, keeping wifi and cable.
fn parse_devices(text: &str) -> Vec<NetDevice> {
    text.lines()
        .map(nm_fields)
        .filter(|f| f.len() >= 4 && (f[1] == "wifi" || f[1] == "ethernet"))
        .map(|f| NetDevice {
            device: f[0].clone(),
            kind: f[1].clone(),
            connected: f[2] == "connected",
            connection: if f[3] == "--" { String::new() } else { f[3].clone() },
        })
        .collect()
}

#[derive(Serialize)]
pub struct WifiState {
    /// False when wifi is switched off.
    enabled: bool,
    devices: Vec<NetDevice>,
    networks: Vec<WifiNetwork>,
}

/// The names of the wifi connections NetworkManager remembers.
async fn saved_wifi() -> Vec<String> {
    let text = run("nmcli", &["-t", "-f", "NAME,TYPE", "connection", "show"]).await.unwrap_or_default();
    text.lines()
        .map(nm_fields)
        .filter(|f| f.len() >= 2 && f[1] == "802-11-wireless")
        .map(|f| f[0].clone())
        .collect()
}

#[tauri::command]
pub async fn system_wifi(webview: Webview, rescan: bool) -> Result<WifiState, String> {
    allowed(&webview)?;
    let enabled = run("nmcli", &["-t", "radio", "wifi"]).await?.trim() == "enabled";
    let devices = parse_devices(&run("nmcli", &["-t", "-f", "DEVICE,TYPE,STATE,CONNECTION", "device"]).await?);
    let networks = if enabled && devices.iter().any(|d| d.kind == "wifi") {
        let saved = saved_wifi().await;
        let rescan = if rescan { "yes" } else { "auto" };
        let text = run("nmcli", &["-t", "-f", "IN-USE,SSID,SIGNAL,SECURITY", "device", "wifi", "list", "--rescan", rescan]).await?;
        parse_wifi(&text, &saved)
    } else {
        Vec::new()
    };
    Ok(WifiState { enabled, devices, networks })
}

#[tauri::command]
pub async fn system_wifi_power(webview: Webview, on: bool) -> Result<(), String> {
    allowed(&webview)?;
    run("nmcli", &["radio", "wifi", if on { "on" } else { "off" }]).await.map(|_| ())
}

#[tauri::command]
pub async fn system_wifi_connect(webview: Webview, ssid: String, password: Option<String>) -> Result<(), String> {
    allowed(&webview)?;
    let mut args = vec!["device", "wifi", "connect", ssid.as_str()];
    if let Some(password) = password.as_deref().filter(|p| !p.is_empty()) {
        args.extend(["password", password]);
    }
    run("nmcli", &args).await.map(|_| ()).map_err(|e| {
        if e.contains("Secrets were required") || e.contains("802-11-wireless-security") {
            "Verkeerd wachtwoord".into()
        } else {
            e
        }
    })
}

#[tauri::command]
pub async fn system_wifi_disconnect(webview: Webview, device: String) -> Result<(), String> {
    allowed(&webview)?;
    run("nmcli", &["device", "disconnect", device.as_str()]).await.map(|_| ())
}

/// Forgets a saved network, so its password is asked again next time.
#[tauri::command]
pub async fn system_wifi_forget(webview: Webview, ssid: String) -> Result<(), String> {
    allowed(&webview)?;
    run("nmcli", &["connection", "delete", "id", ssid.as_str()]).await.map(|_| ())
}

// ---------------------------------------------------------------- sound

#[derive(Serialize, Debug, PartialEq)]
pub struct Volume {
    /// 0 to 150 (percent; above 100 is louder than normal).
    percent: u16,
    muted: bool,
}

/// Parses `wpctl get-volume`: "Volume: 0.40" or "Volume: 0.40 [MUTED]".
fn parse_volume(text: &str) -> Option<Volume> {
    let rest = text.trim().strip_prefix("Volume:")?.trim();
    let number = rest.split_whitespace().next()?;
    let value: f32 = number.parse().ok()?;
    Some(Volume { percent: (value * 100.0).round() as u16, muted: rest.contains("[MUTED]") })
}

#[derive(Serialize, Debug, PartialEq)]
pub struct AudioDevice {
    /// The PipeWire id, for `wpctl set-default`.
    id: u32,
    name: String,
    default: bool,
}

/// Reads the Sinks (speakers) or Sources (microphones) of the Audio part of `wpctl status`:
/// lines like " │  *   46. Built-in Audio Analog Stereo [vol: 0.40]".
fn parse_audio_devices(status: &str, section: &str) -> Vec<AudioDevice> {
    let mut in_audio = false;
    let mut in_section = false;
    let mut list = Vec::new();
    for line in status.lines() {
        let plain: String = line.chars().filter(|c| !matches!(c, '│' | '├' | '└' | '─')).collect();
        let text = plain.trim();
        if !line.starts_with(' ') && !line.starts_with('│') && !text.is_empty() {
            in_audio = text == "Audio";
            in_section = false;
            continue;
        }
        if text.ends_with(':') {
            in_section = in_audio && text.trim_end_matches(':') == section;
            continue;
        }
        if !in_section || text.is_empty() {
            continue;
        }
        let default = text.starts_with('*');
        let text = text.trim_start_matches('*').trim();
        let Some((id, name)) = text.split_once(". ") else { continue };
        let Ok(id) = id.trim().parse() else { continue };
        let name = name.split(" [vol:").next().unwrap_or(name).trim().to_string();
        list.push(AudioDevice { id, name, default });
    }
    list
}

#[derive(Serialize)]
pub struct SoundState {
    output: Option<Volume>,
    input: Option<Volume>,
    outputs: Vec<AudioDevice>,
    inputs: Vec<AudioDevice>,
}

const SINK: &str = "@DEFAULT_AUDIO_SINK@";
const SOURCE: &str = "@DEFAULT_AUDIO_SOURCE@";

#[tauri::command]
pub async fn system_sound(webview: Webview) -> Result<SoundState, String> {
    allowed(&webview)?;
    let status = run("wpctl", &["status"]).await?;
    let output = run("wpctl", &["get-volume", SINK]).await.ok().as_deref().and_then(parse_volume);
    let input = run("wpctl", &["get-volume", SOURCE]).await.ok().as_deref().and_then(parse_volume);
    Ok(SoundState {
        output,
        input,
        outputs: parse_audio_devices(&status, "Sinks"),
        inputs: parse_audio_devices(&status, "Sources"),
    })
}

fn target(input: bool) -> &'static str {
    if input {
        SOURCE
    } else {
        SINK
    }
}

#[tauri::command]
pub async fn system_volume(webview: Webview, input: bool, percent: u16) -> Result<(), String> {
    allowed(&webview)?;
    let value = format!("{:.2}", f32::from(percent.min(150)) / 100.0);
    run("wpctl", &["set-volume", "-l", "1.5", target(input), &value]).await.map(|_| ())
}

#[tauri::command]
pub async fn system_mute(webview: Webview, input: bool, muted: bool) -> Result<(), String> {
    allowed(&webview)?;
    run("wpctl", &["set-mute", target(input), if muted { "1" } else { "0" }]).await.map(|_| ())
}

#[tauri::command]
pub async fn system_audio_default(webview: Webview, id: u32) -> Result<(), String> {
    allowed(&webview)?;
    run("wpctl", &["set-default", &id.to_string()]).await.map(|_| ())
}

// ---------------------------------------------------------------- screens

#[derive(Serialize, Deserialize, Debug, PartialEq, Clone)]
pub struct Mode {
    width: u32,
    height: u32,
    /// Hz.
    refresh: f64,
    #[serde(default)]
    preferred: bool,
    #[serde(default)]
    current: bool,
}

#[derive(Serialize, Deserialize, Debug, PartialEq, Clone)]
pub struct Screen {
    name: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    enabled: bool,
    #[serde(default)]
    modes: Vec<Mode>,
    #[serde(default = "one")]
    scale: f64,
}

fn one() -> f64 {
    1.0
}

/// Parses `wlr-randr --json`; one entry per resolution and refresh rate, best first.
fn parse_screens(text: &str) -> Result<Vec<Screen>, String> {
    let mut screens: Vec<Screen> = serde_json::from_str(text).map_err(|e| format!("Schermen lezen mislukt: {e}"))?;
    for screen in &mut screens {
        screen.modes.sort_by(|a, b| {
            (b.width * b.height).cmp(&(a.width * a.height)).then(b.refresh.partial_cmp(&a.refresh).unwrap_or(std::cmp::Ordering::Equal))
        });
        screen.modes.dedup_by(|a, b| a.width == b.width && a.height == b.height && (a.refresh - b.refresh).abs() < 0.01);
    }
    Ok(screens)
}

#[derive(Serialize, Deserialize, Debug, PartialEq, Clone)]
pub struct ScreenChoice {
    name: String,
    width: u32,
    height: u32,
    refresh: f64,
    scale: f64,
}

/// The wlr-randr arguments for one screen.
fn randr_args(choice: &ScreenChoice) -> Vec<String> {
    vec![
        "--output".into(),
        choice.name.clone(),
        "--mode".into(),
        format!("{}x{}@{:.3}Hz", choice.width, choice.height, choice.refresh),
        "--scale".into(),
        format!("{:.2}", choice.scale.clamp(0.5, 3.0)),
    ]
}

/// Where the chosen resolutions are kept, so the NEXUS session sets them again after logging in.
fn screens_file() -> Option<PathBuf> {
    let config = std::env::var_os("XDG_CONFIG_HOME")
        .filter(|v| !v.is_empty())
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".config")))?;
    Some(config.join("nexus").join("screens.json"))
}

fn saved_screens() -> Vec<ScreenChoice> {
    screens_file()
        .and_then(|f| std::fs::read_to_string(f).ok())
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

#[derive(Serialize)]
pub struct DisplayState {
    screens: Vec<Screen>,
    /// 0 to 100, or None without a backlight (desktop monitors, virtual machines).
    brightness: Option<u8>,
}

/// Parses `brightnessctl -m info`: "intel_backlight,backlight,400,40%,1000".
fn parse_brightness(text: &str) -> Option<u8> {
    let line = text.lines().next()?;
    let parts: Vec<&str> = line.split(',').collect();
    if parts.get(1) != Some(&"backlight") {
        return None;
    }
    parts.get(3)?.trim_end_matches('%').parse().ok()
}

#[tauri::command]
pub async fn system_display(webview: Webview) -> Result<DisplayState, String> {
    allowed(&webview)?;
    let screens = parse_screens(&run("wlr-randr", &["--json"]).await?)?;
    let brightness = run("brightnessctl", &["-m", "-c", "backlight", "info"]).await.ok().as_deref().and_then(parse_brightness);
    Ok(DisplayState { screens, brightness })
}

#[tauri::command]
pub async fn system_screen_set(webview: Webview, choice: ScreenChoice) -> Result<(), String> {
    allowed(&webview)?;
    let args = randr_args(&choice);
    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    run("wlr-randr", &refs).await?;
    let mut saved = saved_screens();
    saved.retain(|s| s.name != choice.name);
    saved.push(choice);
    if let Some(file) = screens_file() {
        if let Some(dir) = file.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        std::fs::write(&file, serde_json::to_string_pretty(&saved).unwrap_or_default()).map_err(|e| format!("Bewaren mislukt: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn system_brightness(webview: Webview, percent: u8) -> Result<(), String> {
    allowed(&webview)?;
    let value = format!("{}%", percent.clamp(5, 100));
    run("brightnessctl", &["-c", "backlight", "set", &value]).await.map(|_| ())
}

/// At the start of the NEXUS session: the resolutions chosen earlier, for screens that are there.
pub async fn restore_screens() {
    let saved = saved_screens();
    if saved.is_empty() {
        return;
    }
    let Ok(text) = run("wlr-randr", &["--json"]).await else { return };
    let Ok(screens) = parse_screens(&text) else { return };
    for choice in saved.iter().filter(|c| screens.iter().any(|s| s.name == c.name)) {
        let args = randr_args(choice);
        let refs: Vec<&str> = args.iter().map(String::as_str).collect();
        let _ = run("wlr-randr", &refs).await;
    }
}

// ---------------------------------------------------------------- bluetooth

#[derive(Serialize, Debug, PartialEq)]
pub struct BtDevice {
    address: String,
    name: String,
    paired: bool,
    connected: bool,
}

/// Parses `bluetoothctl devices [Paired|Connected]`: "Device AA:BB:CC:DD:EE:FF Name".
fn parse_bt_devices(text: &str) -> Vec<(String, String)> {
    text.lines()
        .filter_map(|l| l.trim().strip_prefix("Device "))
        .filter_map(|rest| {
            let (address, name) = rest.split_once(' ').unwrap_or((rest, ""));
            valid_address(address).then(|| (address.to_string(), name.trim().to_string()))
        })
        .collect()
}

/// A Bluetooth address like AA:BB:CC:DD:EE:FF (also guards the arguments passed to bluetoothctl).
fn valid_address(address: &str) -> bool {
    let parts: Vec<&str> = address.split(':').collect();
    parts.len() == 6 && parts.iter().all(|p| p.len() == 2 && p.chars().all(|c| c.is_ascii_hexdigit()))
}

/// Bluetooth is there and switched on, from `bluetoothctl show`.
fn parse_powered(text: &str) -> Option<bool> {
    if text.contains("No default controller") {
        return None;
    }
    let line = text.lines().find(|l| l.trim().starts_with("Powered:"))?;
    Some(line.contains("yes"))
}

#[derive(Serialize)]
pub struct BluetoothState {
    /// False when the computer has no Bluetooth.
    available: bool,
    powered: bool,
    devices: Vec<BtDevice>,
}

#[tauri::command]
pub async fn system_bluetooth(webview: Webview, scan: bool) -> Result<BluetoothState, String> {
    allowed(&webview)?;
    let show = run("bluetoothctl", &["show"]).await.unwrap_or_default();
    let Some(powered) = parse_powered(&show) else {
        return Ok(BluetoothState { available: false, powered: false, devices: Vec::new() });
    };
    if powered && scan {
        // Looks for devices nearby for a few seconds; they then appear in the list below.
        let _ = run("bluetoothctl", &["--timeout", "8", "scan", "on"]).await;
    }
    let all = parse_bt_devices(&run("bluetoothctl", &["devices"]).await.unwrap_or_default());
    let paired: Vec<String> = parse_bt_devices(&run("bluetoothctl", &["devices", "Paired"]).await.unwrap_or_default()).into_iter().map(|d| d.0).collect();
    let connected: Vec<String> = parse_bt_devices(&run("bluetoothctl", &["devices", "Connected"]).await.unwrap_or_default()).into_iter().map(|d| d.0).collect();
    let mut devices: Vec<BtDevice> = all
        .into_iter()
        // Nameless devices nearby show only their address: not useful to pick from.
        .filter(|(address, name)| paired.contains(address) || (!name.is_empty() && name.replace('-', ":") != *address))
        .map(|(address, name)| BtDevice {
            paired: paired.contains(&address),
            connected: connected.contains(&address),
            address,
            name,
        })
        .collect();
    devices.sort_by(|a, b| b.connected.cmp(&a.connected).then(b.paired.cmp(&a.paired)).then(a.name.cmp(&b.name)));
    Ok(BluetoothState { available: true, powered, devices })
}

#[tauri::command]
pub async fn system_bluetooth_power(webview: Webview, on: bool) -> Result<(), String> {
    allowed(&webview)?;
    // A blocked radio (rfkill) has to be unblocked first; ignore when rfkill is missing.
    if on {
        let _ = run("rfkill", &["unblock", "bluetooth"]).await;
    }
    run("bluetoothctl", &["power", if on { "on" } else { "off" }]).await.map(|_| ())
}

/// Pairs (once), trusts and connects a device; or disconnects or forgets it.
#[tauri::command]
pub async fn system_bluetooth_device(webview: Webview, address: String, action: String) -> Result<(), String> {
    allowed(&webview)?;
    if !valid_address(&address) {
        return Err("Ongeldig apparaat".into());
    }
    let a = address.as_str();
    match action.as_str() {
        "connect" => {
            let info = run("bluetoothctl", &["info", a]).await.unwrap_or_default();
            if !info.contains("Paired: yes") {
                run("bluetoothctl", &["--timeout", "20", "pair", a]).await.map_err(|e| format!("Koppelen mislukt: {e}"))?;
            }
            let _ = run("bluetoothctl", &["trust", a]).await;
            run("bluetoothctl", &["--timeout", "15", "connect", a]).await.map(|_| ()).map_err(|e| format!("Verbinden mislukt: {e}"))
        }
        "disconnect" => run("bluetoothctl", &["disconnect", a]).await.map(|_| ()),
        "forget" => run("bluetoothctl", &["remove", a]).await.map(|_| ()),
        _ => Err("Onbekende actie".into()),
    }
}

// ---------------------------------------------------------------- updates

#[derive(Serialize, Debug, PartialEq)]
pub struct PendingUpdate {
    package: String,
    version: String,
    from: String,
    /// From Debian's security source.
    security: bool,
}

/// Parses `apt list --upgradable`:
/// "openssl/stable-security 3.5.1-1+deb13u1 amd64 [upgradable from: 3.5.1-1]".
fn parse_upgradable(text: &str) -> Vec<PendingUpdate> {
    text.lines()
        .filter(|l| l.contains("[upgradable from:"))
        .filter_map(|l| {
            let (name, rest) = l.split_once('/')?;
            let mut parts = rest.split_whitespace();
            let suites = parts.next()?;
            let version = parts.next()?.to_string();
            let from = l.rsplit_once("[upgradable from: ")?.1.trim_end_matches(']').trim().to_string();
            Some(PendingUpdate { package: name.to_string(), version, from, security: suites.contains("security") })
        })
        .collect()
}

#[derive(Serialize)]
pub struct UpdatesState {
    pending: Vec<PendingUpdate>,
    /// A kernel or system library was updated: restart to use it.
    reboot_required: bool,
    /// When the list of updates was last refreshed (seconds since 1970), if known.
    checked_at: Option<u64>,
}

fn modified_secs(path: &str) -> Option<u64> {
    let time = std::fs::metadata(path).ok()?.modified().ok()?;
    time.duration_since(std::time::UNIX_EPOCH).ok().map(|d| d.as_secs())
}

/// The Debian and NEXUS updates waiting, from the lists apt refreshes every day by itself.
#[tauri::command]
pub async fn system_updates(webview: Webview) -> Result<UpdatesState, String> {
    allowed(&webview)?;
    let text = run("apt", &["list", "--upgradable"]).await?;
    let mut pending = parse_upgradable(&text);
    pending.sort_by(|a, b| b.security.cmp(&a.security).then(a.package.cmp(&b.package)));
    Ok(UpdatesState {
        pending,
        reboot_required: std::path::Path::new("/run/reboot-required").exists(),
        checked_at: modified_secs("/var/lib/apt/periodic/update-success-stamp").or_else(|| modified_secs("/var/lib/apt/lists")),
    })
}

/// Installs every update after one password (pkexec). When NEXUS itself was among them, NEXUS
/// starts again in the new version, like after a NEXUS update.
#[tauri::command]
pub async fn system_updates_install(app: tauri::AppHandle, webview: Webview) -> Result<(), String> {
    allowed(&webview)?;
    let before = run("dpkg-query", &["-W", "-f=${Version}", "nexus-os"]).await.unwrap_or_default();
    run("pkexec", &["/usr/libexec/nexus-system-upgrade"]).await.map_err(|e| {
        if e.contains("dismissed") || e.contains("Not authorized") || e.contains("126") {
            "Geannuleerd: zonder wachtwoord kan NEXUS geen updates installeren.".to_string()
        } else {
            format!("Updates installeren mislukt: {e}")
        }
    })?;
    let after = run("dpkg-query", &["-W", "-f=${Version}", "nexus-os"]).await.unwrap_or_default();
    if !before.is_empty() && before != after {
        if !crate::session::is_session() {
            std::process::Command::new(crate::update::installed_exe(std::env::current_exe().ok()))
                .spawn()
                .map_err(|e| format!("NEXUS opnieuw starten mislukt: {e}"))?;
        }
        app.exit(0);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_wifi_networks() {
        let text = "*:Thuis\\:5G:82:WPA2\n :Thuis\\:5G:60:WPA2\n :Gast:40:\n :::\n :School:70:WPA2 802.1X\n";
        let list = parse_wifi(text, &["School".to_string()]);
        assert_eq!(list.len(), 3);
        assert_eq!(list[0], WifiNetwork { ssid: "Thuis:5G".into(), signal: 82, secure: true, connected: true, saved: false });
        assert_eq!(list[1].ssid, "School");
        assert!(list[1].saved);
        assert!(!list[2].secure);
    }

    #[test]
    fn reads_network_devices() {
        let text = "wlan0:wifi:connected:Thuis\neth0:ethernet:unavailable:--\nlo:loopback:connected (externally):lo\n";
        let list = parse_devices(text);
        assert_eq!(list.len(), 2);
        assert!(list[0].connected);
        assert_eq!(list[1].connection, "");
    }

    #[test]
    fn reads_the_volume() {
        assert_eq!(parse_volume("Volume: 0.40\n"), Some(Volume { percent: 40, muted: false }));
        assert_eq!(parse_volume("Volume: 1.20 [MUTED]"), Some(Volume { percent: 120, muted: true }));
        assert_eq!(parse_volume("nothing"), None);
    }

    #[test]
    fn reads_speakers_and_microphones_from_wpctl_status() {
        let status = "PipeWire 'pipewire-0' [1.4.2, nexus@vm, cookie:1]\n └─ Clients:\n        33. WirePlumber\n\nAudio\n ├─ Devices:\n │      42. Built-in Audio                      [alsa]\n │  \n ├─ Sinks:\n │  *   46. Built-in Audio Analog Stereo        [vol: 0.40]\n │      51. HDMI Monitor                        [vol: 1.00]\n │  \n ├─ Sources:\n │  *   47. Built-in Audio Analog Stereo        [vol: 1.00 MUTED]\n │  \n ├─ Filters:\n │  \n └─ Streams:\n\nVideo\n ├─ Sinks:\n │      90. Not audio\n";
        let outputs = parse_audio_devices(status, "Sinks");
        assert_eq!(outputs, vec![
            AudioDevice { id: 46, name: "Built-in Audio Analog Stereo".into(), default: true },
            AudioDevice { id: 51, name: "HDMI Monitor".into(), default: false },
        ]);
        let inputs = parse_audio_devices(status, "Sources");
        assert_eq!(inputs.len(), 1);
        assert!(inputs[0].default);
    }

    #[test]
    fn reads_screens_and_builds_randr_arguments() {
        let json = r#"[{"name":"Virtual-1","description":"QEMU","enabled":true,"modes":[
            {"width":1280,"height":800,"refresh":59.81,"preferred":true,"current":true},
            {"width":1920,"height":1080,"refresh":60.0,"preferred":false,"current":false},
            {"width":1920,"height":1080,"refresh":60.0,"preferred":false,"current":false}],
            "scale":1.0,"transform":"normal"}]"#;
        let screens = parse_screens(json).unwrap();
        assert_eq!(screens[0].modes.len(), 2);
        assert_eq!(screens[0].modes[0].width, 1920);
        let args = randr_args(&ScreenChoice { name: "Virtual-1".into(), width: 1920, height: 1080, refresh: 60.0, scale: 1.25 });
        assert_eq!(args, vec!["--output", "Virtual-1", "--mode", "1920x1080@60.000Hz", "--scale", "1.25"]);
    }

    #[test]
    fn reads_brightness_only_from_a_backlight() {
        assert_eq!(parse_brightness("intel_backlight,backlight,400,40%,1000\n"), Some(40));
        assert_eq!(parse_brightness("input0::capslock,leds,0,0%,1\n"), None);
    }

    #[test]
    fn reads_bluetooth() {
        assert_eq!(parse_powered("Controller 00:11:22:33:44:55 (public)\n\tPowered: yes\n"), Some(true));
        assert_eq!(parse_powered("No default controller available\n"), None);
        let list = parse_bt_devices("Device AA:BB:CC:DD:EE:FF Koptelefoon X\nDevice 11:22:33:44:55:66 11-22-33-44-55-66\nDevice nope Bad\n");
        assert_eq!(list.len(), 2);
        assert_eq!(list[0], ("AA:BB:CC:DD:EE:FF".into(), "Koptelefoon X".into()));
        assert!(valid_address("aa:bb:cc:dd:ee:ff"));
        assert!(!valid_address("AA:BB:CC:DD:EE:FF; rm"));
    }

    #[test]
    fn reads_waiting_updates() {
        let text = "Listing...\nopenssl/stable-security 3.5.1-1+deb13u1 amd64 [upgradable from: 3.5.1-1]\nnexus-os/stable 1.0.150 amd64 [upgradable from: 1.0.148]\n";
        let list = parse_upgradable(text);
        assert_eq!(list.len(), 2);
        assert_eq!(list[0], PendingUpdate { package: "openssl".into(), version: "3.5.1-1+deb13u1".into(), from: "3.5.1-1".into(), security: true });
        assert!(!list[1].security);
    }

    #[test]
    fn shortens_tool_errors() {
        assert_eq!(clean_error("Warning: x\nError: Connection activation failed.\n"), "Connection activation failed.");
    }
}
