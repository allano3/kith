# Kith — *What is a friend?*

A private, local-first relationship discernment and reflection app. Kith helps you understand the nature, reliability, reciprocity and appropriate level of investment in your relationships **over time**, and make better decisions about friendship, dating, collaboration, trust and boundaries.

> Observe behavior. Identify patterns. Infer motives cautiously.

Kith is not a contact-ranking app. It never scores people, never labels anyone ("toxic", "fake friend"), and never diagnoses motives. It separates **what happened** from **what it might mean**, gives green flags the same weight as concerns, notices when people change, and applies the same standards back to you.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # engine, analyst, capture and encryption tests
npm run build      # type-check + production build (static files in dist/)
```

On first launch, create a passphrase. You can also start with **fictional example people** to explore every feature before recording your own.

## Install on iPhone

Kith is an installable web app hosted at **https://allano3.github.io/kith/**. Every push to `main` is tested and deployed by `.github/workflows/pages.yml`.

1. Open the address in **Safari**, tap **Share**, then **Add to Home Screen**.
2. Launch it from the Home Screen icon and create your passphrase there. The installed app keeps its own storage, separate from Safari, so data entered in a Safari tab won't appear in the app.
3. After the first launch it works offline. It asks iOS to keep its storage permanently; Settings shows whether iOS agreed. Save an encrypted backup to Files now and then (Settings → Your data).

Your data is tied to this web address. If the app ever moves to a different address, export an encrypted backup first and import it at the new one.

## Capturing texts from your Mac

A script on your Mac, scheduled with launchd (daily at 23:00 by default, or weekly with `install --weekly`), reads Messages **read-only**. It keeps only 1:1 conversations with the friends you list, and writes an encrypted file to iCloud Drive › Kith. On the phone, go to **Inbox → Import captured texts**. Kith *suggests* entries such as "cancelled plans, proposed another time" or "asked to borrow money". You add or skip each one. The message text is deleted once you've reviewed the conversation, and Kith never shows or analyses reply times.

Setup takes about five minutes and needs Full Disk Access for the Node binary. See [docs/CAPTURE.md](docs/CAPTURE.md).

## What's in the MVP

| Experience | What it does |
|---|---|
| **People** | Add people with a flexible taxonomy: a primary category plus other roles, and a circle you choose. Kith shows which circle the evidence suggests next to yours; you decide. |
| **Interaction log** | Quick entries across 37 interaction types: contact, care, commitments, trust, friction, repair, and requests. Each type asks only for its relevant fields. Optional private reflection. |
| **Relationship profile** | Type, circle vs evidence, trend, strengths, green flags, patterns (observation → interpretation), ten dimensions, trust by domain, open commitments, requests & advice, dating view, evidence timeline, memories, values, reflection prompts. |
| **Dashboard** | Closest relationships (not ranked by frequency), relationships that are improving, worth nurturing, needing recalibration, where boundaries may help, open decisions, commitments, and a monthly "does your investment match the evidence?" check. |
| **AI reflection** | Ask natural-language questions ("Who has consistently shown up for me?", "What patterns should I remember before meeting Sarah?"). Every answer has four sections: Known facts / Observed patterns / Possible interpretations / Unknowns. The analyst runs on-device; you can opt in to a model you configure. |

It also includes **Pause & Reflect** for requests that don't fit a relationship's pattern, **"How seriously should I take this?"** for advice, **Circles** (a concentric view modelled loosely on Dunbar's layers), and **Mirror & values** (are you the friend you expect others to be?).

## Privacy

- Everything is stored only on this device, in IndexedDB, **encrypted** with AES-GCM-256. The key is derived from your passphrase with PBKDF2-SHA-256 (600k iterations). The passphrase is never stored and can't be recovered.
- There are no accounts, no feed, no sharing, no public ratings, no analytics, and no third-party fonts or assets.
- AI processing is **off by default**. If you enable it (Ollama locally, OpenRouter, OpenAI, or Anthropic), Kith sends a structured evidence summary rather than your raw journal. Names are pseudonymized and notes are excluded by default. You can preview exactly what would be sent, and you confirm before the first call.
- You can export an encrypted backup or readable JSON, delete one person along with everything recorded about them, or delete everything.

## Documentation

- [docs/DESIGN.md](docs/DESIGN.md): information architecture, data model, assessment logic, flows, AI behavior, privacy, UI principles.
- [docs/CAPTURE.md](docs/CAPTURE.md): Mac text capture: setup, privacy properties, troubleshooting.
- [docs/RESEARCH.md](docs/RESEARCH.md): the research foundation (78 verified references). Covers reciprocity norms, trust development and repair, responsiveness, capitalization, maintenance, Dunbar layers and their critics, self-disclosure, commitment, courtship signaling, and cognitive biases. It maps each rule in the product to its evidence and states where the evidence is uncertain.

## Code map

```
src/domain     types, taxonomy (interaction types, categories, circles, flags), factories, demo data
src/engine     assessment: evidence → dimensions → patterns → circles/trend/domains,
               commitments, dating, Pause & Reflect, advice evaluation, dashboard, mirror
               (all thresholds in params.ts)
src/store      AES-GCM vault encryption, IndexedDB persistence, React vault context
src/ai         local analyst, evidence packet (pseudonymization), optional model client
src/capture    capture bundle contract, suggestion extraction, inbox import/review logic
src/pages      screens; src/ui shared components; src/styles.css design system; src/pwa.ts install/offline helpers
mac/           scheduled Messages capture (daily or weekly) (Node + /usr/bin/sqlite3, Keychain, launchd)
public/        web app manifest, icons, offline service worker
```
