# docArchive

Aplicatie de arhivare si regasire a documentelor scolare din Romania.

Directia propusa: Android mai intai, apoi iOS si web, cu functionare locala,
introducere manuala, scanare, OCR asistat si posibilitate de sincronizare ulterioara.

## Stadiu

Proiectul este in etapa de definire a produsului. Nu exista inca o aplicatie
executabila. Tehnologiile si limitele MVP-ului sunt propuneri, nu implementari.

[Propunerea de produs, arhitectura si planul de implementare](docs/product-discovery.md)
include analiza preliminara a solutiilor existente, fluxurile de lucru,
riscurile si criteriile de validare.

## Principii

- Documentul original se pastreaza separat de imaginile prelucrate si de textul OCR.
- OCR-ul sugereaza date; utilizatorul confirma datele importante.
- Lucrul local nu presupune incarcarea documentelor intr-un serviciu cloud.
- Datele, fisierele si copiile de siguranta necesita protectie separata.
- Digitizarea nu este prezentata ca autorizatie de distrugere a originalelor.
- Nu se publica documente reale, date despre elevi sau chei in acest repository.
