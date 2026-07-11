mod desktop;

use desktop::{
  desktop_launch_tool,
  desktop_operator_action,
  desktop_operator_overview,
  desktop_recent_files,
  desktop_runtime_info,
  desktop_session_action,
  desktop_sessions,
  OperatorClientState,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(OperatorClientState::from_environment())
    .invoke_handler(tauri::generate_handler![
      desktop_runtime_info,
      desktop_recent_files,
      desktop_sessions,
      desktop_session_action,
      desktop_operator_action,
      desktop_operator_overview,
      desktop_launch_tool
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
