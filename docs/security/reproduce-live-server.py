#!/usr/bin/env python3
"""Run Go Live security regressions. Passing tests now mean safe behavior.
Uses temporary dummy files and loopback sockets. Requires Cargo and the app build prerequisites.
"""
from pathlib import Path
import shutil
import subprocess

root = Path(__file__).resolve().parents[2]
cargo = shutil.which("cargo") or str(Path.home() / ".cargo/bin/cargo")
subprocess.run([
    cargo, "test", "--manifest-path", str(root / "src-tauri/Cargo.toml"),
    "--locked", "live_server::security_tests", "--", "--nocapture",
], check=True)
