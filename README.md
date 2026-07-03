# Vrijstellingenchecker Stad Gent - prototype

Statische webapp in **HTML, CSS, JavaScript en JSON** voor intern gebruik door medewerkers.

## Wat zit erin?

- Landing met adres/contextvragen.
- FME/GIS-placeholder in `src/fme-placeholder.js`.
- Themakeuze met tegels voor hoofdstuk 2 t.e.m. 13 van het Vrijstellingsbesluit.
- Technische checklist per thema.
- Gerichte ABR-checks voor Gent: bomen, horeca, opritten, verharding, grachten en groendaken.
- Conclusie: `vrijgesteld`, `niet vrijgesteld` of `bijkomend onderzoek nodig`.
- Kopieerbare typetekst voor antwoord aan burger.

## Bronnen gebruikt

- `Wetgeving light view _ EMIS Navigator-vrijstellingsbesluit.pdf`
- `ABR versie 2024 - gecoördineerd.pdf`
- `beslissingsboom_vrijstellingenchecker_inhoudsversie_v2.docx`, inclusief opmerkingen.

## Lokaal openen

Omdat de browser JSON via `fetch()` laadt, werkt openen via dubbelklik soms niet. Gebruik één van deze opties:

```bash
cd vrijstellingenchecker_repo
python3 -m http.server 8000
```

Open daarna `http://localhost:8000`.

## Eenvoudig delen met 60 collega's

Aanbevolen fase 1:

1. Plaats deze map in een GitHub repository.
2. Activeer GitHub Pages voor demo/tests.
3. Embed of link de gepubliceerde pagina in een SharePoint-pagina of Teams-tab.
4. Laat één inhoudelijk beheerder wijzigingen doen in `data/rules.json`.

Waarom zo? Collega's hoeven niets te installeren en gebruiken gewoon een link.

## Waar pas je regels aan?

- `data/rules.json`: vragen, themategels, ABR-blokken en basisteksten.
- `src/app.js`: renderlogica en evaluatie van antwoorden.
- `styles.css`: huisstijl en layout.

## Belangrijke inhoudelijke waarschuwing

Dit is een werkbaar prototype. De juridische drempels in `src/app.js` zijn bewust transparant en eenvoudig, maar moeten in een volgende iteratie per artikel nog inhoudelijk gevalideerd worden door de dienst. Vooral samengestelde uitzonderingen vereisen testcases.
