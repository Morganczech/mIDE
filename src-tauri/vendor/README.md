# Reviewed GTK3 compatibility patch

Tauri 2 / GTK3 resolves GLib 0.18.5. GLib 0.20 cannot replace it independently because the GTK binding family shares GLib types. This directory retains the published MIT-licensed GLib 0.18.5 sources, including licenses, tests and copyright notice.

The sole code change is the two-line mutable out-pointer fix in `VariantStrIter::impl_get`, backported from [gtk-rs/gtk-rs-core PR 1343](https://github.com/gtk-rs/gtk-rs-core/pull/1343) for [RUSTSEC-2024-0429](https://rustsec.org/advisories/RUSTSEC-2024-0429.html). `glib-security.patch` shows the complete code difference. Version 0.18.5 is deliberately retained: this is a local backport, not a claim that upstream 0.18.5 is fixed.

`origins.json` records the crates.io archive SHA-256 and original/patched hashes of every retained file. Cargo download bookkeeping was excluded. Run `python3 scripts/verify-glib-vendor.py` from the repository root to verify the exact snapshot and Cargo selection. Do not modify the Cargo registry cache.

`src-tauri/tests/glib_security.rs` checks forward, reverse, mixed and empty string iteration. The root test profile optimizes GLib at level 2 because the original undefined behavior is optimization-sensitive. The normal Cargo test command includes this regression.

## Advisory monitoring

Cargo-audit skips source-less local packages. A clean scan of the application lockfile alone does **not** validate this backport or detect new GLib advisories. In addition to the regression and snapshot check, restore upstream identity in a temporary audit-only lockfile:

```sh
python3 scripts/verify-glib-vendor.py --upstream-lock /tmp/mide-upstream-audit.lock
cargo audit --file /tmp/mide-upstream-audit.lock
```

That scan intentionally continues to report RUSTSEC-2024-0429 because it describes upstream 0.18.5; the checked local source and optimized regression provide the evidence for this specific fix. Any additional GLib advisory needs separate review. Do not broadly suppress the package or its warnings.

`proc-macro-error` remains transitive through glib-macros and gtk3-macros. Its fork proc-macro-error2 is also unmaintained (RUSTSEC-2026-0173), so substituting it is not a resolution. See the dependency follow-up report for the migration plan.

Remove this patch and the special test profile when a compatible supported GTK/Tauri chain resolves an upstream fixed GLib. Re-run the regression, full app tests, build and both advisory scans before removing it. Until then mIDE maintains this small backport; it does not make the entire GTK3 ecosystem maintained.
