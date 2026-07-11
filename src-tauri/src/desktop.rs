use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
  collections::BTreeMap,
  env,
  fs,
  io::Write,
  path::{Path, PathBuf},
  process::{Command, Stdio},
  time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::State;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopRuntimeInfo {
  available: bool,
  platform: String,
  local_workspace: String,
  local_session_root: String,
  operator_configured: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentFile {
  name: String,
  path: String,
  modified_unix_ms: u128,
  size: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
  label: String,
  avatar_name: Option<String>,
  captured_at: Option<String>,
  cookie_length: usize,
  fingerprint: String,
  has_jsessionid: bool,
  has_swsid: bool,
  ready: bool,
  source: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionProfileSummary {
  id: String,
  label: String,
  avatar_name: Option<String>,
  captured_at: Option<String>,
  cookie_length: usize,
  fingerprint: String,
  ready: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionPanel {
  ok: bool,
  current: SessionSummary,
  profiles: Vec<SessionProfileSummary>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionActionPayload {
  label: Option<String>,
  avatar_name: Option<String>,
  id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopActionResult {
  ok: bool,
  message: String,
}

#[derive(Debug, Deserialize)]
struct SessionProfileFile {
  id: Option<String>,
  label: Option<String>,
  avatar_name: Option<String>,
  captured_at: Option<String>,
  cookie: String,
}

#[derive(Debug, Deserialize, Serialize)]
struct SessionMetadata {
  label: Option<String>,
  avatar_name: Option<String>,
  avatar: Option<String>,
  captured_at: Option<String>,
  updated_at: Option<String>,
}

#[derive(Debug, Clone)]
pub struct OperatorClientState {
  client: Client,
  base_url: String,
  token: String,
}

impl OperatorClientState {
  pub fn from_environment() -> Self {
    let base_url = env::var("SMALLVERSE_OPERATOR_API_URL")
      .unwrap_or_else(|_| "http://127.0.0.1:8781".to_string())
      .trim_end_matches('/')
      .to_string();

    let token = env::var("SMALLVERSE_OPERATOR_TOKEN")
      .unwrap_or_default()
      .trim()
      .to_string();

    let client = Client::builder()
      .redirect(reqwest::redirect::Policy::none())
      .connect_timeout(Duration::from_secs(5))
      .timeout(Duration::from_secs(30))
      .build()
      .expect("could not build the operator HTTP client");

    Self {
      client,
      base_url,
      token,
    }
  }

  fn configured(&self) -> bool {
    !self.token.is_empty()
  }

  async fn request(
    &self,
    method: reqwest::Method,
    path: &str,
    body: Option<Value>,
  ) -> Result<Value, String> {
    if !self.configured() {
      return Err(
        "Operator access is not configured. Start the desktop app with SMALLVERSE_OPERATOR_TOKEN set."
          .to_string(),
      );
    }

    if !path.starts_with('/') || path.contains("..") {
      return Err("Invalid operator API path.".to_string());
    }

    let url = format!("{}{}", self.base_url, path);
    let mut request = self
      .client
      .request(method, &url)
      .bearer_auth(&self.token)
      .header("accept", "application/json");

    if let Some(payload) = body {
      request = request.json(&payload);
    }

    let response = request
      .send()
      .await
      .map_err(|error| format!("Operator API request failed: {error}"))?;

    let status = response.status();
    let payload: Value = response
      .json()
      .await
      .map_err(|error| format!("Operator API returned invalid JSON: {error}"))?;

    if !status.is_success() {
      let message = payload
        .pointer("/error/message")
        .and_then(Value::as_str)
        .unwrap_or("Operator API request failed.");
      return Err(format!("{message} (HTTP {})", status.as_u16()));
    }

    Ok(payload)
  }
}

fn home_dir() -> Result<PathBuf, String> {
  if cfg!(windows) {
    env::var_os("USERPROFILE")
      .map(PathBuf::from)
      .ok_or_else(|| "Could not resolve the user profile directory.".to_string())
  } else {
    env::var_os("HOME")
      .map(PathBuf::from)
      .ok_or_else(|| "Could not resolve the home directory.".to_string())
  }
}

fn local_workspace() -> Result<PathBuf, String> {
  if let Some(value) = env::var_os("SMALLVERSE_LOCAL_WORKSPACE") {
    return Ok(PathBuf::from(value));
  }

  Ok(home_dir()?.join("SmallverseLab"))
}

fn local_session_root() -> Result<PathBuf, String> {
  if let Some(value) = env::var_os("SMALLVERSE_LOCAL_SESSION_ROOT") {
    return Ok(PathBuf::from(value));
  }

  Ok(local_workspace()?.join("session"))
}

fn now_iso() -> String {
  time::OffsetDateTime::now_utc()
    .format(&time::format_description::well_known::Rfc3339)
    .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string())
}

fn cookie_value(cookie: &str, name: &str) -> String {
  cookie
    .split(';')
    .map(str::trim)
    .find_map(|part| {
      let (key, value) = part.split_once('=')?;
      if key == name {
        Some(value.trim().to_string())
      } else {
        None
      }
    })
    .unwrap_or_default()
}

fn fingerprint(cookie: &str) -> (String, bool, bool) {
  let jsessionid = cookie_value(cookie, "JSESSIONID");
  let swsid = cookie_value(cookie, "SWSID");
  let short = if jsessionid.is_empty() {
    "none".to_string()
  } else {
    let start = jsessionid.chars().take(6).collect::<String>();
    let end = jsessionid
      .chars()
      .rev()
      .take(4)
      .collect::<String>()
      .chars()
      .rev()
      .collect::<String>();
    format!("{start}…{end}")
  };

  (short, !jsessionid.is_empty(), !swsid.is_empty())
}

fn safe_profile_id(value: &str) -> Option<String> {
  let normalized = value
    .trim()
    .to_ascii_lowercase()
    .chars()
    .map(|character| {
      if character.is_ascii_alphanumeric() {
        character
      } else {
        '-'
      }
    })
    .collect::<String>();

  let collapsed = normalized
    .split('-')
    .filter(|part| !part.is_empty())
    .collect::<Vec<_>>()
    .join("-");

  if collapsed.is_empty() || collapsed.len() > 80 {
    None
  } else {
    Some(collapsed)
  }
}

fn validate_profile_id(value: &str) -> bool {
  !value.is_empty()
    && value.len() <= 80
    && value
      .chars()
      .all(|character| character.is_ascii_alphanumeric() || character == '-')
}

fn read_optional(path: &Path) -> String {
  fs::read_to_string(path)
    .unwrap_or_default()
    .trim()
    .to_string()
}

fn write_private(path: &Path, value: &str) -> Result<(), String> {
  let parent = path
    .parent()
    .ok_or_else(|| "Invalid destination path.".to_string())?;
  fs::create_dir_all(parent)
    .map_err(|error| format!("Could not create {}: {error}", parent.display()))?;

  let temporary = path.with_extension(format!(
    "partial-{}-{}",
    std::process::id(),
    SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .unwrap_or_default()
      .as_nanos()
  ));

  #[cfg(unix)]
  {
    use std::os::unix::fs::OpenOptionsExt;
    let mut file = fs::OpenOptions::new()
      .create_new(true)
      .write(true)
      .mode(0o600)
      .open(&temporary)
      .map_err(|error| format!("Could not create {}: {error}", temporary.display()))?;
    file
      .write_all(value.as_bytes())
      .map_err(|error| format!("Could not write {}: {error}", temporary.display()))?;
  }

  #[cfg(not(unix))]
  {
    fs::write(&temporary, value)
      .map_err(|error| format!("Could not write {}: {error}", temporary.display()))?;
  }

  fs::rename(&temporary, path)
    .map_err(|error| format!("Could not replace {}: {error}", path.display()))?;

  Ok(())
}

fn current_session() -> Result<SessionSummary, String> {
  let root = local_session_root()?;
  fs::create_dir_all(root.join("profiles"))
    .map_err(|error| format!("Could not create session directory: {error}"))?;

  let cookie = read_optional(&root.join("cookie.txt"));
  let metadata: SessionMetadata = fs::read_to_string(root.join("session.json"))
    .ok()
    .and_then(|value| serde_json::from_str(&value).ok())
    .unwrap_or(SessionMetadata {
      label: None,
      avatar_name: None,
      avatar: None,
      captured_at: None,
      updated_at: None,
    });

  let (short, has_jsessionid, has_swsid) = fingerprint(&cookie);
  let label = metadata
    .label
    .clone()
    .or_else(|| metadata.avatar_name.clone())
    .or_else(|| metadata.avatar.clone())
    .unwrap_or_else(|| "Unknown avatar".to_string());

  Ok(SessionSummary {
    label,
    avatar_name: metadata.avatar_name.or(metadata.avatar),
    captured_at: metadata.captured_at.or(metadata.updated_at),
    cookie_length: cookie.len(),
    fingerprint: short,
    has_jsessionid,
    has_swsid,
    ready: has_jsessionid && has_swsid,
    source: if cookie.is_empty() {
      "missing".to_string()
    } else {
      "local cookie.txt".to_string()
    },
  })
}

fn profile_summaries() -> Result<Vec<SessionProfileSummary>, String> {
  let profiles_root = local_session_root()?.join("profiles");
  fs::create_dir_all(&profiles_root)
    .map_err(|error| format!("Could not create profile directory: {error}"))?;

  let mut profiles = Vec::new();

  for entry in fs::read_dir(&profiles_root)
    .map_err(|error| format!("Could not read profile directory: {error}"))?
  {
    let entry = match entry {
      Ok(value) => value,
      Err(_) => continue,
    };
    let path = entry.path();

    if path.extension().and_then(|value| value.to_str()) != Some("json") {
      continue;
    }

    let value = match fs::read_to_string(&path)
      .ok()
      .and_then(|text| serde_json::from_str::<SessionProfileFile>(&text).ok())
    {
      Some(value) => value,
      None => continue,
    };

    let id = value.id.or_else(|| {
      path
        .file_stem()
        .and_then(|value| value.to_str())
        .map(str::to_string)
    });

    let Some(id) = id else {
      continue;
    };

    if !validate_profile_id(&id) {
      continue;
    }

    let (short, has_jsessionid, has_swsid) = fingerprint(&value.cookie);
    profiles.push(SessionProfileSummary {
      id,
      label: value
        .label
        .clone()
        .or_else(|| value.avatar_name.clone())
        .unwrap_or_else(|| "Session".to_string()),
      avatar_name: value.avatar_name,
      captured_at: value.captured_at,
      cookie_length: value.cookie.len(),
      fingerprint: short,
      ready: has_jsessionid && has_swsid,
    });
  }

  profiles.sort_by(|left, right| {
    right
      .captured_at
      .as_deref()
      .unwrap_or("")
      .cmp(left.captured_at.as_deref().unwrap_or(""))
  });

  Ok(profiles)
}

fn save_current_session(
  payload: &SessionActionPayload,
) -> Result<DesktopActionResult, String> {
  let root = local_session_root()?;
  let cookie = read_optional(&root.join("cookie.txt"));

  if cookie.is_empty() {
    return Err("No current session cookie exists to save.".to_string());
  }

  let label = payload
    .label
    .as_deref()
    .map(str::trim)
    .filter(|value| !value.is_empty())
    .unwrap_or("Session");
  let id = safe_profile_id(label)
    .ok_or_else(|| "The session label does not produce a valid profile id.".to_string())?;

  let value = json!({
    "id": id,
    "label": label,
    "avatar_name": payload.avatar_name.as_deref().unwrap_or(label),
    "captured_at": now_iso(),
    "cookie": cookie
  });

  write_private(
    &root.join("profiles").join(format!("{id}.json")),
    &format!("{}\n", serde_json::to_string_pretty(&value).map_err(|error| error.to_string())?),
  )?;

  Ok(DesktopActionResult {
    ok: true,
    message: format!("Saved {label}."),
  })
}

fn switch_session(
  payload: &SessionActionPayload,
) -> Result<DesktopActionResult, String> {
  let id = payload
    .id
    .as_deref()
    .filter(|value| validate_profile_id(value))
    .ok_or_else(|| "A valid session profile id is required.".to_string())?;

  let root = local_session_root()?;
  let profile_path = root.join("profiles").join(format!("{id}.json"));
  let profile: SessionProfileFile = serde_json::from_str(
    &fs::read_to_string(&profile_path)
      .map_err(|error| format!("Could not read session profile: {error}"))?,
  )
  .map_err(|error| format!("Could not parse session profile: {error}"))?;

  let jsessionid = cookie_value(&profile.cookie, "JSESSIONID");
  let swsid = cookie_value(&profile.cookie, "SWSID");

  if jsessionid.is_empty() || swsid.is_empty() {
    return Err("The selected profile is missing JSESSIONID or SWSID.".to_string());
  }

  let metadata = json!({
    "label": profile.label,
    "avatar_name": profile.avatar_name,
    "captured_at": profile.captured_at.clone().unwrap_or_else(now_iso),
    "cookie_length": profile.cookie.len(),
    "fingerprint": fingerprint(&profile.cookie).0
  });

  write_private(&root.join("jsessionid.txt"), &format!("{jsessionid}\n"))?;
  write_private(&root.join("svsid.txt"), &format!("{swsid}\n"))?;
  write_private(
    &root.join("session.json"),
    &format!("{}\n", serde_json::to_string_pretty(&metadata).map_err(|error| error.to_string())?),
  )?;
  // cookie.txt is the compatibility commit marker. Replace it last.
  write_private(&root.join("cookie.txt"), &format!("{}\n", profile.cookie))?;

  Ok(DesktopActionResult {
    ok: true,
    message: format!(
      "Switched to {}.",
      profile.label.unwrap_or_else(|| id.to_string())
    ),
  })
}

fn latest_file(directory: &Path, extensions: &[&str]) -> Option<RecentFile> {
  let mut output: Option<RecentFile> = None;

  for entry in fs::read_dir(directory).ok()? {
    let entry = entry.ok()?;
    let path = entry.path();
    let extension = path
      .extension()
      .and_then(|value| value.to_str())
      .unwrap_or("")
      .to_ascii_lowercase();

    if !extensions.iter().any(|candidate| *candidate == extension) {
      continue;
    }

    let metadata = entry.metadata().ok()?;
    if !metadata.is_file() {
      continue;
    }

    let modified = metadata
      .modified()
      .ok()?
      .duration_since(UNIX_EPOCH)
      .ok()?
      .as_millis();

    let candidate = RecentFile {
      name: entry.file_name().to_string_lossy().to_string(),
      path: path.to_string_lossy().to_string(),
      modified_unix_ms: modified,
      size: metadata.len(),
    };

    if output
      .as_ref()
      .map(|current| candidate.modified_unix_ms > current.modified_unix_ms)
      .unwrap_or(true)
    {
      output = Some(candidate);
    }
  }

  output
}

fn spawn_detached(binary: &'static str, args: &[String]) -> Result<(), String> {
  let mut child = Command::new(binary)
    .args(args)
    .stdin(Stdio::null())
    .stdout(Stdio::null())
    .stderr(Stdio::null())
    .spawn()
    .map_err(|error| format!("Could not launch {binary}: {error}"))?;

  std::thread::spawn(move || {
    let _ = child.wait();
  });

  Ok(())
}

#[tauri::command]
pub fn desktop_runtime_info(
  state: State<'_, OperatorClientState>,
) -> Result<DesktopRuntimeInfo, String> {
  Ok(DesktopRuntimeInfo {
    available: true,
    platform: env::consts::OS.to_string(),
    local_workspace: local_workspace()?.to_string_lossy().to_string(),
    local_session_root: local_session_root()?.to_string_lossy().to_string(),
    operator_configured: state.configured(),
  })
}

#[tauri::command]
pub fn desktop_recent_files() -> Result<BTreeMap<String, Option<RecentFile>>, String> {
  let root = local_workspace()?;
  let groups = [
    ("captures", "captures", vec!["pcap", "pcapng"]),
    ("har", "har", vec!["har"]),
    ("saz", "saz", vec!["saz"]),
    ("sqlite", "sqlite", vec!["sqlite", "db"]),
    ("xml", "xml", vec!["xml"]),
  ];

  Ok(groups
    .into_iter()
    .map(|(key, directory, extensions)| {
      (
        key.to_string(),
        latest_file(&root.join(directory), &extensions),
      )
    })
    .collect())
}

#[tauri::command]
pub fn desktop_sessions() -> Result<SessionPanel, String> {
  Ok(SessionPanel {
    ok: true,
    current: current_session()?,
    profiles: profile_summaries()?,
  })
}

#[tauri::command]
pub async fn desktop_session_action(
  state: State<'_, OperatorClientState>,
  action: String,
  payload: Option<SessionActionPayload>,
) -> Result<DesktopActionResult, String> {
  let payload = payload.unwrap_or(SessionActionPayload {
    label: None,
    avatar_name: None,
    id: None,
  });

  match action.as_str() {
    "save-current" => save_current_session(&payload),
    "switch" => switch_session(&payload),
    "sync" => {
      let root = local_session_root()?;
      let cookie = read_optional(&root.join("cookie.txt"));
      if cookie.is_empty() {
        return Err("No current session exists to sync.".to_string());
      }

      let metadata: SessionMetadata = fs::read_to_string(root.join("session.json"))
        .ok()
        .and_then(|value| serde_json::from_str(&value).ok())
        .unwrap_or(SessionMetadata {
          label: None,
          avatar_name: None,
          avatar: None,
          captured_at: None,
          updated_at: None,
        });

      let response = state
        .request(
          reqwest::Method::POST,
          "/ops/v1/sessions/import",
          Some(json!({
            "cookie": cookie,
            "label": metadata.label,
            "avatarName": metadata.avatar_name.or(metadata.avatar),
            "capturedAt": metadata.captured_at.or(metadata.updated_at)
          })),
        )
        .await?;

      let message = response
        .pointer("/data/label")
        .and_then(Value::as_str)
        .map(|label| format!("Synced {label} to the operator service."))
        .unwrap_or_else(|| "Session synchronized.".to_string());

      Ok(DesktopActionResult { ok: true, message })
    }
    _ => Err(format!("Unknown session action: {action}")),
  }
}

#[tauri::command]
pub async fn desktop_operator_action(
  state: State<'_, OperatorClientState>,
  action: String,
  reason: Option<String>,
) -> Result<Value, String> {
  const ALLOWED: &[&str] = &[
    "stop-run",
    "timer-off",
    "timer-on",
    "test-gateway",
    "oom-check",
    "disk",
    "spin-files",
    "safe-run",
    "render-icons",
  ];

  if !ALLOWED.contains(&action.as_str()) {
    return Err(format!("Unsupported operator action: {action}"));
  }

  state
    .request(
      reqwest::Method::POST,
      &format!("/ops/v1/actions/{action}"),
      Some(json!({
        "confirmation": action,
        "reason": reason.unwrap_or_else(|| "Requested from Smallverse desktop".to_string())
      })),
    )
    .await
}

#[tauri::command]
pub async fn desktop_operator_overview(
  state: State<'_, OperatorClientState>,
) -> Result<Value, String> {
  state
    .request(reqwest::Method::GET, "/ops/v1/overview", None)
    .await
}

#[tauri::command]
pub fn desktop_launch_tool(tool: String) -> Result<DesktopActionResult, String> {
  #[cfg(not(target_os = "linux"))]
  {
    let _ = tool;
    return Err("Desktop launch tools are currently implemented for Linux only.".to_string());
  }

  #[cfg(target_os = "linux")]
  {
    let workspace = local_workspace()?.to_string_lossy().to_string();
    let home = home_dir()?.to_string_lossy().to_string();

    let (binary, args): (&'static str, Vec<String>) = match tool.as_str() {
      "capture" => ("wireshark", vec![]),
      "database" => ("sqlitebrowser", vec![]),
      "workspace" => ("code", vec![workspace.clone()]),
      "files" => ("xdg-open", vec![workspace.clone()]),
      "terminal" => ("ghostty", vec![]),
      "casa" | "casaos" => (
        "xdg-open",
        vec!["http://localhost:8181".to_string()],
      ),
      "ssh" | "vps" => (
        "ghostty",
        vec![
          "-e".to_string(),
          "bash".to_string(),
          "-lc".to_string(),
          "ssh -o ClearAllForwardings=yes casa; exec bash".to_string(),
        ],
      ),
      "logs" => (
        "ghostty",
        vec![
          "-e".to_string(),
          "bash".to_string(),
          "-lc".to_string(),
          "ssh -o ClearAllForwardings=yes casa 'journalctl -fu smallverse-explorer.service'; exec bash".to_string(),
        ],
      ),
      "grab-session" => (
        "ghostty",
        vec![
          "-e".to_string(),
          "bash".to_string(),
          "-lc".to_string(),
          format!("{home}/SmallverseLab/session/grab-session.sh; exec bash"),
        ],
      ),
      _ => return Err(format!("Unknown desktop tool: {tool}")),
    };

    spawn_detached(binary, &args)?;

    Ok(DesktopActionResult {
      ok: true,
      message: format!("Launched {tool}."),
    })
  }
}

#[cfg(test)]
mod tests {
  use super::{cookie_value, fingerprint, safe_profile_id, validate_profile_id};

  #[test]
  fn cookie_parser_reads_exact_cookie_names() {
    let cookie = "OTHER=x; JSESSIONID=abc123456789; SWSID=sw-token";
    assert_eq!(cookie_value(cookie, "JSESSIONID"), "abc123456789");
    assert_eq!(cookie_value(cookie, "SWSID"), "sw-token");
    assert_eq!(cookie_value(cookie, "MISSING"), "");
  }

  #[test]
  fn fingerprint_never_returns_the_full_session_identifier() {
    let cookie = "JSESSIONID=abc123456789; SWSID=sw-token";
    let (short, has_jsessionid, has_swsid) = fingerprint(cookie);

    assert_eq!(short, "abc123…6789");
    assert!(has_jsessionid);
    assert!(has_swsid);
    assert!(!short.contains("abc123456789"));
  }

  #[test]
  fn profile_ids_are_slugged_and_validated() {
    assert_eq!(
      safe_profile_id("Maddie Main Avatar"),
      Some("maddie-main-avatar".to_string())
    );
    assert!(validate_profile_id("maddie-main-avatar"));
    assert!(!validate_profile_id("../escape"));
  }
}
