# Scenariu sintetic de arhiva scolara — schema v1

Aceasta prima felie executabila reproduce modelul din issue si din documentul
de descoperire; scenariul si migrarea propuse anterior nu existau pe ramura de baza.
Toate persoanele si documentele din seed sunt **SINTETICE**, marcate atat in
denumire, cat si prin `is_synthetic = 1`. Nu sunt incluse CNP-uri, date personale
reale, documente scanate, conturi sau secrete. Nu formulam concluzii de conformitate.

## Scenariul

- O institutie sintetica, doi ani scolari: 2024–2025 si 2025–2026.
- Clasele I–VIII (`grade_level` 1–8), fiecare cu sectia `A` in ambii ani.
  In al doilea an exista si sectia V `Atelier`, pentru a demonstra ca sectiile
  sunt inregistrari configurabile, nu o lista fixa de litere.
- Noua elevi sintetici: opt inscrisi in primul an; primii sapte au o noua
  inscriere in clasa urmatoare, al optulea termina VIII. Un elev nou intra in I.
  Inscrierile vechi raman cu starea `promoted` sau `completed`; promovarea
  nu modifica clasa inscrierii vechi si nu este automatizata de schema.
- Doua cadre sintetice si doua discipline demonstrative. Repartizarile sunt
  date legate de sectie (deci si de an); acelasi cadru poate avea mai multe
  sectii, discipline si roluri. Nu presupunem un numar fix de profesori.
- Un catalog primar, un registru matricol multianual si un dosar de inscriere,
  toate sintetice. Un catalog are legaturi spre mai multi elevi, iar un elev
  spre mai multe documente. Doua persoane pot aparea pe aceeasi pagina.
- Doua transcrieri optionale: `FB` in I, in asteptarea verificarii, si `8` in V,
  confirmata doar ca exemplu de stare. Confirmarea nu certifica documentul.

## Schema implementata

Sursa executabila este `db/migrations/001_school_archive.sql`.
Identificatorii sunt `TEXT`; seed-ul foloseste UUID-uri deterministe, rezervate
demonstratiei. Un viitor client trebuie sa genereze identificatori global unici;
schema nu valideaza sintaxa UUID. Cai de fisiere nu sunt folosite ca identitate.

| Tabel | Relatii si reguli |
| --- | --- |
| `institution` | Denumire nevida si marcaj sintetic explicit. |
| `academic_year` | Apartine institutiei; inceput intreg intre 1900 si 9998, sfarsit = inceput + 1; un inceput distinct pe institutie. |
| `class_section` | Institutie, an, nivel intreg I–VIII, nume liber nevid; combinatia an/nivel/sectie este unica. |
| `student` | Identitate stabila, institutie, nume de afisare nevid si marcaj sintetic; numele nu este identificator unic. |
| `enrollment` | Elev, sectie si nivel; o inscriere per elev/sectie, cu stare `active`, `promoted`, `transferred` sau `completed`. Istoricul anual este format din randuri separate. |
| `staff`, `subject` | Personal cu marcaj sintetic si discipline configurabile pe institutie. |
| `staff_assignment` | Cadru, sectie, disciplina optionala, rol liber nevid. Mai multe repartizari sunt permise; un rol fara disciplina poate reprezenta coordonarea sectiei. |
| `archive_document` | Tip `catalog`, `matriculation_register`, `enrollment_file` sau `other`, titlu, locatie fizica optionala si marcaj sintetic. |
| `document_academic_year` | Legatura multipla document/an; permite registre multianuale si documente inca neincadrate temporal. |
| `document_page` | Pagini numerotate cu intregi pozitivi, unice in document; doar metadate, nu fisiere imagine/PDF. |
| `document_student` | Legatura multipla document/elev, inclusiv cand pagina relevanta nu este inca identificata. |
| `document_student_page` | Pagina relevanta pentru un elev deja legat de document; pagina trebuie sa existe in acelasi document. |
| `grade_transcription` | Inscriere, elev, nivel, disciplina, document/pagina pentru acel elev, rezultat si stare obligatorie `pending`, `confirmed` sau `rejected`. |

Cheile externe compuse includ institutia pentru a respinge legaturi accidentale
intre institutii. Nivelul este repetat in `enrollment` si `grade_transcription`
pentru a impune prin chei externe concordanta cu sectia si pentru a valida
tipul rezultatului fara triggere. Modificarile care ar invalida aceste legaturi,
inclusiv schimbarea nivelului unei sectii deja referite, sunt respinse.

Tabelele sunt `STRICT`: valorile incompatibile cu tipul coloanei sunt respinse.
SQLite poate converti fara pierdere, de exemplu textul `'8'` in numarul `8`;
schema valideaza valoarea stocata, nu reprezentarea initiala dintr-un viitor UI.
In I–IV se admite exact un calificativ `FB`, `B`, `S` sau `I`, fara valoare
numerica. In V–VIII se admite exact o valoare numerica intre 1 si 10, inclusiv
zecimale, fara calificativ. Rezultatele nule, mixte sau in afara domeniului sunt
respinse. Transcrierea nu poate exista fara inscriere si legatura elev/pagina
sursa. Mai multe transcrieri pe aceeasi sursa sunt permise; nu calculam medii,
clasamente, promovari sau performanta.

Stergerile nu au `CASCADE`: referintele existente trebuie tratate explicit,
pentru a nu pierde accidental istoricul sau provenienta. Transferul poate fi
reprezentat prin inscrieri in sectii diferite in acelasi an; nu exista inca
date de intrare/iesire sau reguli pentru suprapuneri. Schimbarea institutiei
si reconcilierea identitatilor intre institutii raman de proiectat.
Starea inscrierii nu este o masina de stari; pastrarea istoricului este un
contract al operatiilor clientului, nu un jurnal imuabil in aceasta schema.

## Aplicare si verificare locala

Necesare: Python 3 cu SQLite **3.37.0+**; pentru comenzile SQL de mai jos,
CLI-ul `sqlite3` de aceeasi versiune minima. Nu se instaleaza dependente Python.
Din radacina checkout-ului, testele se ruleaza astfel:

```sh
python3 -B -m unittest discover -s tests -v
```

Testele folosesc baze in memorie, aplica migrarea si seed-ul si verifica
integritatea, istoricul, sectiile/repartizarile configurabile, provenienta,
legaturile intre institutii si respingerea valorilor invalide.

Pentru o baza de demonstratie **noua**, din radacina checkout-ului:

```sh
sqlite3 -bail /tmp/docarchive-synthetic.sqlite < db/migrations/001_school_archive.sql
sqlite3 -bail /tmp/docarchive-synthetic.sqlite < db/seeds/synthetic_school.sql
sqlite3 -bail /tmp/docarchive-synthetic.sqlite \
  'PRAGMA foreign_keys=ON; PRAGMA user_version; PRAGMA integrity_check; PRAGMA foreign_key_check;'
```

Rezultat asteptat: versiunea `1`, apoi `ok`, fara randuri pentru verificarea
cheilor externe. Nu reutilizati o baza existenta pentru aceste comenzi:
migrarea si seed-ul se aplica o singura data, nu sunt scripturi de resetare.
Seed-ul este optional si separat de schema; nu se aplica pe date reale.

Migrarea activeaza cheile externe inaintea tranzactiei si fixeaza
`PRAGMA user_version = 1` numai impreuna cu crearea schemei. Scriptul trebuie
rulat fara o tranzactie deja deschisa. La eroare, apelantul trebuie sa faca
rollback/sa inchida conexiunea, nu sa continue sau sa confirme partial scriptul.
Pentru viitoare versiuni, clientul va citi `user_version` si va aplica doar
migrarile lipsa, in ordine; nu exista inca un runner de migrari in aplicatie.
**Fiecare conexiune SQLite trebuie sa activeze `PRAGMA foreign_keys = ON`**
inainte de orice tranzactie: setarea nu se pastreaza in fisierul bazei.

Acest prototip nu implementeaza fisiere originale/derivate, OCR, revizii,
criptare, autentificare, UI sau sincronizare. Nu folositi baza demonstrativa
pentru documente ori persoane reale.
