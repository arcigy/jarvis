# Jarvis automations

## Prepis zmluv pre klientov

MCP alebo dashboard vyplní `docs/contracts/contract-intake.schema.json`. Výstupom sú dve DOCX šablóny:

- `docs/contracts/templates/ramcova-zmluva-univerzalna.docx`
- `docs/contracts/templates/projektova-priloha-univerzalna.docx`

Arcigy údaje ostávajú pevné. Klient, projekt, cena, moduly, výstupy a akceptačné kritériá sú formulárové hodnoty.

Generovanie z vyplneného JSON formulára:

```powershell
python scripts\generate_contract_documents.py --input docs\contracts\examples\sample-intake.json --output-dir generated\contracts
```

## Cold outreach prehľad

Odpoveď MCP má byť krátka a akčná:

> Za posledných 7 dní sme napísali 320 ľuďom. 48.4% si email otvorilo, 31 ľudí odpísalo, z toho 9 pozitívne. Pripravil som 9 odpovedí na pozitívne reakcie a pošlem ich až na tvoje potvrdenie.

Implementácia sumarizácie je v `src/automation-system/cold-outreach-summary.ts`.

## Lokálni klienti a leads

Email je primárny identifikátor v `local_people.primary_email`. Variabilné údaje sú v `data_json`, aby sa pre každú klientsku automatizáciu nevytvárali nové tabuľky.

Logika párovania je v `src/automation-system/identity-matching.ts`. Otvorené potreby klienta sa ukladajú do `client_need_signals` a Jarvis odpoveď skladá cez `src/automation-system/jarvis-intents.ts`.

## Jarvis hlas

Desktop listener je definovaný ako vypnutá automatizácia, kým nebude pripojená desktopová vrstva. Wake word je `Jarvis`; po aktivácii má spustiť lokálny intent, použiť schválené MCP nástroje a odpovedať hlasom.
