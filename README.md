# MedDrop – Smart Medicine Return and Disposal System

SWE 401 final project prototype.

## Project structure

```
index.html              page shell (Presentation layer)
css/style.css           all styling
js/models.js            classes from the Class Diagram, with the Sequence Diagram methods
js/data.js              the five tables (Users, Medicines, DisposalGuidance, CollectionFacilities, ReturnRequests)
js/ai-api.js            AI Recognition API (the external actor in SD UC-01)
js/app.js               pages, routing and the three portals
server/MedDropServer.java   Java back end: serves the site and calls the AI vision API
```

## Deploy without a back end (GitHub Pages, Netlify, any static host)

Upload the folder as it is – `index.html`, `css/` and `js/` are all a static host needs
(the `server/` folder is ignored). Everything works in the browser.

To switch on photo reading on a static site, sign in as the administrator and paste an
Anthropic API key under **Photo reading** on the Administrator dashboard. The key is saved
only in that browser and sent only to Anthropic, straight from the browser. It is never
written into the code, so it can't leak through the repository. Use a key with a spending
limit, and switch it on only on your own device (e.g. the laptop you present from).

## Or run it with the Java back end (key kept on the server)

You need Java 11 or newer and an Anthropic API key (from console.anthropic.com).

macOS / Linux:

```
cd meddrop
export ANTHROPIC_API_KEY=sk-ant-your-key
java server/MedDropServer.java
```

Windows (Command Prompt):

```
cd meddrop
set ANTHROPIC_API_KEY=sk-ant-your-key
java server\MedDropServer.java
```

Open http://localhost:8080. The console says `Photo reading is ON` when the key is set.

The key stays on the server. The browser sends the photo to `/api/recognize` on the
MedDrop server, and the server adds the key and calls the AI API. Never put the key in a
JavaScript file – anyone can read those.

Optional settings: `PORT` (default 8080), `MEDDROP_AI_MODEL` (default `claude-sonnet-5-5`).

## Sample accounts

All use the password `Demo@123`:

| Role | Email |
|---|---|
| Household user | sara@example.com |
| Facility staff | khalid@meddrop.ae |
| Administrator | admin@meddrop.ae |

## Notes

- Records are kept in the browser (localStorage). The administrator dashboard has
  "Restore sample data".
- Opening `index.html` directly (double-click) works for everything except reading real
  photos; the sample photos on the "Use a photo of the box" tab still work.
