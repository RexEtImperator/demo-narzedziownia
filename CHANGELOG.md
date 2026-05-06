# Changelog

Wszystkie istotne zmiany oraz przyszłe zmiany w projekcie będą dokumentowane w tym pliku.

## [TODO] - [1.0.3]
### Rozdzielić `LabelsManager` na mniejsze pliki - folder src/components/labels - narzędzia, bhp.
### Przebudować w `LabelsManager` UI w zakładce BHP na taki sam jak w `Narzędzia`.
### Naprawić drukowanie logo na etykietach z kodem kreskowym oraz dodać pobieranie etykiet w `LabelsManager`.

## [1.0.2] - 2026-05-05

### Dodane
- Etykiety: przebudowano widok generatora etykiet (Narzędzia) na układ z lewym panelem opcji/filtrów oraz prawą kolumną z podglądem i listą oraz zapamiętywanie QR/Kod kreskowy między wejściami (localStorage).
- Etykiety – ustawienia etykiety (modal): dodano modal dostępny z ikoną „cog” (w panelu opcji i w nagłówku podglądu) do konfiguracji: URL logo, szerokość logo, długość etykiety w sterowniku, widoczność „Kategoria:”, rozmiary czcionek Nazwa/SKU.
- Etykiety – sugestia długości etykiety: po włączeniu logo aplikacja automatycznie podbija długość etykiety (jeśli była mniejsza) i pokazuje komunikat z sugerowaną wartością do ustawienia w sterowniku.

### Zmienione
- Etykiety – Podgląd etykiety: podgląd ma długość wynikającą z długością nadaną w preferencjach drukarki(sterownik drukarki), pole o nazwie „Długość etykiety w sterowniku”, większe elementy kodu oraz poprawiony układ (QR po lewej, logo po prawej w trybie QR).
- Etykiety – drukowanie (Brother - taśma 24mm): ustawiono rozmiar strony wydruku na `@page size: <długość>mm 24mm` oraz `html/body` na stałe wymiary, aby układ wypełniał taśmę 24mm.

### Naprawione
- Frontend/Narzędzia: przy edycji narzędzia zmiana `sku` aktualizuje też `barcode` i `qr_code`.
- Backend/Narzędzia: przy aktualizacji narzędzia pola `barcode` i `qr_code` są ustawiane spójnie na SKU.
- Frontend/Komponenty: Przeniesienie wywołań setterów / funkcji robiących setState z efektów do asynchronicznego mikro-kroku `Promise.resolve().then(...)`.

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
