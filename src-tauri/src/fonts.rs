use crate::filesystem::{AppError, Result};
use font_kit::source::SystemSource;
use serde::Serialize;
use std::collections::BTreeMap;

#[derive(Clone, Debug, Serialize)]
pub struct SystemFont {
    pub name: String,
    pub monospace: bool,
}

fn families(faces: impl IntoIterator<Item = SystemFont>) -> Vec<SystemFont> {
    let mut result: BTreeMap<String, SystemFont> = BTreeMap::new();
    for mut face in faces {
        face.name = face.name.trim().to_owned();
        if face.name.is_empty() {
            continue;
        }
        result
            .entry(face.name.to_lowercase())
            .and_modify(|family| family.monospace &= face.monospace)
            .or_insert(face);
    }
    result.into_values().collect()
}

fn installed_fonts() -> Result<Vec<SystemFont>> {
    let handles = SystemSource::new()
        .all_fonts()
        .map_err(|e| AppError::new("FONTS", format!("Could not list installed fonts: {e}")))?;
    let result = families(handles.into_iter().filter_map(|handle| {
        let font = handle.load().ok()?;
        Some(SystemFont {
            name: font.family_name(),
            monospace: font.is_monospace(),
        })
    }));
    if result.is_empty() {
        return Err(AppError::new(
            "FONTS",
            "No readable system fonts were found",
        ));
    }
    Ok(result)
}

#[tauri::command]
pub async fn list_system_fonts() -> Result<Vec<SystemFont>> {
    // System font discovery must not block the editor or the desktop event loop.
    tauri::async_runtime::spawn_blocking(installed_fonts)
        .await
        .map_err(|e| AppError::new("FONTS", e.to_string()))?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn lists_unique_sorted_families_and_requires_fixed_width_faces() {
        let result = families([
            SystemFont {
                name: "Mono".into(),
                monospace: true,
            },
            SystemFont {
                name: "Arial".into(),
                monospace: false,
            },
            SystemFont {
                name: "Mono".into(),
                monospace: true,
            },
            SystemFont {
                name: "Mixed".into(),
                monospace: true,
            },
            SystemFont {
                name: "Mixed".into(),
                monospace: false,
            },
            SystemFont {
                name: "".into(),
                monospace: true,
            },
        ]);
        assert_eq!(
            result
                .iter()
                .map(|font| font.name.as_str())
                .collect::<Vec<_>>(),
            ["Arial", "Mixed", "Mono"]
        );
        assert!(!result[0].monospace);
        assert!(!result[1].monospace);
        assert!(result[2].monospace);
    }
}
