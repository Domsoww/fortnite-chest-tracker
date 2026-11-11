//! Desktop shell for Chest Tracker.
//!
//! The React app stays the single source of truth for counting and
//! statistics. This crate adds what a browser cannot do: OS-level global
//! shortcuts, a system tray, start-up registration and a real data file.
//!
//! Nothing here reads, writes or injects anything into any game. The only
//! input it receives are hotkeys the user presses themselves.

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::str::FromStr;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

const DATA_FILE: &str = "chest-tracker-data.json";
const BACKUP_FILE: &str = "chest-tracker-data.backup.json";

/* ------------------------------------------------------------------ */
/* Shared state                                                        */
/* ------------------------------------------------------------------ */

#[derive(Default)]
struct AppState {
    /// Parsed shortcut -> action name, used to resolve a hotkey press.
    /// Keyed by `Shortcut` because its text form differs from the
    /// accelerator the user typed ("CommandOrControl+Shift+1").
    shortcuts: HashMap<Shortcut, String>,
    /// Closing the window hides it instead of quitting.
    close_to_tray: bool,
    /// Set while the app is really exiting, so the hide-on-close guard stops.
    quitting: bool,
}

struct TrayHandles {
    session: MenuItem<tauri::Wry>,
    pause: MenuItem<tauri::Wry>,
    shortcuts: MenuItem<tauri::Wry>,
}

/* ------------------------------------------------------------------ */
/* Shortcut commands                                                   */
/* ------------------------------------------------------------------ */

#[derive(Debug, Deserialize)]
struct ShortcutRequest {
    action: String,
    accelerator: String,
    enabled: bool,
}

#[derive(Debug, Serialize)]
struct ShortcutResult {
    action: String,
    accelerator: String,
    registered: bool,
    error: Option<String>,
}

/// Replace every registration in one pass. Reports per-shortcut outcomes so
/// the UI can tell the user the truth instead of assuming success.
#[tauri::command]
fn apply_shortcuts(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
    bindings: Vec<ShortcutRequest>,
) -> Vec<ShortcutResult> {
    let manager = app.global_shortcut();

    // Dropping everything first keeps re-registration idempotent and avoids
    // duplicates when the same accelerator moves between actions.
    if let Err(err) = manager.unregister_all() {
        eprintln!("could not release previous shortcuts: {err}");
    }
    if let Ok(mut guard) = state.lock() {
        guard.shortcuts.clear();
    }

    let mut results = Vec::with_capacity(bindings.len());
    let mut taken: HashMap<Shortcut, String> = HashMap::new();

    for binding in bindings {
        if !binding.enabled {
            results.push(ShortcutResult {
                action: binding.action,
                accelerator: binding.accelerator,
                registered: false,
                error: None,
            });
            continue;
        }

        let parsed = match Shortcut::from_str(&binding.accelerator) {
            Ok(shortcut) => shortcut,
            Err(err) => {
                results.push(ShortcutResult {
                    action: binding.action,
                    accelerator: binding.accelerator.clone(),
                    registered: false,
                    error: Some(format!(
                        "Windows does not understand this combination ({err})"
                    )),
                });
                continue;
            }
        };

        // Two actions pointing at the same keys would make the second
        // registration fail with a confusing OS error, so say it plainly.
        if let Some(owner) = taken.get(&parsed) {
            results.push(ShortcutResult {
                action: binding.action,
                accelerator: binding.accelerator.clone(),
                registered: false,
                error: Some(format!(
                    "the same combination is already used by \"{owner}\""
                )),
            });
            continue;
        }

        match manager.register(parsed) {
            Ok(()) => {
                taken.insert(parsed, binding.action.clone());
                if let Ok(mut guard) = state.lock() {
                    guard.shortcuts.insert(parsed, binding.action.clone());
                }
                results.push(ShortcutResult {
                    action: binding.action,
                    accelerator: binding.accelerator,
                    registered: true,
                    error: None,
                });
            }
            Err(err) => results.push(ShortcutResult {
                action: binding.action,
                accelerator: binding.accelerator.clone(),
                registered: false,
                error: Some(format!("already in use by another application ({err})")),
            }),
        }
    }

    results
}

/* ------------------------------------------------------------------ */
/* Window, tray and start-up commands                                  */
/* ------------------------------------------------------------------ */

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TrayInfo {
    session_name: Option<String>,
    count: i64,
    running: bool,
    paused: bool,
    shortcuts_enabled: bool,
}

#[tauri::command]
fn update_tray(app: AppHandle, info: TrayInfo) -> Result<(), String> {
    let handles = match app.try_state::<TrayHandles>() {
        Some(handles) => handles,
        None => return Ok(()), // no tray on this platform build
    };

    let session_line = match (&info.session_name, info.running) {
        (Some(name), true) => {
            let state = if info.paused { "paused" } else { "running" };
            format!("{name} — {} chests ({state})", info.count)
        }
        _ => "No session running".to_string(),
    };
    handles.session.set_text(session_line).map_err(err_text)?;
    handles
        .pause
        .set_text(if info.paused {
            "Resume session"
        } else {
            "Pause session"
        })
        .map_err(err_text)?;
    handles.pause.set_enabled(info.running).map_err(err_text)?;
    handles
        .shortcuts
        .set_text(if info.shortcuts_enabled {
            "Disable global shortcuts"
        } else {
            "Enable global shortcuts"
        })
        .map_err(err_text)?;

    Ok(())
}

#[tauri::command]
fn set_close_to_tray(state: State<'_, Mutex<AppState>>, enabled: bool) {
    if let Ok(mut guard) = state.lock() {
        guard.close_to_tray = enabled;
    }
}

#[tauri::command]
fn show_window(app: AppHandle) {
    reveal(&app);
}

#[tauri::command]
fn quit_app(app: AppHandle, state: State<'_, Mutex<AppState>>) {
    if let Ok(mut guard) = state.lock() {
        guard.quitting = true;
    }
    app.exit(0);
}

#[tauri::command]
fn set_autostart(app: AppHandle, enabled: bool) -> Result<bool, String> {
    let manager = app.autolaunch();
    if enabled {
        manager.enable().map_err(err_text)?;
    } else {
        manager.disable().map_err(err_text)?;
    }
    manager.is_enabled().map_err(err_text)
}

#[tauri::command]
fn get_autostart(app: AppHandle) -> Result<bool, String> {
    app.autolaunch().is_enabled().map_err(err_text)
}

/* ------------------------------------------------------------------ */
/* Data file commands                                                  */
/* ------------------------------------------------------------------ */

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(err_text)?;
    fs::create_dir_all(&dir).map_err(err_text)?;
    Ok(dir)
}

#[tauri::command]
fn data_file_path(app: AppHandle) -> Result<String, String> {
    Ok(data_dir(&app)?
        .join(DATA_FILE)
        .to_string_lossy()
        .to_string())
}

#[tauri::command]
fn load_data(app: AppHandle) -> Result<Option<String>, String> {
    let dir = data_dir(&app)?;
    let primary = dir.join(DATA_FILE);
    if primary.exists() {
        return fs::read_to_string(&primary).map(Some).map_err(err_text);
    }
    // An interrupted write can leave only the backup behind.
    let backup = dir.join(BACKUP_FILE);
    if backup.exists() {
        return fs::read_to_string(&backup).map(Some).map_err(err_text);
    }
    Ok(None)
}

/// Write through a temporary file so a crash mid-write cannot shred the
/// player's history, and keep the previous version as a backup.
#[tauri::command]
fn save_data(app: AppHandle, contents: String) -> Result<(), String> {
    let dir = data_dir(&app)?;
    let target = dir.join(DATA_FILE);
    let temp = dir.join(format!("{DATA_FILE}.tmp"));

    fs::write(&temp, contents.as_bytes()).map_err(err_text)?;
    if target.exists() {
        let backup = dir.join(BACKUP_FILE);
        let _ = fs::copy(&target, &backup);
    }
    fs::rename(&temp, &target).map_err(err_text)?;
    Ok(())
}

/// Write a backup file the user can keep. WebView2 downloads are awkward to
/// steer, so the desktop build saves straight to Downloads and reports the
/// full path back to the UI.
#[tauri::command]
fn export_data(app: AppHandle, contents: String, file_name: String) -> Result<String, String> {
    let safe_name = file_name
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
        .collect::<String>();
    let name = if safe_name.is_empty() {
        "chest-tracker-export.json".to_string()
    } else {
        safe_name
    };

    let dir = match app.path().download_dir() {
        Ok(dir) => dir,
        Err(_) => data_dir(&app)?,
    };
    fs::create_dir_all(&dir).map_err(err_text)?;

    // Never clobber an earlier export from the same day.
    let mut target = dir.join(&name);
    let stem = target
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "chest-tracker-export".to_string());
    let mut counter = 2;
    while target.exists() {
        target = dir.join(format!("{stem}-{counter}.json"));
        counter += 1;
    }

    fs::write(&target, contents.as_bytes()).map_err(err_text)?;
    Ok(target.to_string_lossy().to_string())
}

#[tauri::command]
fn clear_data(app: AppHandle) -> Result<(), String> {
    let dir = data_dir(&app)?;
    for name in [DATA_FILE, BACKUP_FILE] {
        let path = dir.join(name);
        if path.exists() {
            fs::remove_file(&path).map_err(err_text)?;
        }
    }
    Ok(())
}

fn err_text<E: std::fmt::Display>(err: E) -> String {
    err.to_string()
}

/* ------------------------------------------------------------------ */
/* Setup                                                               */
/* ------------------------------------------------------------------ */

fn reveal(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Chest Tracker", true, None::<&str>)?;
    let session = MenuItem::with_id(app, "session", "No session running", false, None::<&str>)?;
    let start = MenuItem::with_id(app, "start-session", "Start session", true, None::<&str>)?;
    let pause = MenuItem::with_id(app, "toggle-pause", "Pause session", false, None::<&str>)?;
    let end = MenuItem::with_id(app, "end-session", "Finish session", true, None::<&str>)?;
    let shortcuts = MenuItem::with_id(
        app,
        "toggle-shortcuts",
        "Disable global shortcuts",
        true,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(app, "quit", "Quit Chest Tracker", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;

    let menu = Menu::with_items(
        app,
        &[
            &open, &sep1, &session, &start, &pause, &end, &sep2, &shortcuts, &quit,
        ],
    )?;

    app.manage(TrayHandles {
        session: session.clone(),
        pause: pause.clone(),
        shortcuts: shortcuts.clone(),
    });

    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("Chest Tracker")
        .menu(&menu)
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            match id {
                "open" => reveal(app),
                "quit" => {
                    if let Some(state) = app.try_state::<Mutex<AppState>>() {
                        if let Ok(mut guard) = state.lock() {
                            guard.quitting = true;
                        }
                    }
                    app.exit(0);
                }
                other => {
                    // Everything else is a request the UI must carry out,
                    // because the counter and its data live there.
                    let _ = app.emit("tray-command", serde_json::json!({ "command": other }));
                }
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::DoubleClick { .. } = event {
                reveal(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        // A second launch (e.g. from the Start menu) focuses the running copy
        // instead of starting a rival instance with its own shortcuts.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            reveal(app);
        }))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    // Only react to the press; the release would double-count.
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    let action = app.try_state::<Mutex<AppState>>().and_then(|state| {
                        state
                            .lock()
                            .ok()
                            .and_then(|guard| guard.shortcuts.get(shortcut).cloned())
                    });
                    if let Some(action) = action {
                        let _ = app.emit("chest-hotkey", serde_json::json!({ "action": action }));
                    }
                })
                .build(),
        )
        .manage(Mutex::new(AppState {
            close_to_tray: true,
            ..AppState::default()
        }))
        .invoke_handler(tauri::generate_handler![
            apply_shortcuts,
            update_tray,
            set_close_to_tray,
            show_window,
            quit_app,
            set_autostart,
            get_autostart,
            load_data,
            save_data,
            export_data,
            clear_data,
            data_file_path,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            build_tray(&handle)?;

            // Launched by Windows at sign-in: stay in the tray, out of the way.
            if std::env::args().any(|arg| arg == "--autostart") {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }

            if let Some(window) = app.get_webview_window("main") {
                let app_handle = handle.clone();
                window.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        let hide = app_handle
                            .try_state::<Mutex<AppState>>()
                            .and_then(|state| {
                                state.lock().ok().map(|g| g.close_to_tray && !g.quitting)
                            })
                            .unwrap_or(false);
                        if hide {
                            api.prevent_close();
                            if let Some(window) = app_handle.get_webview_window("main") {
                                let _ = window.hide();
                            }
                        }
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Chest Tracker");
}
