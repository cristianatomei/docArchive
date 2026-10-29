# Plan de testare pe telefon Android (APK preview)

Build de demonstrație, semnat debug, **nu pentru magazin**. Folosește doar date sintetice.

## Obținerea APK-ului

1. GitHub → Actions → „Application checks” → Run workflow (sau o execuție existentă pe branch).
2. Descarcă artefactul `docarchive-android-preview-arm64` din jobul `android-preview`.
3. Copiază `app-release.apk` pe telefon (USB/`adb install -r app-release.apk`) și permite „Instalare din surse necunoscute”.
4. Cerință: telefon Android arm64 (practic orice model din ultimii ani).

## Verificări automate înainte de instalare (toate verzi la pregătire)

- `npm run typecheck`, `npm run lint`, `npm test` (115 teste), `npx expo export --platform android` (bundle Hermes generat).
- CI: `npm run build:web`, `npm run test:e2e`, job `android-preview`.

## Checklist manual pe dispozitiv

Marchează Pass/Fail și notează modelul telefonului și versiunea Android.

| # | Scenariu | Rezultat așteptat |
|---|----------|-------------------|
| 1 | Instalare și pornire la rece | Aplicația pornește fără Metro/PC, fără crash |
| 2 | Mod avion activat | Toate funcțiile merg offline |
| 3 | Creare document cu titlu și text manual | Apare în listă, supraviețuiește repornirii |
| 4 | Atașare imagine din galerie | Permisiune cerută în română; imaginea se salvează |
| 5 | Fotografiere cu camera | Permisiune cerută; poza se atașează |
| 6 | Atașare fișier (PDF/imagine) din selector | Fișierul apare ca atașament, validat |
| 7 | Atașament invalid/prea mare | Mesaj de eroare clar, nicio pierdere de date |
| 8 | „Extrage textul” (OCR) pe document tipărit | Text adăugat, document „De verificat” |
| 9 | OCR pe diacritice ă â î ș ț | Diacritice păstrate sau corectabile manual |
| 10 | OCR eșuat/imagine goală | Ciorna și originalul rămân; mesaj clar |
| 11 | Marcare ca arhivat, editare, ștergere | Stări corecte, confirmare la ștergere |
| 12 | Căutare în arhivă | Găsește după titlu/text, inclusiv fără diacritice |
| 13 | Export/partajare backup | Se deschide foaia de partajare; fișierul se poate reimporta |
| 14 | Rotire ecran și mod întunecat al sistemului | Interfața rămâne utilizabilă |
| 15 | Închidere forțată în timpul salvării | Fără date corupte |
| 16 | Arhivă mare (≥200 documente sintetice) | Listarea rămâne fluidă |
| 17 | Reinstalare peste versiunea anterioară | Datele se păstrează (`allowBackup` e dezactivat) |

## Criterii de acceptare

Scenariile 1–13 trebuie să treacă pe cel puțin două telefoane diferite înainte de a arăta aplicația altcuiva. Defectele se raportează ca issue cu eticheta `bug`, modelul telefonului și pașii de reproducere.
