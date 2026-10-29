# docArchive

Aplicatie de arhivare si regasire a documentelor scolare din Romania.

Directia propusa: Android mai intai, apoi iOS si web, cu functionare locala,
introducere manuala, scanare, OCR asistat si posibilitate de sincronizare ulterioara.

## Stadiu

Proiectul este in etapa de definire a produsului. Nu exista inca o aplicatie
executabila. Prima felie de model SQLite, seed-ul sintetic si testele de
integritate sunt implementate; restul tehnologiilor si limitele MVP-ului raman propuneri.

[Propunerea de produs, arhitectura si planul de implementare](docs/product-discovery.md)
include analiza preliminara a solutiilor existente, fluxurile de lucru,
riscurile si criteriile de validare.

## Model SQLite si teste locale

[Scenariul sintetic si schema implementata](docs/demo-scenario-school-6.md)
descriu institutiile, clasele I-VIII, istoricul inscrierilor si sursele documentare.
Nu sunt necesare pachete externe: Python 3 cu SQLite **3.37.0+** (tabele `STRICT`).
Din radacina checkout-ului:

```sh
python3 -B -m unittest discover -s tests -v
```

Migrarea versionata este in `db/migrations/001_school_archive.sql`; seed-ul
optional, exclusiv sintetic, in `db/seeds/synthetic_school.sql`.
Comenzile pentru o baza locala sunt in scenariu. Acest model nu implementeaza
un catalog electronic, OCR, protectia fisierelor sau sincronizare.

## Principii

- Documentul original se pastreaza separat de imaginile prelucrate si de textul OCR.
- OCR-ul sugereaza date; utilizatorul confirma datele importante.
- Lucrul local nu presupune incarcarea documentelor intr-un serviciu cloud.
- Datele, fisierele si copiile de siguranta necesita protectie separata.
- Digitizarea nu este prezentata ca autorizatie de distrugere a originalelor.
- Nu se publica documente reale, date despre elevi sau chei in acest repository.
