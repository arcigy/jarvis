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

MCP entrypoint je `src/automation-system/mcp-server.ts`, tool `arcigy.get_cold_outreach_brief`.

## Lokálni klienti a leads

Email je primárny identifikátor v `local_people.primary_email`. Variabilné údaje sú v `data_json`, aby sa pre každú klientsku automatizáciu nevytvárali nové tabuľky.

Logika párovania je v `src/automation-system/identity-matching.ts`. Otvorené potreby klienta sa ukladajú do `client_need_signals` a Jarvis odpoveď skladá cez `src/automation-system/jarvis-intents.ts`.

MCP nástroje:

- `arcigy.upsert_local_person`
- `arcigy.add_client_need_signal`
- `arcigy.identify_email`

## Jarvis hlas

Desktop listener je definovaný ako vypnutá automatizácia, kým nebude pripojená desktopová vrstva. Wake word je `Jarvis`; po aktivácii má spustiť lokálny intent, použiť schválené MCP nástroje a odpovedať hlasom.

Stavový modul je `src/automation-system/jarvis-voice.ts`. Desktop vrstva mu posiela transcript eventy a modul vracia, či má začať nahrávať, prestať nahrávať a aký text má prečítať cez TTS.

MCP tool `arcigy.jarvis_voice_event` obslúži prechod z `idle` do `awake` po wake worde `Jarvis`.

Lokálny desktop shell je v `src/desktop` a spustí sa cez `npm run desktop`. Používa Electron fallback, pretože v tomto prostredí nie je dostupný Rust/Cargo pre Tauri.
