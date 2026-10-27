#!/usr/bin/env python3
"""Verify the reviewed GLib snapshot; optionally restore registry identity for RustSec.
No network access or mutation of the project's lockfile.
"""
import argparse
import hashlib
import json
from pathlib import Path
import tomllib

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--upstream-lock', type=Path)
args = parser.parse_args()
origin = json.loads((root / 'src-tauri/vendor/origins.json').read_text())['glib-0.18.5']
vendor = root / 'src-tauri/vendor/glib-0.18.5'
actual = {p.relative_to(vendor).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
          for p in vendor.rglob('*') if p.is_file()}
expected = {name: record['patched'] for name, record in origin['files'].items()}
if actual != expected:
    raise SystemExit('GLib vendor content differs from the reviewed snapshot.')
changed = [name for name, record in origin['files'].items() if record['upstream'] != record['patched']]
if changed != ['src/variant_iter.rs']:
    raise SystemExit('Unexpected upstream patch scope.')
manifest = tomllib.loads((root / 'src-tauri/Cargo.toml').read_text())
if manifest['patch']['crates-io']['glib']['path'] != 'vendor/glib-0.18.5':
    raise SystemExit('GLib patch is not selected.')
if manifest['profile']['test']['package']['glib']['opt-level'] != 2:
    raise SystemExit('GLib regression must run with optimization.')
lock_text = (root / 'src-tauri/Cargo.lock').read_text()
packages = tomllib.loads(lock_text)['package']
glib = [p for p in packages if p['name'] == 'glib']
if len(glib) != 1 or glib[0]['version'] != '0.18.5' or 'source' in glib[0]:
    raise SystemExit('Cargo.lock does not select the reviewed local GLib.')
if args.upstream_lock:
    # RustSec skips source-less packages. Restore identity only in this temporary
    # audit input so future advisories against the upstream version stay visible.
    needle = '[[package]]\nname = "glib"\nversion = "0.18.5"\n'
    assert lock_text.count(needle) == 1
    replacement = needle + 'source = "registry+https://github.com/rust-lang/crates.io-index"\nchecksum = "' + origin['archive_sha256'] + '"\n'
    args.upstream_lock.write_text(lock_text.replace(needle, replacement))
print(f'Verified {len(actual)} GLib files; only variant_iter.rs differs from upstream.')
