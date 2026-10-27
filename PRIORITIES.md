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

- [x] Posoudit kompatibilitu GTK/Tauri a opravit RUSTSEC-2024-0429: lokální GLib 0.18.5 obsahuje převzatou dvouřádkovou opravu z upstreamu. Optimalizovaný regresní test prošel; původ a přesný rozsah backportu se ověřují v CI.
- [ ] Nahradit neudržovaný tranzitivní `proc-macro-error 1.0.4` — RUSTSEC-2024-0370. `proc-macro-error2` není řešení: má vlastní upozornění RUSTSEC-2026-0173. Je potřeba samostatná migrace chybových cest maker GLib/GTK, včetně compile-fail testů.
- [ ] Po dostupnosti kompatibilní udržované větve GTK/Tauri odstranit lokální backport GLib a znovu ověřit aplikaci.

Podrobnosti, výsledky a konkrétní plán: [navazující kontrola závislostí](docs/security/dependencies-2026-10-27.md). RustSec neprověřuje lokální zdroj GLib automaticky; proto zachováváme také kontrolu původní registry identity a nepovažujeme zmizení upozornění samo o sobě za důkaz opravy.
