# Kith — Design

**What is a friend?** Kith is a private relationship-discernment journal. It helps you decide what kind of relationship something is and how much trust, attention, expectation, vulnerability and investment fit it, based on patterns over time.

Guiding rule: **observe behavior, identify patterns, infer motives cautiously.** The goal is discernment, not suspicion.

The research behind each rule is in [RESEARCH.md](RESEARCH.md). Section references below (§) point there.

---

## 1. Information architecture

```
Overview (/)                 dashboard: closest, improving, worth nurturing, recalibration,
                             boundaries, people who show up, open decisions, commitments
People (/people)             list, search, filter by circle
 ├─ Add / edit person        categories (primary + roles), circle, since, contexts, capacity, notes
 └─ Relationship profile     §20 of the brief: type, circle vs evidence, trend, strengths, green flags,
                             patterns, dimensions, trust by domain, commitments, requests & advice,
                             dating view, timeline, memories, values, prompts, delete
Log interaction (/log)       fast entry; type-specific fields; Pause & Reflect after risky requests
Circles (/circles)           concentric visualization, placed vs suggested, user moves people
Reflect with AI (/ask)       natural-language questions → Known facts / Observed patterns /
                             Possible interpretations / Unknowns
Mirror & values (/reflect)   the same standards applied to you; values; investment review
Privacy & settings           encryption, auto-lock, AI controls + preview, export/import, delete
```

There is no feed, no sharing, no accounts and no public ratings. Nothing about another person ever leaves the device unless you set up an AI provider and confirm a specific request.

## 2. Data model (`src/domain/types.ts`)

The only thing stored is what you observed. Every assessment is recomputed from it on demand, so there is one source of truth and nothing derived can go stale.

| Entity | Key fields | Notes |
|---|---|---|
| `Vault` | `people`, `interactions`, `settings` | One encrypted JSON document per device. |
| `Person` | `categories[]` (first = primary), `circle` (user-chosen, 1–5 or none), `since`, `contexts`, `capacityNote`, `domainTrust` (your own view per domain), `values` (stance per personal value), `datingStatus` (your own read), `lastReviewed`, `archived` | The taxonomy is flexible: someone can be a close friend *and* a collaborator. |
| `Interaction` | `date`, `type` (37 types in 7 groups), `actor` (`me`/`them`/`both`), `significance`, `note`, `reflection`, `mood`, `focus`, `balance`, `influence`, `trustDomain`, `outcome`, `requestKind`, `conflictOfInterest`, `independentEvidence`, `inviteResponse`, `reception`, `rescheduleOffered`, `costly`, `dueDate`, `released`, `relatesTo`, `greenFlags[]`, `concerns[]`, `decision` | `actor` wording is type-specific ("Who cancelled?", "Whose promise?"). |
| `Settings` | `values[]`, `ai` (provider, baseUrl, model, apiKey, `pseudonymize`, `includeNotes`), `autoLockMinutes`, `lastInvestmentCheck` | The API key lives inside the encrypted vault. |

**Commitments are not a separate table.** A `promise_made` or `plans_made` interaction is a commitment. Resolutions (`promise_kept`, `promise_broken`, `cancelled_plans`, `rescheduled_plans`, `met_in_person`) point back to it with `relatesTo`. `deriveCommitments` works out status, due date after reschedules, overdue state, who cancelled, and whether a cancellation was ever rescheduled (fresh plans within 30 days count).

**Response time is deliberately not modeled** (§2.27). There is no field for it, so it can't creep into any inference.

## 3. Assessment logic (`src/engine`)

### 3.1 Dimensions, not a score

Each relationship is assessed on ten dimensions: reciprocity, reliability, trust, care, mutuality, growth, respect, consistency, emotional safety, and availability. The result is a qualitative **level** plus a **confidence** and factual **observations**:

| Level | Shown as |
|---|---|
| strong | "Strong evidence …" (for example, "Strong evidence of mutual investment") |
| solid | "Generally …" |
| mixed | "Some uncertainty" / "Balance varies" |
| concern | "Worth noting" (for example, "Recent reliability concerns"), in clay, never red |
| insufficient | "Not enough evidence yet" |

No number is ever shown. There is an internal balance used only to sort lists, and it is never rendered.

**How evidence is weighed** (`evidence.ts`, `dimensions.ts`):

- Each interaction produces signed evidence on specific dimensions. For example, `promise_kept` by them gives reliability +1 and trust +0.3. A confidence they broke gives trust −2 and is marked *severe*.
- **Recency.** Routine evidence has a half-life of 180 days. Rare, high-information acts (showing up in a crisis, or help marked "this cost them something", which also counts ×1.5) have a half-life of 365 days. **Breaches don't fade by time alone.** They only start to decay after repair behavior (an apology, reconciliation, or behavior improving) (§2.5).
- **Patterns over incidents.** A dimension only reaches *concern* when negatives outweigh positives *and* at least two separate negative events happened in the past year. A single incident never redefines a relationship. It can at most appear as a "Significant event".
- **Confidence** comes from the number of data points: under 3 is insufficient, 3–5 low, 6–11 moderate, 12 or more high. It drops one step when most of the evidence is stale.
- **Availability is kept separate from care** (§2.10). It uses declined invitations and changes in contact frequency, is phrased as capacity ("Limited availability right now"), and never affects circle suggestions.

**Reciprocity is tolerant by design** (Clark & Mills; §2.2). It looks at up to 16 initiations in the trailing year. The user starting more than 60% is *mixed*, and at 75% or more a low-confidence "You usually initiate" observation appears. *Concern* needs all of the following:

- sustained one-sidedness: at least 80% over at least 12 initiations spanning at least 90 days
- a corroborating signal: help flowing mostly one way, the user noting they felt drained or hurt at least twice, or little other evidence of care
- no capacity note recorded for the person (a demanding season softens the reading instead)

**Consistency** measures regularity against the relationship's *own* rhythm, so infrequent but steady contact counts as consistent. Silences are shared, so they never count against the other person. A "silence ended with a request" is shown as an observation. It becomes a pattern only after three cycles.

### 3.2 Patterns (`patterns.ts`)

Every pattern has `observation` (facts, counts) and `interpretation` (hedged), plus an optional `suggestion`. There are four kinds: **strength**, **concern** ("worth noting"), **change**, and **context**.

| Pattern | Example observation |
|---|---|
| One-sided / uneven initiation | "You initiated nine of the last eleven conversations." |
| They make the effort (strength) | "They initiated seven of the last eleven conversations, not counting requests." |
| Repeated cancellations | "Four of the last six planned meetings were cancelled by them; one was never rescheduled." |
| Low follow-through / follows through | "Three commitments have remained unresolved." / "Kept all four promises made in the past year." |
| Request-centered contact | "Five of the previous six conversations they started began with a request…" |
| Contact resumed with a request | "After eight months without contact, they got in touch in September with a business proposal." |
| Quiet season / reconnection | "No recorded contact for eleven months." / "…you've connected four times in the last three months." |
| Shows up in hard times | "Was there for you during difficulty twice, most recently in March." |
| Boundary friction | "Three times in the past year a boundary was crossed or you felt pressured." |
| Significant event + trust recovery | Trust is *recovering* after 3 or more trustworthy acts over at least 60 days, and *could be restored* after 6 or more over at least 180 days with no new breach. |
| Conflict followed by repair | "After the conflict in October: apology received, issue discussed." |
| Forgiveness and trust | "You forgave in October. Since then: four promises kept, zero broken." Forgiveness is tracked separately from restored trust. |
| How you've been feeling | "You noted feeling drained or hurt after four of the last five interactions…" (described as your experience, not their intent) |
| Help imbalance | Framed with communal norms in mind. |
| Change over time | Compares the last 6 months with the 6–18 months before. Each window needs at least 3 data points. |

### 3.3 Circles, categories, trend

- **Suggested circle** (`suggestCircle`):
  - **5 (limited/caution)** only for concerns about respect, safety or trust. Flaky plans or uneven effort call for lighter expectations, not caution.
  - **1** needs strong trust and safety, positive reliability, reciprocity and care, at least 12 months of history, and at least moderate trust evidence.
  - **2** needs four or more positive core dimensions and at least 6 months of history.
  - **Forming** relationships (under 3 months or under 10 interactions) are never suggested for 1–2.
  - Circle size guidance follows Dunbar's layers (about 5 / 15 / 50 / 150) and is informational only. Circle 5 is Kith's own category, not a Dunbar layer.
- **Expectation gap.**
  - `exceeds` when your circle is closer than the evidence by two or more rings, or the evidence suggests caution, or a core dimension is a concern. Shown as "Your expectations may currently exceed demonstrated reciprocity".
  - `below` when the evidence supports more closeness than your placement.
- The **suggested category** is a suggestion only. The user always decides, and a move only happens when the user confirms it.
- The **trend** (improving, stable, declining, unclear) comes from per-dimension change, then from the average recent vs earlier balance. It is unclear when there were fewer than 4 interactions in the past year.

### 3.4 Trust by domain

Competence is domain-specific, but integrity isn't (Mayer, Davis & Schoorman; §2.4):

- Domain evidence comes from advice outcomes, help, confidences kept or broken, crisis support, and collaboration results. It is rated strong, some, mixed, concern, or limited.
- An unrepaired breach sets `integrityConcern`, which is shown across every domain.
- Your own per-domain rating is stored next to the evidence and never overwritten by it.

### 3.5 Pause & Reflect and advice evaluation (`pause.ts`)

**Pause & Reflect.** Requests are normal between friends (§2.24). The full pause appears only when a request **differs from the relationship's pattern**. It checks for:

- a long silence before the request, or rare recent initiation
- mixed or low follow-through
- a thin track record in the requested domain, or a first request in a new domain
- a conflict of interest
- pressure to decide quickly
- an unrepaired breach
- romantic interest that is new relative to the recent pattern
- stakes above the circle you placed them in

It shows "Context worth remembering" (history *before* the request, so recency bias can't hide it), what differs, the §10 questions plus kind-specific ones, and this guidance: *"Because this differs from the recent relationship pattern, consider understanding the person's objective before making a commitment."* Consistent requests get a calm note instead.

**"How seriously should I take this?"** weighs relationship context, domain track record, advice history in other domains, conflicts of interest (disclosing a conflict doesn't remove it, per Cain et al.), consistency of involvement, and independent evidence. It never recommends accepting or rejecting advice because of friendship status. Example: "Marcus has historically been reliable with career advice, but there is limited evidence regarding financial advice. Evaluate this independently."

### 3.6 Dating mode (`dating.ts`)

Mutual-interest signals:

- who initiates
- who proposes plans
- responses to invitations, including declining with an alternative
- engagement over the last 45 days compared with the 45 days before
- mutual curiosity
- remembering what you shared
- cancellations
- consistency

Statuses: insufficient information (fewer than 4 interactions), early interest, mutual interest emerging, relationship developing, mixed signals, and low demonstrated investment. "Friendship rather than romantic momentum" can only be set by the user. The view never shows a probability of interest, never uses response time, and always says it describes behavior, not feelings.

### 3.7 Dashboard and mirror (`dashboard.ts`)

**Dashboard buckets:**

- closest: suggested circle 1–2, ordered by trust, reciprocity, reliability, consistency, safety and mutuality. Frequency of contact doesn't count.
- worth nurturing: healthy relationships past the check-in cadence (30, 90, 180 or 365 days for circles 1–4), or where evidence suggests more closeness than your placement
- needing recalibration
- boundaries: two or more unresolved concern patterns, or boundary friction, or a significant event, and not already improving
- improving
- open decisions
- your commitments and their overdue ones
- a monthly investment check

**The mirror** applies the same standards to you:

- Do you follow through?
- Are you available?
- Do you initiate?
- Do you keep confidences?
- Do you show up?

It also lists valued people who haven't heard from you, and people where you may be receiving more than you give.

## 4. Key interaction flows

1. **First run.** Create a passphrase, with optional fictional example data. The vault is encrypted immediately.
2. **Add person.** Pick a primary category (which pre-fills a typical circle), other roles, and a circle (your choice), then open the profile.
3. **Log an interaction** (about 20 seconds):
   1. Pick the person and type. The type's hint shows.
   2. Answer the actor question in the type's own wording.
   3. Fill in the type-specific fields, a note, and optionally a reflection, mood, significance, green flags, or "something felt off?".
   4. Save, which returns you to the profile. If you noted feeling hurt, Kith suggests revisiting the entry in a day or two.
4. **A request arrives.** Log a "Request or proposal". Pause & Reflect opens if the request differs from the pattern and the decision stays open on the dashboard; otherwise you get a calm note. Mark it decided, with a note, when ready.
5. **Advice.** Log advice with its domain. "How seriously should I take this?" gives a four-section evaluation. Record the outcome later, which feeds the domain track record.
6. **Commitments.** Log a promise or plans. Resolve them later from the profile: kept, happened, cancelled by them or you (with or without another time proposed), rescheduled, or released.
7. **Investment review** (monthly prompt). For each person, compare your circle with what the evidence suggests, then keep it or move it.
8. **Ask.** Type a natural-language question and get an answer in four sections, computed on the device. Optionally you can ask the configured model, after a consent screen shows the exact evidence packet.

## 5. AI behavior (`src/ai`)

Every answer has exactly four sections: **Known facts**, **Observed patterns**, **Possible interpretations**, and **Unknowns**.

- **Local analyst (default).** It classifies the question's intent (characterize, closest, disproportionate investment, who showed up, neglect, before meeting someone, trusting a suggestion, dating reciprocity, what changed, boundaries, credible advice, mirror) and answers only from the engine's output. It works fully offline.
- **Optional model.** Supported providers are OpenAI-compatible endpoints (Ollama locally, OpenRouter, OpenAI) and Anthropic. The model receives a structured **evidence packet**, not the raw vault:
  - names are pseudonymized by default ("Person A"), including inside notes
  - notes and reflections are excluded by default
  - aliases are restored on the device after the answer returns
  - the system prompt enforces the same principles: answer only from the evidence, hedge interpretations, never diagnose or assign motives, never tell the user to accept or reject advice or to drop someone, and treat response time as not evidence
  - the answer must be JSON in the four sections; unparseable output is an error, never a made-up answer
- There is a preview of exactly what would be sent, and consent is required before the first model call in a session. Chat history is kept in memory only.

## 6. Privacy & security

- **Encryption at rest.** AES-GCM-256 with a fresh random IV on every save. The key is derived with PBKDF2-SHA-256 (600,000 iterations, random 16-byte salt). The key is non-extractable and held only in memory while unlocked. The passphrase is never stored. Only sealed data is written to IndexedDB.
- **Auto-lock** after inactivity (15 minutes by default) and a lock button. Locking drops the key and the decrypted data from memory. On phones, where background timers pause, time away is checked again whenever the app comes back to the foreground.
- **No third-party requests.** System fonts only, no analytics, and `referrer` set to no-referrer. The app downloads only its own code from its static host (GitHub Pages). A service worker caches that code, never personal data, so the app works offline. The only outbound request that can carry your data is the AI call you configure.
- **Installed app.** The installed web app has its own storage, separate from Safari, and asks iOS to keep that storage permanently (`navigator.storage.persist()`; Settings shows whether iOS agreed). Backups are saved through the share sheet ("Save to Files"), because installed iOS web apps ignore ordinary downloads.
- **Text capture** (optional, [CAPTURE.md](CAPTURE.md)). A Mac script reads Messages read-only on a schedule (daily at 23:00 by default, or weekly). It keeps only 1:1 conversations with listed friends, including your own replies in those threads, so the app can tell who started a conversation; capturing only incoming texts would make every conversation look like the other person reached out. It seals them with a separate capture passphrase and writes the bundle to iCloud Drive. In the app, each conversation becomes suggestions built only from observable events, each with a template note that never quotes the message. Nothing is logged without a tap. The message text is deleted when the conversation has been reviewed; only the message IDs are kept (for 120 days) to avoid duplicates. Message times are used only to order messages and split conversations. They are never shown and never analysed as reply latency.
- **Deletion.** Deleting a person hard-deletes every interaction recorded about them. "Delete everything" removes the database. A forgotten passphrase means the data can't be recovered; the only option is to delete and start over.
- **Export.** An encrypted backup (portable, same passphrase) or readable JSON (with an explicit warning). Import accepts either.

## 7. UI principles

- Calm and private: paper tones, serif headings, and a sage/clay/dusk/stone palette. There is no alarm red.
- No gamification: no scores out of 100, leaderboards, streaks, badges, or "toxic" labels.
- Green flags and strengths get the same visual weight as concerns. Improvement has its own section on the dashboard.
- Observation always comes before interpretation. Interpretations are set in serif italic so they read as readings, not facts.
- The user has control everywhere. The engine suggests; every change to a circle, category or trust level is an explicit user action.

## 8. Tuning & tests

- All thresholds live in `src/engine/params.ts`, and their rationale is in RESEARCH.md §6.
- `src/engine/engine.test.ts` covers: patterns over incidents, change detection, tolerant reciprocity (plus corroboration and capacity), commitment derivation, breaches that don't fade until repair, trust recovery, circle-5 rules, forming relationships, Pause & Reflect triggers, and a language guard. The guard checks that no generated text anywhere in the demo diagnoses, labels character, or scores, and that advice evaluation never says accept or reject.
- `src/store/crypto.test.ts` covers the encryption round-trip, rejecting a wrong passphrase, and a fresh IV on every save.
