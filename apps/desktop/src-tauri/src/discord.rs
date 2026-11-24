//! Discord-status: shows on Discord what you play in Gaming Companion ("Speelt Valorant · NEXUS").
//! Talks to the Discord app on this computer through its local IPC (Rich Presence), so it only
//! works while Discord runs here. No account login and no token: only the NEXUS Application ID.

use serde_json::{json, Value};
use std::io::{Read, Write};
use std::sync::Mutex;

#[cfg(unix)]
type Pipe = std::os::unix::net::UnixStream;
#[cfg(windows)]
type Pipe = std::fs::File;

#[derive(Default)]
pub struct DiscordState {
    conn: Mutex<Option<(String, Pipe)>>,
}

const OP_HANDSHAKE: u32 = 0;
const OP_FRAME: u32 = 1;

/// One IPC message: opcode and length (little endian), then the JSON.
pub fn encode(op: u32, payload: &Value) -> Vec<u8> {
    let body = payload.to_string().into_bytes();
    let mut out = Vec::with_capacity(8 + body.len());
    out.extend_from_slice(&op.to_le_bytes());
    out.extend_from_slice(&(body.len() as u32).to_le_bytes());
    out.extend_from_slice(&body);
    out
}

fn read_frame(pipe: &mut Pipe) -> Result<(u32, Value), String> {
    let mut head = [0u8; 8];
    pipe.read_exact(&mut head).map_err(|e| e.to_string())?;
    let op = u32::from_le_bytes([head[0], head[1], head[2], head[3]]);
    let len = u32::from_le_bytes([head[4], head[5], head[6], head[7]]) as usize;
    if len > 64 * 1024 {
        return Err("Discord stuurde een te groot antwoord.".into());
    }
    let mut body = vec![0u8; len];
    pipe.read_exact(&mut body).map_err(|e| e.to_string())?;
    Ok((op, serde_json::from_slice(&body).unwrap_or(Value::Null)))
}

/// Where the Discord app listens: discord-ipc-0 to -9.
fn candidates() -> Vec<String> {
    #[cfg(windows)]
    {
        (0..10).map(|i| format!(r"\\?\pipe\discord-ipc-{i}")).collect()
    }
    #[cfg(unix)]
    {
        let mut dirs: Vec<String> = ["XDG_RUNTIME_DIR", "TMPDIR", "TMP", "TEMP"].iter().filter_map(|k| std::env::var(k).ok()).collect();
        dirs.push("/tmp".into());
        let mut out = Vec::new();
        for dir in dirs {
            // Also Discord from Flathub or Snap.
            for sub in ["", "app/com.discordapp.Discord/", "snap.discord/"] {
                for i in 0..10 {
                    out.push(format!("{dir}/{sub}discord-ipc-{i}"));
                }
            }
        }
        out
    }
}

fn open_pipe(path: &str) -> std::io::Result<Pipe> {
    #[cfg(windows)]
    {
        std::fs::OpenOptions::new().read(true).write(true).open(path)
    }
    #[cfg(unix)]
    {
        let pipe = Pipe::connect(path)?;
        pipe.set_read_timeout(Some(std::time::Duration::from_secs(5)))?;
        Ok(pipe)
    }
}

fn connect(client_id: &str) -> Result<Pipe, String> {
    for path in candidates() {
        let Ok(mut pipe) = open_pipe(&path) else { continue };
        pipe.write_all(&encode(OP_HANDSHAKE, &json!({ "v": 1, "client_id": client_id }))).map_err(|e| e.to_string())?;
        let (_, ready) = read_frame(&mut pipe)?;
        if ready["evt"] == "READY" {
            return Ok(pipe);
        }
        let reason = ready["message"].as_str().unwrap_or("onbekende fout").to_string();
        return Err(format!("Discord weigerde NEXUS: {reason}"));
    }
    Err("Discord draait niet op deze computer.".into())
}

/// The activity Discord shows; start is when the session began (ms), for the "verstreken" timer.
pub fn activity(details: &str, state: &str, start_ms: Option<u64>) -> Value {
    let mut a = json!({ "details": details, "assets": { "large_image": "nexus", "large_text": "NEXUS OS" } });
    if !state.is_empty() {
        a["state"] = json!(state);
    }
    if let Some(start) = start_ms {
        a["timestamps"] = json!({ "start": start / 1000 });
    }
    a
}

fn send(state: &DiscordState, client_id: &str, activity: Value) -> Result<(), String> {
    let mut guard = state.conn.lock().map_err(|_| "Discord is bezet.".to_string())?;
    for attempt in 0..2 {
        if guard.as_ref().map(|(id, _)| id != client_id).unwrap_or(true) {
            *guard = Some((client_id.to_string(), connect(client_id)?));
        }
        let (_, pipe) = guard.as_mut().expect("connected");
        let nonce = format!("nexus-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0));
        let frame = encode(OP_FRAME, &json!({ "cmd": "SET_ACTIVITY", "args": { "pid": std::process::id(), "activity": activity }, "nonce": nonce }));
        let ok = pipe.write_all(&frame).is_ok() && read_frame(pipe).map(|(op, v)| op == OP_FRAME && v["evt"] != "ERROR").unwrap_or(false);
        if ok {
            return Ok(());
        }
        // Discord restarted: connect again once.
        *guard = None;
        if attempt == 1 {
            break;
        }
    }
    Err("Discord nam de status niet aan.".into())
}

#[tauri::command]
pub async fn discord_set_activity(state: tauri::State<'_, DiscordState>, client_id: String, details: String, status: String, start_ms: Option<u64>) -> Result<(), String> {
    if client_id.is_empty() || !client_id.chars().all(|c| c.is_ascii_digit()) {
        return Err("Ongeldige Discord Application ID.".into());
    }
    send(&state, &client_id, activity(&details, &status, start_ms))
}

#[tauri::command]
pub async fn discord_clear(state: tauri::State<'_, DiscordState>) -> Result<(), String> {
    let client_id = match state.conn.lock() {
        Ok(guard) => guard.as_ref().map(|(id, _)| id.clone()),
        Err(_) => None,
    };
    match client_id {
        Some(id) => send(&state, &id, Value::Null),
        None => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frames_have_op_and_length_first() {
        let bytes = encode(1, &json!({ "a": 1 }));
        assert_eq!(&bytes[0..4], &1u32.to_le_bytes());
        assert_eq!(&bytes[4..8], &7u32.to_le_bytes());
        assert_eq!(&bytes[8..], br#"{"a":1}"#);
    }

    #[test]
    fn activity_has_the_game_and_the_start() {
        let a = activity("Speelt Valorant", "Ranked met vrienden", Some(1_700_000_000_123));
        assert_eq!(a["details"], "Speelt Valorant");
        assert_eq!(a["state"], "Ranked met vrienden");
        assert_eq!(a["timestamps"]["start"], 1_700_000_000);
        assert!(activity("x", "", None).get("state").is_none());
    }
}
