# Priority projektu mIDE

## Nejvyšší priorita — bezpečnostní opravy Go Live

- **Termín:** 27. října 2026 (Europe/Prague).
- **Stav:** A-01 až A-04 opraveny a ověřeny 27. října 2026; aplikace nebyla vydána.
- **Zadání uživatele:** uložit jako prioritu a zítra opravit.
- **Podklady:** [audit z 26. října](docs/security/audit-2026-10-26.md) a [reprodukce](docs/security/reproduce-live-server.py).

### Povinný rozsah

- [x] A-01: kontrolovat Host; zamezit zpřístupnění citlivých souborů včetně `.env` a `.git`, také přes symlinky.
- [x] A-02: bezpečně kódovat Location a zabránit vložení HTTP hlaviček.
- [x] A-03: generovat bezpečné relativní odkazy ve výpisu adresářů.
- [x] A-04: zajistit zrušitelnou obsluhu, časové a kapacitní limity a spolehlivé zastavení Go Live i s pomalým klientem.
- [x] Převést reprodukce na regresní testy očekávající bezpečné chování a ověřit všechny čtyři opravy.
- [x] Spustit běžné testy a kontroly závislostí; doplnit dosud neprovedenou kontrolu RustSec.
- [x] Aktualizovat audit o výsledky oprav a zbývající omezení.

### Podmínka dokončení

Všechny čtyři nálezy jsou opravené a ověřené. Samotné úspěšné spuštění původních reprodukcí není splněním: ty potvrzují zranitelné chování. Zachovat ostatní rozpracované změny uživatele. Neprovádět automatické vydání aplikace.

## Navazující priorita — upozornění RustSec v závislostech

- [ ] Posoudit a naplánovat kompatibilní aktualizaci GTK/Tauri řetězce pro `glib 0.18.5` — RUSTSEC-2024-0429 (unsound `VariantStrIter`, opraveno od 0.20.0). Dosažitelnost postiženého kódu v mIDE nebyla prokázána ani vyloučena.
- [ ] Vyřešit neudržovaný tranzitivní `proc-macro-error 1.0.4` — RUSTSEC-2024-0370.

Tyto závislosti nebyly v rámci oprav Go Live měněny. Výsledek RustSec není zcela čistý: hlavní seznam zranitelností je prázdný, ale obsahuje uvedená dvě upozornění. Podrobnosti a omezení jsou v aktualizaci auditu.
