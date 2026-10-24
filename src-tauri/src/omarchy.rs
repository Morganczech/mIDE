use crate::filesystem::{AppError, Result};
use serde::Serialize;
use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
    sync::{mpsc, Mutex},
    thread,
    time::Duration,
};
use notify::Watcher;
use tauri::{AppHandle, Emitter};

const INVALID: &str = "Omarchy theme file is invalid.";
const UNAVAILABLE: &str = "Omarchy theme is unavailable.";
const REQUIRED: &[&str] = &[
    "mode",
    "accent",
    "selection",
    "muted",
    "background",
    "dark_background",
    "darker_background",
    "lighter_background",
    "foreground",
    "dark_foreground",
    "light_foreground",
    "bright_foreground",
    "red",
    "yellow",
    "orange",
    "green",
    "cyan",
    "blue",
    "magenta",
    "bright_red",
    "bright_yellow",
    "bright_green",
    "bright_cyan",
    "bright_blue",
    "bright_magenta",
];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OmarchyTheme {
    pub slug: String,
    pub name: String,
    pub mode: String,
    pub colors: BTreeMap<String, String>,
}

struct OmarchyWatch {
    _watcher: notify::RecommendedWatcher,
}

static WATCH: Mutex<Option<OmarchyWatch>> = Mutex::new(None);

fn invalid() -> AppError {
    AppError::new("OMARCHY", INVALID)
}
fn unavailable() -> AppError {
    AppError::new("OMARCHY", UNAVAILABLE)
}
fn valid_slug(slug: &str) -> bool {
    let mut characters = slug.chars();
    let Some(first) = characters.next() else {
        return false;
    };
    (first.is_ascii_lowercase() || first.is_ascii_digit())
        && characters.all(|character| {
            character.is_ascii_lowercase() || character.is_ascii_digit() || character == '-'
        })
}
fn hex_color(value: &str) -> bool {
    let Some(rest) = value.strip_prefix('#') else {
        return false;
    };
    rest.len() == 6
        && rest
            .chars()
            .all(|character| character.is_ascii_hexdigit())
}
pub fn parse_palette(text: &str) -> Result<BTreeMap<String, String>> {
    if text.len() > 65536 {
        return Err(invalid());
    }
    let mut colors = BTreeMap::new();
    for raw in text.lines() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            return Err(invalid());
        };
        let key = key.trim();
        if key.is_empty()
            || !key.chars().all(|character| {
                character.is_ascii_alphanumeric() || character == '_'
            })
        {
            return Err(invalid());
        }
        let Some(value) = value
            .trim()
            .strip_prefix('"')
            .and_then(|item| item.strip_suffix('"'))
        else {
            return Err(invalid());
        };
        colors.insert(key.to_string(), value.to_string());
    }
    for key in REQUIRED {
        let Some(value) = colors.get(*key) else {
            return Err(invalid());
        };
        let ok = if *key == "mode" {
            value == "dark" || value == "light"
        } else {
            hex_color(value)
        };
        if !ok {
            return Err(invalid());
        }
    }
    Ok(colors)
}
pub fn humanize_slug(slug: &str) -> String {
    slug.split('-')
        .map(|word| {
            let mut chars = word.chars();
            match chars.next() {
                Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}
pub fn resolve_palette(slug: &str, home: &Path, stock: &Path) -> Result<OmarchyTheme> {
    if !valid_slug(slug) {
        return Err(invalid());
    }
    let user = home
        .join(".config/omarchy/themes")
        .join(slug)
        .join("colors.toml");
    let path = if user.is_file() {
        user
    } else {
        stock.join(slug).join("colors.toml")
    };
    let text = fs::read_to_string(path).map_err(|_| unavailable())?;
    let colors = parse_palette(&text)?;
    let mode = colors.get("mode").cloned().unwrap_or_default();
    Ok(OmarchyTheme {
        slug: slug.to_string(),
        name: humanize_slug(slug),
        mode,
        colors,
    })
}
fn state_directory() -> Result<PathBuf> {
    let home = std::env::var_os("HOME").ok_or_else(unavailable)?;
    let directory = PathBuf::from(home).join(".local/state/omarchy/current");
    if directory.is_dir() {
        Ok(directory)
    } else {
        Err(unavailable())
    }
}
#[tauri::command]
pub fn read_omarchy_theme() -> Result<OmarchyTheme> {
    let home = std::env::var_os("HOME").ok_or_else(unavailable)?;
    let slug = fs::read_to_string(
        PathBuf::from(&home)
            .join(".local/state/omarchy/current/theme.name"),
    )
    .map_err(|_| unavailable())?;
    resolve_palette(
        slug.trim(),
        Path::new(&home),
        Path::new("/usr/share/omarchy/themes"),
    )
}
#[tauri::command]
pub fn watch_omarchy_theme(app: AppHandle) -> Result<()> {
    let mut slot = WATCH.lock().unwrap_or_else(|poison| poison.into_inner());
    if slot.is_some() {
        return Ok(());
    }
    let directory = state_directory()?;
    let (sender, receiver) = mpsc::channel();
    let mut watcher = notify::recommended_watcher(move |result: notify::Result<notify::Event>| {
        if result.is_ok() {
            let _ = sender.send(());
        }
    })
    .map_err(|_| unavailable())?;
    watcher
        .watch(directory.as_path(), notify::RecursiveMode::NonRecursive)
        .map_err(|_| unavailable())?;
    thread::spawn(move || {
        while receiver.recv().is_ok() {
            thread::sleep(Duration::from_millis(200));
            while receiver.try_recv().is_ok() {}
            let _ = app.emit("omarchy-theme-changed", ());
        }
    });
    *slot = Some(OmarchyWatch { _watcher: watcher });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn palette(accent: &str) -> String {
        format!(
            r##"
# comment
mode = "dark"
accent = "{accent}"
selection = "#434c5e"
muted = "#4c566a"
background = "#2e3440"
dark_background = "#222730"
darker_background = "#191c23"
lighter_background = "#3b4252"
foreground = "#d8dee9"
dark_foreground = "#667080"
light_foreground = "#adb5c4"
bright_foreground = "#d8dee9"
red = "#bf616a"
yellow = "#ebcb8b"
orange = "#d5967a"
green = "#a3be8c"
cyan = "#88c0d0"
blue = "#81a1c1"
magenta = "#b48ead"
bright_red = "#bf616a"
bright_yellow = "#ebcb8b"
bright_green = "#a3be8c"
bright_cyan = "#8fbcbb"
bright_blue = "#81a1c1"
bright_magenta = "#b48ead"
"##
        )
    }
    #[test]
    fn parses_nord_and_rejects_bad_palettes() {
        let colors = parse_palette(&palette("#81a1c1")).unwrap();
        assert_eq!(colors.get("accent").map(String::as_str), Some("#81a1c1"));
        assert!(
            parse_palette(&palette("#81a1c1").replace("orange = \"#d5967a\"\n", "")).is_err()
        );
        assert!(parse_palette(&palette("red")).is_err());
        assert!(
            parse_palette(&palette("#81a1c1").replace("mode = \"dark\"", "mode = \"blue\"")).is_err()
        );
    }
    #[test]
    fn rejects_unsafe_slugs_and_prefers_the_user_file() {
        let root = std::env::temp_dir().join(format!("mide-omarchy-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let home = root.join("home");
        let stock = root.join("stock");
        fs::create_dir_all(home.join(".config/omarchy/themes/tokyo-night")).unwrap();
        fs::create_dir_all(stock.join("tokyo-night")).unwrap();
        fs::write(
            home.join(".config/omarchy/themes/tokyo-night/colors.toml"),
            palette("#112233"),
        )
        .unwrap();
        fs::write(stock.join("tokyo-night/colors.toml"), palette("#aabbcc")).unwrap();
        assert!(resolve_palette("../tokyo-night", &home, &stock).is_err());
        assert!(resolve_palette("tokyo/night", &home, &stock).is_err());
        let theme = resolve_palette("tokyo-night", &home, &stock).unwrap();
        assert_eq!(theme.name, "Tokyo Night");
        assert_eq!(
            theme.colors.get("accent").map(String::as_str),
            Some("#112233")
        );
        let _ = fs::remove_dir_all(&root);
    }
}
