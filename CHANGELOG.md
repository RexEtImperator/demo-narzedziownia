# Changelog

Wszystkie istotne zmiany w projekcie będą dokumentowane w tym pliku.

## [1.0.1] - 2026-05-04

### Dodane
- Backend: rozszerzono odpowiedzi endpointów podpozycji narzędzi (`detectors`, `impactSockets`, `slings`) o dane pracownika i aktualnych posiadaczy (w tym `employee_brand_number`, `issued_to`).
- Frontend: dodano szybkie akcje „Wydaj/Zwróć” dla podpozycji znalezionych w wynikach wyszukiwania (widok tabela i mobile) oraz przekazywanie `autoAction` do widoków szczegółów.
- i18n: dodano nowe klucze tłumaczeń używane w narzędziach i pracownikach (m.in. `totalQty`, `issuedQty`, `availableQty`, `employee`, `navigateToEmployeeIndex`).

### Zmienione
- Frontend: zmieniono dynamiczny import modułu `./api/supabase/index.js` w `src/api.js`, aby był ładowany wyłącznie w trybie Supabase.
- Backend: przebudowano wyszukiwanie w `GET /api/tools` (szersze dopasowania po polach kategorii/rozmiaru, agregacje ilości, lepsze mapowanie podpozycji).
- Frontend/UI: zaktualizowano ekrany i komponenty narzędzi (m.in. `ToolsTable`, `ToolsDetailsModal`, `ToolsScreen`, `ToolsEditorScreen`) oraz wybrane widoki pracowników/BHP/DB.
- Produkcja: frontend w PM2 uruchamia się przez `start:prod` (`build + preview`) z podglądem na porcie `3001`.
- Frontend: `BottomNavigation` i `CommandPalette` korzystają z przekazanego obiektu `user` z `App`, zamiast tworzyć własne instancje hooka `useAuth`.
- PlantMap: poprawiono style osadzonej mapy (`box-sizing` globalnie i `overflow: hidden`), aby uniknąć problemów z układem.

### Naprawione
- Dodano `@vite-ignore` dla importu modułu Supabase, co eliminuje błąd buildu Vite/Rollup „Could not resolve ./api/supabase/index.js” w konfiguracjach bez tego pliku.
- Backend: dodano fallback dla zapytań FTS w `tools` — przy problemie z `tools_fts` zapytanie jest ponawiane bez FTS zamiast kończyć się błędem.
- PWA/cache: service worker pomija żądania `/src/`, co ogranicza konflikty cache podczas pracy aplikacji.
- TopBar: usunięto reset pamięci podręcznej powiadomień przy cleanupie efektu, aby nie tracić cache przy przejściach.

### Techniczne
- Backend: inicjalizacja pełnotekstowego wyszukiwania (`initFullTextSearch`) podczas startu serwera.
- Konfiguracja: zaktualizowano skrypty `package.json` (`preview --port 3001 --host 0.0.0.0`, `start:prod`) i `ecosystem.config.js`.

[1.0.0]: https://github.com/RexEtImperator/demo-narzedziownia/releases/tag/1.1.0

## [1.0.0] - 2026-04-24 - Wersja testowa
