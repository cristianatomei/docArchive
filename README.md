# docArchive

Arhivă locală pentru documente școlare: cataloage, registre și fișe matricole,
dosare de înscriere și alte documente administrative. Android-first, cu interfață
React Native reutilizabilă pe iOS și web.

> **Prototip funcțional, nu produs pentru date reale ale elevilor.**
> Baza de date, fișierele și copiile JSON **nu sunt criptate** în această versiune.
> Folosește exclusiv documente fictive. Criptarea, recuperarea cheilor, politica de
> acces și validarea instituțională sunt condiții înaintea unui pilot cu date reale.

## Ce poți face

- Meniu adaptat telefonului și desktopului: Prezentare, Arhivă, Categorii, Etichete, Setări.
- Interfață în română sau engleză; limba se păstrează la repornire.
- Înregistrări manuale, cu sau fără fișiere; adăugare, editare și ștergere.
- Import de PDF-uri și imagini, fotografiere și mai multe atașamente per document.
- Categorii și etichete proprii, cu redenumire și protecție la ștergerea celor folosite.
- Metadate: an școlar, clasă, nume elev, număr de înregistrare, locație fizică și notițe.
- Căutare fără diacritice în metadate, categorii, etichete și text; filtre după tip și stare.
- Stări Ciornă / De verificat / Arhivat; tablou de bord și documente recente.
- OCR local pentru imagini cu text tipărit, în buildurile native compatibile.
- Transcriere manuală disponibilă inclusiv pe web și când OCR-ul nu este disponibil.
- Export complet și restaurare cu metadate și fișiere, inclusiv între platforme.

Nu există cont obligatoriu, server, sincronizare sau serviciu OCR cloud.
Fotografierea nu include încă decupare automată, corecție de perspectivă sau detectarea
blurului. Un PDF este păstrat ca fișier; paginile sale nu sunt extrase automat pentru OCR.

## Pornire rapidă: previzualizare web

Necesită Node.js **24.3+** (sau altă versiune acceptată de React Native 0.88),
npm și un browser modern. Node 24 este folosit în CI.

```bash
npm ci
npm run web
```

Deschide adresa locală afișată de Expo. Varianta web permite navigare, formulare,
import local, căutare, export și restaurare. **OCR-ul nu rulează în browser.**
Pe web, „Deschide” descarcă atașamentul pentru vizualizare în aplicația preferată.

Pentru verificarea variantei web fără internet, construiește și servește pachetul:

```bash
npm run build:web
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

Deschide `http://127.0.0.1:4173`, așteaptă instalarea service worker-ului, apoi
poți deconecta internetul și reîncărca pagina. Service worker-ul memorează numai
fișierele aplicației; documentele rămân separat în IndexedDB.
Această funcție necesită HTTPS sau localhost și nu este activată în serverul de dezvoltare.
Nu deschide `dist/index.html` direct cu `file://`.

## Android

### Dezvoltare locală

Instalează Android Studio, Android SDK, JDK 17 și configurează `ANDROID_HOME`.
Pornește un emulator sau conectează un telefon cu USB debugging:

```bash
npm ci
npm run android
```

Comanda generează proiectul Android, compilează aplicația cu modulele native
și pornește dezvoltarea Expo. Buildul de dezvoltare necesită Metro;
pentru utilizare complet autonomă fără calculator folosește un APK preview.

**Expo Go nu conține modulul nostru OCR.** OCR-ul este indisponibil acolo, fără
să împiedice introducerea manuală. Modificările din modulul nativ cer recompilare.

### APK autonom pentru demonstrație

CI include un job `android-preview` care compilează un APK **arm64** cu JavaScript
inclus în aplicație. După o execuție reușită, descarcă artefactul
`docarchive-android-preview-arm64` din GitHub Actions și instalează APK-ul pe un
telefon compatibil. Acesta este un build de demonstrație cu semnare debug,
**nu un pachet de producție pentru distribuție în magazin**.
Disponibilitatea artefactului depinde de finalizarea jobului, nu doar de existența surselor.

Alternativ, cu un cont Expo și un proiect EAS configurat:

```bash
npx eas-cli@latest build --platform android --profile preview
```

Aceasta trimite sursele aplicației la serviciul de build Expo; nu trimite
documentele locale. Nu este necesar EAS pentru rulare sau pentru buildul local.
`eas.json` include și profiluri development/production; semnarea de producție și
conturile de publicare trebuie configurate separat.

iOS este pregătit în cod, inclusiv adaptorul Vision OCR, dar necesită macOS/Xcode
sau un serviciu de build și validare pe dispozitiv. Nu declarăm iOS validat doar
pe baza funcționării variantei web.

## Cum funcționează OCR-ul

Android folosește un modul Expo local, Kotlin și **ML Kit Latin cu model inclus
în APK** (`com.google.mlkit:text-recognition`), nu un model descărcat prin Play Services.
iOS folosește Apple Vision. Nu se încarcă imaginea pe un server pentru recunoaștere.

Adaugă un titlu și o imagine, apoi alege „Extrage textul”. Aplicația salvează
mai întâi ciorna, adaugă textul la transcrierea existentă și marchează documentul
„De verificat”. Dacă recunoașterea eșuează, ciorna și originalul rămân disponibile.
Verifică numele, diacriticele și cifrele înainte de a marca documentul ca arhivat.

**Nu promitem recunoașterea fiabilă a manuscriselor, extragerea tabelelor sau
asocierea automată a notelor cu elevii.** Paginile scrise de mână pot fi arhivate
și indexate manual. Recunoașterea textului nu constituie clasificare automată:
în acest MVP, categoria și etichetele se aleg explicit.

Prebuild-ul și autolinking-ul pot fi verificate fără telefon. Validarea efectivă
a camerei, recunoașterii și pornirii la rece în mod avion necesită Android real.
Un rezultat bun în browser nu validează motorul OCR nativ.

## Date, limite și copii de siguranță

| Aspect | Comportament actual |
| --- | --- |
| Mobil | Metadate într-un snapshot SQLite tranzacțional; originale în spațiul privat al aplicației |
| Web | Metadate și fișiere în IndexedDB; datele aparțin browserului și originii folosite |
| Căutare | Locală, în memorie; nu este încă un index FTS pentru volume mari |
| Fișiere | Maximum 10 MiB/fișier și 20 atașamente/document |
| Capacitate prototip | Maximum 20 MiB de atașamente în întreaga arhivă |
| Backup | JSON cu fișiere base64, maximum 30 MiB; necriptat |
| Metadate | Maximum 10.000 documente și 1.000 categorii/etichete fiecare; nu reprezintă un benchmark |
| Conflicte | Modificările din altă instanță sunt respinse la salvare; reîncarcă înainte de a continua |

Limitele conservatoare protejează memoria pe telefoane. Nu este încă o soluție
pentru scanarea unei arhive școlare întregi. Backup streaming, criptarea și
stocarea indexată sunt urmărite separat înaintea extinderii volumelor.

În Setări, exportă periodic arhiva și păstrează copia într-un loc sigur.
Restaurarea **înlocuiește întreaga arhivă locală**, inclusiv limba, categoriile
și etichetele. Validăm formatul și prezența fișierelor, le restaurăm în locații
noi și abia apoi înlocuim metadatele. Un eșec nu trebuie să suprascrie arhiva
curentă cu o arhivă goală.

Dezinstalarea aplicației, ștergerea datelor browserului sau pierderea telefonului
pot elimina singura copie locală. Nu există sincronizare automată sau backup cloud.
Ștergerea unui document elimină și fișierele sale după salvarea metadatelor;
erorile de curățare sunt afișate. O oprire în timpul importului poate lăsa fișiere
nefolosite; colectarea automată a acestora este un pas ulterior.

Numele elevului este momentan un câmp de document, **nu un registru relațional
complet de elevi**. Nu introduce CNP-uri. Modelarea elevilor multipli per catalog,
a instituțiilor și a înscrierilor istorice urmează separat.

## Structură și reutilizare

```text
src/app/        Expo Router și compunerea aplicației
src/core/       tipuri, validări, căutare și operații de domeniu
src/state/      controller serializat, backup tranzacțional și provider React
src/storage/    adaptoare SQLite / IndexedDB cu verificarea conflictelor
src/services/   import, cameră, fișiere, backup și acces la OCR
src/ui/         interfață adaptivă și componente
src/i18n/       texte română / engleză
modules/       modul Expo OCR propriu, Android și iOS
e2e/           fluxuri complete în browser
```

Păstrăm contracte explicite între interfață, domeniu și adaptoarele platformelor.
Nu există încă backend. Migrarea la PostgreSQL și stocare de obiecte va necesita
API, autentificare, autorizare și protocol de sincronizare; nu doar copierea
fișierului SQLite în cloud.

## Verificări și contribuții

```bash
npm run typecheck
npm run lint
npm test
npm run build:web
npx playwright install chromium
npm run test:e2e
```

Testele includ validarea datelor, persistență, conflicte, operații serializate,
import/restaurare și curățarea atașamentelor. Testele browser verifică și
reîncărcarea offline, păstrarea limbii și fluxul pe ecran mic.
CI rulează aceleași verificări și un job separat pentru APK.

Lucrăm prin tichete și pull request-uri, fără schimbări directe pe ramura implicită.
Folosește șablonul PR și explică verificările și limitele. Nu adăuga documente
reale, date personale sau chei. Proiectele `android/` și `ios/` sunt generate;
modificările native proprii se păstrează în `modules/` sau în configurarea Expo.

Dependențele se instalează cu `npx expo install`, iar `package-lock.json` se
versionează. Rezultatul `npm audit` trebuie analizat înainte de distribuție:
există avertizări upstream în lanțul Expo CLI/config, inclusiv Zod; nu aplicăm
automat downgrade-uri sau upgrade-uri majore incompatibile doar pentru a goli raportul.

## Documentare și direcție

[Analiza inițială de produs și arhitectură](docs/product-discovery.md) documentează
fluxurile inspirate de Paperless-ngx și Docspell, cazurile școlare și riscurile.
Este o propunere mai largă decât MVP-ul implementat; tabelul de mai sus descrie
comportamentul actual. Comparația comercială și verificarea legislativă rămân
de completat din surse primare.

Digitizarea nu autorizează distrugerea originalelor. Hashurile, OCR-ul și formatul
PDF nu conferă singure autenticitate juridică sau conformitate GDPR.
