# Quizgame

Ett partyquiz i tv-programstil. En dator visar spelet på en stor skärm (tv eller projektor), och alla spelare svarar med sina mobiler. Ingen app behövs – man skannar en QR-kod eller skriver in en rumskod.

**Spela direkt:** https://amahul.github.io/quizgame/

## Rundor

| Runda | Så går den till |
|---|---|
| Allmänbildning | Flervalsfrågor. Rätt svar ger 100 poäng. |
| Närmast vinner | Gissa en siffra. Exakt rätt ger 500 poäng, närmast 200 och näst närmast 100. |
| Skicka vidare | Ta frågan själv eller skicka den till någon annan. Svaret skrivs fritt. |
| Gissa ordspråket | Bokstäverna vänds en i taget – ju tidigare du gissar rätt, desto fler poäng. |
| Gissa ordet – teman | Som ordspråken, men med ett tema och en ledtråd. |
| Musik – snabbast vinner | Lyssna och välj artist eller låt bland fyra alternativ. |
| Musik – buzzer | Buzza först och skriv artist och låt. |

## Så håller du i ett spel

1. Öppna spelet på datorn som är kopplad till tv:n och välj **Starta ett spel**.
2. Välj ett färdigt upplägg (till exempel "Klassisk kväll") eller bygg ett eget: vilka rundor, i vilken ordning och hur många frågor.
3. Spelarna skannar QR-koden eller går till samma adress på mobilen, väljer **Gå med** och skriver in rumskoden.
4. Tryck **Starta** när alla är med. Du styr spelet med knapparna på skärmen.

Tips:

- Kontrollerna längst upp i mitten har helskärm (F), paus (P), hoppa över fråga, justera poäng och ljud (M).
- Tappar en mobil anslutningen återansluter den av sig själv, och spelaren behåller sina poäng.
- Alla enheter behöver internet. Spelet går direkt mellan datorn och mobilerna (WebRTC), men en gratis tjänst (PeerJS) används för att de ska hitta varandra.
- Musikrundorna spelar 30-sekundersklipp från Deezer, eller låtar från en mapp på datorn. Egna filer ska heta "Artist - Titel.mp3" och lämnar aldrig datorn.

## Lägg till egna frågor

Frågorna ligger i JSON-filer under `src/content/packs/`, en fil per frågepaket. Lägg till en ny fil, så kommer paketet med automatiskt i spelbyggaren.

Ett paket med flervalsfrågor (`src/content/packs/trivia/mitt-paket.json`):

```json
{
  "id": "mitt-paket",
  "name": "Mitt paket",
  "roundType": "trivia",
  "language": "sv",
  "region": "blandat",
  "difficulty": "medium",
  "items": [
    {
      "id": "sveriges-huvudstad",
      "question": "Vad heter Sveriges huvudstad?",
      "options": ["Göteborg", "Stockholm", "Malmö", "Uppsala"],
      "correct": 1,
      "region": "sverige",
      "fact": "Stockholm har varit huvudstad sedan 1600-talet."
    }
  ]
}
```

- `correct` är numret på rätt alternativ, räknat från 0.
- `region` är `sverige`, `internationellt` eller `blandat`. `difficulty` är `easy`, `medium` eller `hard`.
- Varje fråga behöver ett unikt `id`. Byt aldrig namn på ett id, eftersom spelet använder det för att minnas vilka frågor som redan har spelats.
- Är du osäker på ett faktum, lägg till `"verify": true` så syns frågan i kontrollistan nedan.

Andra rundor har egna fält:

- **Närmast vinner** (`"roundType": "closest"`): `"question"`, `"answer"` (ett tal), valfritt `"unit"` som `"km"` och `"year": true` för årtal.
- **Skicka vidare** (`"roundType": "pass"`): `"category"`, `"question"` och `"answers"` – en lista med godkända svar där det första visas.

Kontrollera alltid paketen efteråt:

```bash
npm run validate-content
```

Kommandot hittar formatfel, dubbletter och frågor markerade med `verify`.

## Kör spelet lokalt

Du behöver [Node.js](https://nodejs.org/) 20 eller senare.

```bash
npm install
npm run dev -- --host
```

Öppna sedan **Network**-adressen som Vite skriver ut (till exempel `http://192.168.0.22:5173/#/host`), inte `localhost` – annars fungerar inte QR-koden för mobilerna. Datorn och mobilerna måste vara på samma wifi.

Andra kommandon:

```bash
npm test                  # kör testerna
npm run build             # bygger sidan till dist/
npm run validate-content  # kontrollerar frågepaketen
```

För att testa utan riktiga spelare kan du öppna `#/host?bots=3` under utveckling, så får du låtsasspelare.

## Publicering

Varje push till `main` testar, kontrollerar frågorna, bygger och publicerar sidan på GitHub Pages via `.github/workflows/deploy.yml`. Sidan är helt statisk och har ingen egen server.
