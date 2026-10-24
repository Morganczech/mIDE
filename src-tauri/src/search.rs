use crate::filesystem::{existing, AppError, Result, Workspace};
use regex::{Regex, RegexBuilder};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    io::Read,
    path::Path,
    time::{Duration, Instant},
};
use tauri::State;

const MAX_RESULTS: usize = 1000;
const MAX_FILE: u64 = 16 * 1024 * 1024;
const MAX_BYTES: usize = 64 * 1024 * 1024;
const EXCLUDED: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    "dist",
    "build",
    ".next",
    ".astro",
    ".cache",
    ".venv",
];
#[derive(Deserialize)]
pub struct SearchBuffer {
    path: String,
    text: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchMatch {
    path: String,
    line: usize,
    column: usize,
    length: usize,
    preview: String,
}
#[derive(Default, Serialize)]
pub struct SearchResults {
    matches: Vec<SearchMatch>,
    truncated: bool,
    skipped: usize,
}

fn matches_in(path: &str, text: &str, pattern: &Regex, results: &mut SearchResults) {
    for (index, line) in text.lines().enumerate() {
        for found in pattern.find_iter(line) {
            if results.matches.len() == MAX_RESULTS {
                results.truncated = true;
                return;
            }
            let before = &line[..found.start()];
            let column = before.encode_utf16().count() + 1;
            let start = before
                .char_indices()
                .rev()
                .nth(80)
                .map(|(i, _)| i)
                .unwrap_or(0);
            let snippet: String = line[start..].chars().take(220).collect();
            let preview = format!(
                "{}{}{}",
                if start > 0 { "…" } else { "" },
                snippet,
                if start + snippet.len() < line.len() {
                    "…"
                } else {
                    ""
                }
            );
            results.matches.push(SearchMatch {
                path: path.into(),
                line: index + 1,
                column,
                length: found.as_str().encode_utf16().count(),
                preview,
            });
        }
    }
}
fn search_root(root: &Path, query: &str, buffers: Vec<SearchBuffer>) -> Result<SearchResults> {
    if query.is_empty() || query.len() > 512 || query.contains(['\n', '\r']) {
        return Err(AppError::new(
            "QUERY",
            "Enter a single-line search of up to 512 bytes.",
        ));
    }
    let pattern = RegexBuilder::new(&regex::escape(query))
        .case_insensitive(true)
        .build()
        .map_err(|_| AppError::new("QUERY", "Unable to search for this text"))?;
    let mut overlays = HashMap::new();
    let mut bytes = 0;
    for buffer in buffers {
        // Buffers belong to this project; never accept an escape path from the frontend.
        if existing(root, &buffer.path).is_ok() && buffer.text.len() <= MAX_FILE as usize {
            bytes += buffer.text.len();
            if bytes > MAX_BYTES {
                return Err(AppError::new(
                    "SIZE",
                    "Open documents exceed the 64 MiB search limit.",
                ));
            }
            overlays.insert(buffer.path, buffer.text);
        }
    }
    let mut results = SearchResults::default();
    let start = Instant::now();
    let mut stack = vec![(root.to_path_buf(), String::new())];
    let mut visited = 0;
    // Buffers are searched first, including unsaved files in excluded directories.
    let mut open_paths: Vec<_> = overlays.keys().cloned().collect();
    open_paths.sort();
    for path in open_paths {
        matches_in(&path, &overlays[&path], &pattern, &mut results);
        if results.truncated {
            return Ok(results);
        }
    }
    while let Some((directory, relative)) = stack.pop() {
        let entries = match fs::read_dir(directory) {
            Ok(entries) => entries,
            Err(_) => {
                results.skipped += 1;
                continue;
            }
        };
        for entry in entries {
            visited += 1;
            if visited > 50000 || bytes >= MAX_BYTES || start.elapsed() > Duration::from_secs(5) {
                results.truncated = true;
                return Ok(results);
            }
            let entry = match entry {
                Ok(entry) => entry,
                Err(_) => {
                    results.skipped += 1;
                    continue;
                }
            };
            let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
                results.skipped += 1;
                continue;
            };
            let path = if relative.is_empty() {
                name.clone()
            } else {
                format!("{relative}/{name}")
            };
            let kind = match entry.file_type() {
                Ok(kind) => kind,
                Err(_) => {
                    results.skipped += 1;
                    continue;
                }
            };
            if kind.is_symlink() {
                results.skipped += 1;
                continue;
            }
            if kind.is_dir() {
                if !EXCLUDED.contains(&name.as_str()) {
                    stack.push((entry.path(), path));
                }
                continue;
            }
            if !kind.is_file() || overlays.contains_key(&path) {
                continue;
            }
            // Recheck canonical boundaries before reading, as in the editor filesystem API.
            let disk_path = match existing(root, &path) {
                Ok(path) => path,
                Err(_) => {
                    results.skipped += 1;
                    continue;
                }
            };
            let read = (|| -> std::io::Result<Vec<u8>> {
                let file = fs::File::open(disk_path)?;
                if file.metadata()?.len() > MAX_FILE {
                    return Err(std::io::Error::other("large file"));
                }
                let mut data = Vec::new();
                file.take(MAX_FILE + 1).read_to_end(&mut data)?;
                Ok(data)
            })();
            let data = match read {
                Ok(data) if data.len() <= MAX_FILE as usize => data,
                _ => {
                    results.skipped += 1;
                    continue;
                }
            };
            bytes += data.len();
            if bytes > MAX_BYTES {
                results.truncated = true;
                return Ok(results);
            }
            if data.contains(&0) {
                results.skipped += 1;
                continue;
            }
            let text = match std::str::from_utf8(&data) {
                Ok(text) => text.trim_start_matches('\u{feff}'),
                Err(_) => {
                    results.skipped += 1;
                    continue;
                }
            };
            matches_in(&path, text, &pattern, &mut results);
            if results.truncated {
                return Ok(results);
            }
        }
    }
    results.matches.sort_by(|a, b| {
        a.path
            .cmp(&b.path)
            .then(a.line.cmp(&b.line))
            .then(a.column.cmp(&b.column))
    });
    Ok(results)
}
#[tauri::command]
pub async fn search_project(
    workspace: State<'_, Workspace>,
    query: String,
    buffers: Vec<SearchBuffer>,
) -> Result<SearchResults> {
    let root = workspace.root()?;
    tauri::async_runtime::spawn_blocking(move || search_root(&root, &query, buffers))
        .await
        .map_err(|_| AppError::new("SEARCH", "Project search failed"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn unicode_literal_matching_and_limits() {
        let pattern = RegexBuilder::new(&regex::escape("a.b"))
            .case_insensitive(true)
            .build()
            .unwrap();
        let mut result = SearchResults::default();
        matches_in("český.ts", "😀 A.B a.b\r\naxB", &pattern, &mut result);
        assert_eq!(result.matches.len(), 2);
        assert_eq!(result.matches[0].column, 4);
        assert_eq!(result.matches[0].length, 3);
        matches_in("big.txt", &"a.b\n".repeat(1100), &pattern, &mut result);
        assert_eq!(result.matches.len(), MAX_RESULTS);
        assert!(result.truncated);
    }
    #[test]
    fn project_search_uses_buffers_and_skips_binary_dependencies_and_links() {
        let root = std::env::temp_dir().join(format!("mide-search-{}", std::process::id()));
        fs::create_dir_all(root.join("node_modules")).unwrap();
        fs::write(root.join("node_modules/ignored.js"), "needle").unwrap();
        fs::write(root.join("a.ts"), "disk needle").unwrap();
        fs::write(root.join("b.ts"), "needle").unwrap();
        fs::write(root.join("binary"), b"needle\0").unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink("/etc/passwd", root.join("external")).unwrap();
        let result = search_root(
            &root.canonicalize().unwrap(),
            "needle",
            vec![SearchBuffer {
                path: "a.ts".into(),
                text: "unsaved".into(),
            }],
        )
        .unwrap();
        assert_eq!(result.matches.len(), 1);
        assert_eq!(result.matches[0].path, "b.ts");
        assert!(result.skipped >= 1);
        assert!(!result.truncated);
        assert!(search_root(&root, "", vec![]).is_err());
        fs::remove_dir_all(root).unwrap();
    }
}
