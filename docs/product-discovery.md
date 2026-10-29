# Propunere initiala pentru docArchive

Data documentarii: 2026-10-29.

Stare: propunere pentru discutie. Nu este o specificatie aprobata, o evaluare
juridica sau o garantie privind precizia OCR.

## 1. Obiectiv si limite

O arhiva scolara digitala in care personalul autorizat poate introduce,
fotografia, clasifica si regasi documente, inclusiv atunci cand nu exista internet.
Android este prima platforma; iOS si web trebuie pregatite prin separarea logicii
de produs de accesul la camera, fisiere, OCR si baza de date.

Documentele initiale sunt cataloage, registre/fise matricole si dosare de inscriere.
Elevul este o entitate asociata documentelor, nu un tip de document.
Nu construim initial un catalog electronic de note, un sistem de management scolar
sau un serviciu de emitere a actelor de studii.

Primul pilot propus: o institutie si un dispozitiv. Acest lucru trebuie confirmat.
Mai multe telefoane cu baze locale independente NU formeaza automat o arhiva comuna.

## 2. Documentare preliminara si piata

Au fost citite documentatia si sursele oficiale disponibile prin GitHub.
Accesul direct la site-uri si cautarea web au esuat in aceasta sesiune.
Nu este finalizata comparatia comerciala actualizata sau verificarea legislatiei.
Nu formulam concluzii despre preturi, furnizori romani sau conformitate legala.

| Reper | Ce este verificat | Ce preluam ca principiu | Limita pentru acest proiect |
| --- | --- | --- | --- |
| Paperless-ngx | OCR cu Tesseract, tipuri, etichete, campuri personalizate, cautare integrala, fluxuri, permisiuni, originale si PDF/A | Separarea originalului de text, clasificare asistata, cautare si validare | Arhiva instalata pe server; nu este o aplicatie autonoma Android cu model scolar |
| Docspell | OCR, metadate si sugestii, cautare integrala, API REST, interfata web si client Android pentru incarcare | Inbox de procesare si completare asistata a metadatelor | Necesita componente server; clientul de incarcare nu inlocuieste arhiva locala |
| ML Kit, exemple oficiale | Exemple Android/iOS; exemplu Android pentru scanare documente | Captura specializata in locul unei simple fotografii | Nu este un DMS; integrarea nativa si disponibilitatea offline trebuie probate |
| Tesseract | Motor OCR, iesiri text/PDF/hOCR/TSV; exista modelul romanesc `ron` | Alternativa de comparat pe texte romanesti tiparite | Existenta modelului nu demonstreaza precizie pe scris de mana sau tabele |

Concluzie: produs propriu specializat, inspirat de fluxurile DMS existente,
nu un fork de DMS server. Daca lucrul simultan al mai multor utilizatori devine
cerinta imediata, trebuie reevaluata si varianta unui DMS existent cu extensii.

Inainte de alegerea unei componente se verifica licenta si mentenanta.
Docspell declara AGPLv3; reutilizarea codului sau nu este echivalenta cu simpla
inspiratie din functionalitati. Nu copiem cod sau design proprietar.

Comparatia comerciala ramasa: aplicatii mobile de scanare, DMS-uri comerciale si
oferte romanesti pentru arhive scolare. Pentru fiecare trebuie verificate:
functionarea fara cont/internet, locul procesarii OCR, exportul complet,
portabilitatea datelor, drepturile de acces, pretul si dependenta de furnizor.

## 3. Recomandare tehnologica

| Zona | Propunere | Motiv / compromis |
| --- | --- | --- |
| Mobil | React Native, Expo, TypeScript, development builds | Android si iOS cu logica comuna; modulele native necesita build propriu, nu doar Expo Go |
| Navigare | Expo Router | Navigare coerenta si posibilitate de reutilizare pe web |
| Date locale | SQLite prin expo-sqlite, migrari versionate, FTS5 | Relatii, tranzactii si cautare locala; se verifica extensiile pe build-ul real |
| Protectia bazei | SQLCipher, chei in Keystore/Keychain | Verificare explicita a suportului; fara revenire tacita la baza necriptata |
| Documente | Fisiere in spatiul privat al aplicatiei, criptate separat | Criptarea SQLite NU cripteaza imaginile, PDF-urile sau miniaturile |
| OCR | Interfata comuna; proba ML Kit Latin fata de Tesseract `ron` | Alegerea finala depinde de rezultate pe documentele tinta si de comportamentul offline |
| Scanare Android | Proba cu ML Kit Document Scanner; import PDF/imagine ca alternativa | Dependentele Google Play Services si descarcarile initiale trebuie testate |
| iOS ulterior | Adaptor nativ de scanare/OCR, evaluat separat | Nu presupunem ca scannerul Android functioneaza pe iOS |
| Web ulterior | React/TypeScript; Next.js numai daca exista un motiv concret | Refolosim domeniul, validarile si contractele; tabelele desktop cer UX propriu |
| Server ulterior | API TypeScript, PostgreSQL, stocare de obiecte | Date relationale separate de fisiere; sincronizarea este o functie distincta |

Alternativa serioasa: Flutter. Este potrivit pentru mobil si o interfata comuna,
dar alegerea TypeScript favorizeaza reutilizarea logicii cu un viitor web React.
Niciuna dintre variante nu garanteaza reutilizare integrala a interfetei.
Kotlin nativ ar simplifica unele integrari Android, dar ar reduce reutilizarea
directa pentru iOS si web.

Nu introducem acum microservicii, Kubernetes, un backend gol sau AI generativ.
Organizarea initiala poate fi un singur proiect cu module de domeniu si adaptoare.
Un monorepo se justifica atunci cand apare al doilea client.

### Reguli pentru portabilitate

- Domeniul si validarile nu importa React Native sau API-uri Expo.
- Accesul la date, fisiere, captura si OCR trece prin contracte mici, explicite.
- Modelul foloseste identificatori global unici si migrari, nu cai locale ca identitate.
- Datele originale, sugestiile OCR si valorile confirmate sunt distincte.
- Exportul include metadate versionate, fisiere si verificari de integritate.
- Web-ul nu depinde de suport identic pentru SQLite/SQLCipher in browser:
  documentatia Expo cere WASM si antete speciale pentru SQLite web, iar SQLCipher
  documentat pentru mobil nu ofera implicit aceeasi solutie in browser.
- Mutarea in cloud nu este copierea unui fisier SQLite in PostgreSQL.
  Necesita autentificare, autorizare, migrari, incarcare de fisiere, revizii,
  cozi de sincronizare, stergeri propagate si rezolvarea explicita a conflictelor.

## 4. Model de date propus

| Entitate | Informatii / invariant |
| --- | --- |
| Institutie | Identitate stabila, denumiri istorice, structuri arondate |
| An scolar si clasa | Interval, nivel, denumire; fara a confunda anul calendaristic cu anul scolar |
| Elev / persoana | Nume, variante istorice, identificatori necesari; CNP-ul nu este obligatoriu implicit |
| Inscriere | Relatia elev-institutie-clasa-an; transferul nu suprascrie istoricul |
| Document | Tip, titlu, perioada, provenienta, stare, locatie fizica |
| Pagina / fisier | Ordine, original, derivat, hash, dimensiune, stare OCR |
| Legatura document-elev | Relatie multipla; poate indica paginile relevante |
| Rezultat OCR | Motor, versiune/model, text, pozitionari disponibile, stare si eroare |
| Revizie / eveniment | Modificare, moment, autor local unde poate fi identificat |

Un catalog poate contine multi elevi; un elev poate aparea in multe documente.
Un document poate acoperi mai multi ani. Nu duplicam fisierul pentru fiecare elev.
Locatia fizica poate contine fond/serie, inventar, raft, cutie, volum si pagina.
Codul de clasificare si termenul de pastrare trebuie legate de nomenclatorul
aprobat al institutiei, nu inventate din tipul documentului.

## 5. Fluxuri UX

Navigare propusa: Arhiva, Adauga, De verificat, Setari.
Cautarea este vizibila imediat in Arhiva. Introducerea manuala ramane disponibila
chiar daca OCR-ul sau camera nu functioneaza.

### Captura si introducere rapida

1. Utilizatorul alege contextul comun: institutie, an/clasa si tip, daca le cunoaste.
2. Scaneaza pagini, importa fisiere sau completeaza doar o inregistrare manuala.
3. Verifica incadrarea, lizibilitatea, ordinea si paginile lipsa.
4. Aplicatia salveaza un draft local; OCR-ul nu blocheaza salvarea.
5. Campurile sugerate apar langa pagina sursa, nu ca date deja validate.
6. Utilizatorul confirma si arhiveaza; poate aplica metadate comune unui lot.

Nu cerem completarea unei fise de elev pentru fiecare pagina de catalog.
Paginile unei carti/cataloage legate trebuie sa poata fi recapturate individual.
Procesarea se face in loturi mici, reluabile; nu se tine un catalog intreg in RAM.

### Regasire

Cautare dupa nume, variante de nume, an/clasa, tip, numar si text OCR.
Indexul permite cautare fara diacritice, dar originalul si afisarea le pastreaza.
Rezultatul indica documentul si pagina potrivita; textul OCR nu dovedeste singur
identitatea elevului. Filtrele si combinatiile frecvente se pot salva ulterior.

### Verificare si exceptii

Stari distincte: draft, procesare, de verificat, confirmat si eroare.
Nu ascundem o eroare OCR sub o stare de succes.
Un document salvat fara OCR ramane accesibil prin metadate.
La oprirea procesului, scanarea salvata se recupereaza, iar procesarea se poate relua.
La lipsa spatiului, nu se confirma salvarea inaintea scrierii durabile.

## 6. OCR: trei probleme diferite

1. Captura: perspectiva, lumina, blur, pagini curbate si pagini duble.
2. Recunoastere: transformarea imaginii in text cu erori masurabile.
3. Extragere: asocierea corecta a numelui, clasei, notelor si anilor din tabele.

OCR-ul pe text tiparit nu garanteaza recunoasterea scrisului de mana.
Recunoasterea unui rand nu garanteaza asocierea notei cu elevul potrivit.
Digital Ink Recognition, care foloseste trasee de pix digital, nu trebuie confundat
cu recunoasterea scrisului de mana din fotografii.

Pentru MVP: text tiparit si metadate asistate; scrisul de mana se poate arhiva
ca imagine cu indexare manuala. Automatizarea manuscriselor ramane o investigatie
distincta daca acestea sunt majoritare.

Proba tehnica trebuie sa compare diacriticele romanesti, nume, cifre, formulare,
tabele, documente deteriorate si functionarea in mod avion.
Se verifica separat instalarea la rece, lipsa unui model descarcat si reluarea
dupa descarcare. Nu promitem functionare offline de la prima pornire inainte
sa demonstram impachetarea modelelor sau sa oferim o alternativa locala.

Datele de evaluare trebuie obtinute legal si procesate intr-un mediu autorizat.
In repo si in serviciile externe folosim exclusiv exemple sintetice ori materiale
anonimizate verificate, nu fotografii cu date reale ale elevilor.

## 7. Protectie si utilizare institutionala

- Baza, fisierele, miniaturile si exporturile trebuie protejate; se evita galeria publica.
- Blocarea aplicatiei si politica de acces se stabilesc cu institutia.
  Deblocarea biometrica nu este, singura, un sistem de roluri.
- Cheile nu sunt hardcodate. Recuperarea backupului pe alt dispozitiv trebuie
  proiectata separat de cheia legata de telefon si explicata utilizatorului.
- Backup criptat, initiat/controlat de utilizator, cu restaurare verificata;
  include baza consistenta, fisierele, manifestul si schema.
  Copierea oarba a unei baze SQLite active poate omite date din WAL.
- Un hash detecteaza schimbari, nu certifica autenticitatea juridica.
  Un jurnal local obisnuit nu este automat un audit imposibil de modificat.
- Fara documente sau date personale in loguri, analytics si rapoarte de crash.
- OCR cloud si sincronizare dezactivate implicit; activarea lor necesita o analiza
  a datelor transmise, furnizorului, temeiului si conditiilor de procesare.
- Exportul unei pagini despre un elev poate expune alti elevi din acelasi catalog.
  Exportul selectiv/redactarea trebuie tratate inaintea distribuirii externe.
- Arhiva locala necesita backup: pierderea telefonului nu trebuie sa insemne
  pierderea singurei copii digitale.

Validarea juridica trebuie facuta cu institutia, responsabilul de arhiva si DPO:
GDPR, cerinte scolare, nomenclator si termene, acces, rectificare, stergere,
pastrare si distinctia dintre copie scanata si arhivare electronica reglementata.
Nu presupunem consimtamantul ca temei universal si nu promitem stergere imediata
acolo unde exista obligatii legale de pastrare.
Nu stabilim aici termene legale numerice neverificate si nu autorizam eliminarea
originalelor. PDF/A singur nu ofera conformitate institutionala.

## 8. Livrare in etape

### Etapa A: descoperire si proba tehnica

Confirmam documentele dominante, utilizatorii, volumele, dispozitivele si
necesitatea lucrului simultan. Validam captura, OCR-ul si criptarea pe Android real,
cu un set reprezentativ de exemple autorizate.
Rezultatul este o decizie documentata, nu o demonstratie cu un singur document bun.

### Etapa B: prima felie functionala

Introducere manuala -> atasament foto/import -> salvare locala -> lista ->
cautare dupa metadate -> deschidere -> corectare -> export/backup si restaurare.
Persistenta se verifica dupa inchiderea fortata si redeschiderea aplicatiei.
Aceasta etapa trebuie sa fie utila si fara OCR.

### Etapa C: MVP Android asistat

Scanare multipagina, OCR pe tiparit, sugestii cu confirmare, cautare in text,
legaturi document-elev, locatie fizica, loturi cu metadate comune si deduplicare
exacta prin hash. Asemanarea dintre pagini produce avertismente, nu stergeri automate.

### Etapa D: pilot si extindere

Feedback din secretariat, masuratori pe telefoanele tinta, volume realiste,
acces/distribuire controlata si imbunatatiri ale fluxului.
Apoi iOS; web si sincronizare cand cerintele multiutilizator sunt definite.
Extractia manuscriselor si a tabelelor complexe nu este inclusa implicit in MVP.

## 9. Criterii de acceptare propuse

Tintele numerice sunt ipoteze de discutat, nu rezultate deja masurate:

| Caz | Verificare |
| --- | --- |
| Offline | Introducere, consultare si cautare in mod avion; documentarea dependentei de modele descarcate |
| Persistenta | Inchidere fortata in fiecare pas si reluare fara pierderea paginilor deja confirmate ca salvate |
| OCR | Acuratete pe caractere si exactitate pe campuri, separat pentru tiparit/manuscris; fara procent global promis |
| Productivitate | Timpul median de indexare comparat cu introducerea complet manuala pe aceleasi documente |
| Cautare | Tinta initiala p95 sub o secunda la 10.000 de inregistrari pe un telefon tinta definit, raportand separat volumul de pagini/text |
| Integritate | Originalul nu este modificat; paginile, ordinea si legaturile supravietuiesc exportului/restaurarii |
| Criptare | Build-ul refuza deschiderea operationala daca protectia ceruta lipseste; fisierele sunt verificate separat |
| Recuperare | Restaurare pe alt dispozitiv cu materialul de recuperare; eroare explicita la parola gresita sau arhiva incompleta |
| Cazuri dificile | Nume identice, schimbari de nume, transferuri, pagini duble, PDF mare, permisiuni refuzate, stocare insuficienta |

## 10. Decizii care necesita raspuns

Prima intrebare: ce predomina in arhiva reala - documente tiparite, scrise de mana
sau un amestec? Raspunsul modifica radical asteptarile si proba OCR.

Ulterior se confirma, pe rand: un dispozitiv sau mai multe simultan; volumele
actuale si anuale; cine opereaza; echipamentele; documentele prioritare;
exporturile obligatorii; politica de backup si restrictiile privind cloud-ul.

## 11. Surse consultate

- Paperless-ngx, documentatia din sursa:
  https://github.com/paperless-ngx/paperless-ngx/blob/main/docs/index.md
- Paperless-ngx, nota privind datele necriptate:
  https://github.com/paperless-ngx/paperless-ngx/blob/main/README.md
- Docspell, functionalitati, arhitectura si licenta:
  https://github.com/eikek/docspell/blob/master/README.md
- ML Kit, exemple oficiale:
  https://github.com/googlesamples/mlkit
- ML Kit, exemplul Android de scanare:
  https://github.com/googlesamples/mlkit/tree/master/android/documentscanner
- Expo SQLite, FTS, configurare web, SQLCipher si verificarea suportului:
  https://github.com/expo/expo/blob/main/docs/pages/versions/unversioned/sdk/sqlite.mdx
- Tesseract, capabilitati si formate:
  https://github.com/tesseract-ocr/tesseract/blob/main/README.md
- Model Tesseract pentru romana:
  https://github.com/tesseract-ocr/tessdata_fast/blob/main/ron.traineddata

Aceste surse verifica existenta capabilitatilor mentionate, nu potrivirea sau
performanta lor in docArchive. Legislatia actualizata si ofertele comerciale locale
raman de verificat din surse primare accesibile.
