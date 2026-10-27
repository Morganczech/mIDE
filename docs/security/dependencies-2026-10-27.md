# Navazující kontrola Rust závislostí — 27. 10. 2026

Opravy Go Live jsou v commitu `12c55a4`. Tato navazující změna opravuje GLib bez nekompatibilního přechodu celé aplikace na jinou generaci GTK. Druhé upozornění na neudržovaná makra zůstává otevřené.

## GLib: opraveno lokálním backportem

Řetězec Tauri 2 → GTK/WebKitGTK 0.18 → GLib 0.18.5 používá navzájem provázané typy. Nezávislé přidání GLib 0.20 by samo nenahradilo GLib uvnitř GTK. Použitá oprava proto zachovává API a verzi a přebírá dvě změny z [upstream PR 1343](https://github.com/gtk-rs/gtk-rs-core/pull/1343): ukazatel `p` je mutabilní a do variadické C funkce se předává `&mut p`.

- `src-tauri/vendor/glib-0.18.5` obsahuje původní vydané zdroje, MIT licenci a testy; změněn je pouze `src/variant_iter.rs`.
- `origins.json` obsahuje hash původního crates.io archivu i každého původního a upraveného souboru. `glib-security.patch` obsahuje úplný rozdíl kódu.
- `[patch.crates-io]` v manifestu a lockfile vybírají lokální knihovnu pro všechny závislosti. Verze nebyla účelově zvýšena, aby se obešla databáze upozornění.
- `scripts/verify-glib-vendor.py` kontroluje všech 120 souborů, výběr patche a zapnutou optimalizaci regresního testu. Je zapojen do stávajícího CI.
- Nový integrační test ověřuje iteraci řetězců vpřed, vzad, střídavě a přes prázdný seznam. GLib se v testovacím profilu optimalizuje na úrovni 2; původní chyba je závislá na optimalizaci.

Dosažitelnost vadné funkce z běžného UI nebyla prokázána. Oprava pokrývá samotný chybný kód, takže nezávisí na předpokladu jeho nedosažitelnosti. Neznamená audit celého GTK3 ani vyřešení obecné údržby této větve. mIDE nyní udržuje tento malý backport; až bude dostupná kompatibilní opravená větev, má být odstraněn podle instrukcí ve vendor/README.md.

## Makra: otevřená migrace, nikoli vyřešené upozornění

`proc-macro-error 1.0.4` používají `glib-macros 0.18.5` a `gtk3-macros 0.18.2`. Jde o build-time závislost pro hlášení chyb procedurálních maker. [RUSTSEC-2024-0370](https://rustsec.org/advisories/RUSTSEC-2024-0370.html) upozorňuje na neudržovanost, ne na doložené zneužití v mIDE.

Zkušební záměna za proc-macro-error2 sice prošla sestavením, ale aktuální databáze obsahuje [RUSTSEC-2026-0173](https://rustsec.org/advisories/RUSTSEC-2026-0173.html): také tato větev je neudržovaná. Záměna byla odstraněna a finální lockfile ji neobsahuje. Nebyl zaveden nový fork jen pro skrytí upozornění.

Konkrétní další postup:

1. Samostatně migrovat obě macro knihovny na `syn::Result` / `syn::Error::to_compile_error` nebo aktuálně prověřený `manyhow`. Nestačí změnit import: `abort!` se používá i uvnitř parserů, closures a funkcí vracejících jiné typy.
2. Zachovat chybové spany, doplňující poznámky a chování atributových/derive maker. Doplnit compile-pass i compile-fail testy pro vadné `Variant`, `Boxed`, `object_subclass`, `closure` a `CompositeTemplate` vstupy; prosté sestavení aplikace neprokazuje správnost těchto větví.
3. Ověřit, že z grafu zmizí `proc-macro-error` i jeho attr crate a nepřibude jiná neudržovaná alternativa. Opakovat RustSec a testy aplikace.
4. Preferovat upstream kompatibilní vydání; případná lokální migrace obou macro knihoven znamená další vlastní údržbu a musí mít stejnou evidenci původu jako GLib.

Tato migrace nebyla provedena. Upozornění zůstává viditelné a úkol neodškrtnutý v PRIORITIES.md.

## Kontroly a jejich interpretace

- Celá sada: 54 původních/Go Live Rust testů a 1 nový optimalizovaný GLib test prošly.
- Clippy (`--all-targets -- -D warnings`), Rustfmt check a sestavení desktopové aplikace prošly.
- Ověření vendor snapshotu prošlo; jediný rozdíl vůči upstream zdrojům je oprava ukazatele.
- Standardní RustSec kontrola finálního lockfile: žádné položky v hlavním seznamu vulnerabilities, zbývá RUSTSEC-2024-0370 (unmaintained).
- Dodatečná kontrola s obnovenou registry identitou GLib v dočasném lockfile stále ukazuje také RUSTSEC-2024-0429. To je očekávané pro upstream verzi 0.18.5 a umožňuje sledovat i budoucí upozornění proti této verzi.

Cargo-audit lokální balíčky bez registry source vynechává. Zmizení upozornění GLib v prvním skenu proto samo o sobě není důkazem bezpečnosti: důkazem konkrétní opravy je kontrolovaný rozdíl vůči upstreamu a optimalizovaný test. Žádný advisory nebyl přidán na ignore list. Příkazy pro oba skeny jsou ve vendor/README.md.

Ověření proběhlo na Linuxu. Windows/macOS, grafické ovládání zabaleného AppImage a celý upstream GLib test suite nebyly v tomto kroku ověřeny. Zdroje GLib emitují upozornění nového Rust kompilátoru na zápis životností; nesouvisející upstream zdroje nebyly hromadně přeformátovány nebo přepisovány.
