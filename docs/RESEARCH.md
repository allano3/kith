# Kith — Research Foundation

> "What is a friend?" — Observe behavior. Identify patterns. Infer motives cautiously.

This document grounds Kith's discernment framework (dimensions, evidence weighting, circles, domain trust, Pause & Reflect, dating mode, self-mirror) in peer-reviewed research. It is written for the people building and tuning the product. It is **not** user-facing copy.

---

## 1. Purpose & how to read

**Purpose.** Every rule Kith applies to a person in the user's life should trace to (a) a research finding, (b) an explicit heuristic that is labelled as such, or (c) a deliberate ethical choice. This document supplies (a), proposes (b), and states (c) in §5.

**Structure of each concept section (§2):**

- **Key findings** — 2–5 bullets, stated only as strongly as the cited source supports.
- **Evidence strength** — see legend below.
- **Citations** — reference keys `[R##]` resolve to the full list in §8 (every entry has a DOI or publisher/catalogue link).
- **Design implications** — concrete statements mapped to Kith dimensions/features. Where a statement is a product heuristic rather than a finding, it says so.

**Evidence strength legend**

| Label | Meaning |
|---|---|
| **Strong** | Meta-analysis, large multi-sample/multi-country work, or a finding replicated across decades and labs. |
| **Moderate** | Multiple well-designed studies or an influential theory with consistent support, but limited samples (often students, couples, WEIRD populations) or mostly correlational data. |
| **Emerging** | One or a few studies, small samples, a single context, or indirect relevance to friendship (e.g., extrapolated from marriage, organizations, or lab games). |
| **Contested** | Active scholarly disagreement about the size, universality, or interpretation of the effect. |

**Verification method.** All 73 DOIs in §8 were resolved against Crossref metadata (authors, year, venue, volume/pages) on 2026-09-26. Books and book chapters without DOIs were verified via publisher or library-catalogue records. Key numerical findings were checked against abstracts or full texts (PubMed/PMC, author-hosted PDFs). Items that could not be verified are marked **[UNVERIFIED]** and are not used to justify any rule. (One widely repeated claim — a fixed "5:1 positive-to-negative ratio" attributed to Gottman — was deliberately **not** used because its primary quantitative source could not be verified here; see §4.)

**Scope caveat.** Much relationship science studies romantic couples, workplaces, or laboratory games rather than adult friendships. Where a finding is extrapolated to friendship, the section says so and the strength is downgraded.

---

## 2. Concepts

### 2.1 Friendship formation — time and shared activity

**Key findings**
- Hall's studies of adults who had recently relocated and of first-year students estimated that moving from acquaintance to casual friend took roughly **40–60 hours** together, to friend roughly **80–100 hours**, and to close/best friend **200+ hours** [R01].
- The *kind* of time mattered: leisure, joking, catching up and meaningful conversation predicted closeness better than obligatory co-presence (e.g., working in the same place) [R01].
- Friendships that are not actively maintained tend to weaken during life transitions; after the first year of college only ~55% of high-school best friends were still called "best friend", and frequent communication — not physical proximity — distinguished the ones that stayed close [R02].

**Evidence strength:** Moderate for the "friendship requires substantial invested time" principle; **emerging** for the specific hour figures (correlational, retrospective estimates, US samples).

**Citations:** [R01], [R02]

**Design implications**
- New people should enter a **"forming"** state. The circle-suggestion engine should not propose Circle 1 (inner) or Circle 2 (close) for a relationship still in forming state. *Heuristic:* forming = known < 3 months **or** < 10 logged interactions.
- If the user optionally logs duration, show accumulated shared time as context ("~35 logged hours together") — never as a target or a score. The hour thresholds are rough population estimates; the UI must not say "you need 200 hours to be close friends".
- Log interaction *type* (leisure/conversation vs. obligatory/logistics), because the research suggests the type of time matters, not only the amount.

---

### 2.2 Reciprocity — the norm, and communal vs. exchange relationships

**Key findings**
- Gouldner described a near-universal **norm of reciprocity**: people should help those who helped them. The norm tolerates *rough* rather than exact equivalence, and repayment can take a different form from the original benefit [R03].
- Clark & Mills distinguished **exchange** relationships (benefits given in expectation of comparable return; debts tracked) from **communal** relationships (benefits given in response to the other's *needs*). In a communal context, prompt repayment of a favor actually *reduced* attraction, while it increased attraction in an exchange context [R04].
- People who want a communal relationship do not keep track of individual contributions to joint work [R05], and they monitor a partner's *needs* even when they cannot help and no repayment is possible [R06].
- In friendships, maintenance effort is generally perceived as roughly equitable over time, and partners broadly agree about each other's maintenance [R07]. Friendship expectations include "symmetrical reciprocity" — loyalty, trust, genuineness — which is about mutual good faith, not equal message counts [R08].

**Evidence strength:** Strong (a classic theory with decades of experimental support).

**Citations:** [R03], [R04], [R05], [R06], [R07], [R08]

**Design implications**
- **Reciprocity must not demand equal frequency.** Close friends operate on communal norms; a strict tit-for-tat ledger misrepresents healthy friendships and, as a product nudge, may encourage exchange-style scorekeeping that undermines them [R04], [R05].
- Measure reciprocity across **multiple currencies** — initiation, practical help, emotional support, remembering, showing up in need — and across a long window (trailing 12 months). One friend may initiate most plans while the other is the one who shows up in a crisis; that is balanced in communal terms.
- Add **"responsiveness to needs"** as a reciprocity input: did they respond when the user had a real need? [R06] This is more diagnostic in communal relationships than initiation share.
- **Threshold proposal (refines the "≥75% over ≥6 contacts" draft):** if initiation were truly 50/50, a 5-of-6 (≥75%) split would still happen by chance ~11% of the time (~23% if the natural split is 60/40). Proposed:
  - **Observation (low confidence):** ≥75% initiated by one side, 8–11 initiations in the window.
  - **Pattern "sustained one-sidedness":** ≥80% initiated by one side, **≥12 initiations spanning ≥90 days** (chance probability ~2% under 50/50; ~8% under 60/40).
  - Exclude windows the user has marked as "capacity-limited" for either person (see Availability, §2.16).
  - Even at pattern level, present this as an *observed pattern* under Reciprocity. It escalates to "concern" only if other currencies are also one-sided **and** the user reports feeling depleted/unappreciated (felt inequity is the meaningful signal, not the ratio alone).
- Apply the same computation to the user (self-mirror): "You initiated 20% of contact with Sam this year."

---

### 2.3 Interdependence theory — where motives become visible

**Key findings**
- Interdependence theory analyzes relationships by the structure of outcomes each partner controls for the other [R09]. People can "transform" a situation by acting on broader relational goals rather than immediate self-interest [R10].
- Situations where partners' interests **conflict** are the most *diagnostic* of motives. Benevolent behavior when it costs the actor something is more informative than benevolent behavior that also serves the actor [R10].
- Trust develops most in such "strain tests", where a partner acts in the relationship's interest against their own [R11].

**Evidence strength:** Moderate–strong (a foundational theory with a large empirical literature, mostly on romantic couples).

**Citations:** [R09], [R10], [R11]

**Design implications**
- Add an optional **"cost to them"** flag on events (e.g., "helped me move on their only day off", "kept my secret even though sharing it would have helped them"). Positive events marked costly get extra evidential weight in Trust and Care. *Heuristic:* weight ×1.5.
- Symmetrically, a lapse when the other person was under heavy competing demands (situational cost) is *less* diagnostic of low care. The "Possible interpretations" panel should surface this.
- Rare diagnostic events should decay more slowly than routine evidence (see §6).

---

### 2.4 Trust development — components and domain specificity

**Key findings**
- In close relationships, trust has three components: **predictability** (consistent behavior), **dependability** (can be relied on when it matters), and **faith** (confidence about the future beyond current evidence). Faith was the component most strongly tied to love and happiness [R12].
- Across organizational settings, perceived trustworthiness comprises **ability** (skills in a *specific domain*), **benevolence** (wants to do good for the trustor), and **integrity** (adheres to principles the trustor finds acceptable). Ability is explicitly domain-specific: someone can be trusted with the car and not with investments [R13].
- Trust and distrust are separable and can coexist in the same relationship across different facets ("I trust her with my kids, not with my secrets") [R14].
- Trust tends to develop in stages: calculus/deterrence-based → knowledge-based (predictability through history) → identification-based (shared values and identity) [R15].

**Evidence strength:** Strong for the multidimensional structure; moderate for its transfer from organizational to friendship contexts.

**Citations:** [R12], [R13], [R14], [R15], [R11]

**Design implications**
- **Domain trust is well-supported, but it should be two-layered (refinement):**
  - **Per-domain competence/track record** (Mayer's *ability*): emotional, career, financial, business, confidential, dating, spiritual, practical, crisis, introductions. Stays domain-local.
  - **Cross-domain character** (Mayer's *benevolence + integrity*): good faith, honesty, words–actions alignment. Evidence of an integrity breach in *any* domain should visibly inform *all* domains (as a flag, not an automatic downgrade), because integrity is not domain-specific.
- Let trust be "mixed" per domain; never collapse to one number [R14].
- Map Rempel's components onto dimensions: predictability → Consistency, dependability → Reliability, faith → the user's own forward-looking judgment (ask, don't compute).
- A relationship with little history should show **"insufficient evidence"** for most domains; knowledge-based trust requires history [R15].

---

### 2.5 Trust violation and repair

**Key findings**
- Repair depends on violation type. After a **competence** violation, an apology repaired trust better; after an **integrity** violation, denial worked better (because an apology confirms an integrity flaw) — and if later evidence showed guilt, apology was better [R16].
- In repeated trust games, trust damaged by untrustworthy *actions* recovered with a consistent series of trustworthy actions; when the violation also involved **deception**, trust never fully recovered, despite promises, apologies and subsequent good behavior [R17].
- Repair can be approached through attributions (explaining what happened), social equilibrium (apology, penance) and structural safeguards [R18].

**Evidence strength:** Moderate (experimental, mostly organizational/lab samples; direction is consistent).

**Citations:** [R16], [R17], [R18]

**Design implications**
- **Trust restoration must be evidence-based, not time-based (refinement to half-life):** after a significant event, a domain should move to "recovering" only after subsequent trustworthy behavior *in that domain*. *Heuristic:* ≥3 kept commitments/confidences over ≥60 days → "recovering"; ≥6 over ≥180 days with no new breach → eligible for "restored" (user confirms).
- Breaches involving **deception** should remain visible as historical "significant events" and should not silently decay by recency weighting [R17]. The user can archive them explicitly.
- Record whether the violation was about competence ("forgot", "gave bad advice") or integrity ("lied", "shared my secret on purpose"). Competence lapses stay in the domain; integrity lapses feed cross-domain character (§2.4).
- Do not score apologies as automatic repair. Record them as events; subsequent behavior is the evidence.

---

### 2.6 Forgiveness vs. reconciliation and trust

**Key findings**
- Forgiveness is conceptually distinct from reconciliation, condoning, or forgetting; a person can forgive without restoring the relationship or the trust [R19].
- Forgiveness is a change in motivation — less avoidance and revenge, more goodwill — facilitated by empathy for the offender (partly via apology) [R20].
- Over time, avoidance and revenge motivations decline on average, but **benevolence does not reliably rise**; letting go of negativity is not the same as renewed goodwill [R21].

**Evidence strength:** Strong for the conceptual distinction; moderate for the temporal dynamics.

**Citations:** [R19], [R20], [R21]

**Design implications**
- Keeping forgiveness separate from trust restoration is **directly supported**. Model them as two fields:
  - `forgiven` — user-declared, internal, may be set at any time.
  - trust level — evidence-driven (§2.5).
- UI copy: "Forgiving someone and trusting them again are different. You can do one without the other."
- Do not infer forgiveness from time elapsed or from the user resuming contact.

---

### 2.7 Social support

**Key findings**
- *Perceived availability* of support buffers the effects of stress; being socially integrated has a separate, direct benefit [R22].
- Support that the recipient does **not** notice ("invisible support") was associated with better adjustment, while visible support was sometimes associated with increased distress, possibly due to feelings of indebtedness or inadequacy [R23].
- What counts as support is culturally shaped: in a West African (Ghanaian) sample, friendship emphasized practical assistance and caution about having many friends; in the North American sample, emotional support and companionship [R24].

**Evidence strength:** Strong (buffering); moderate (invisible support); moderate (cultural variation).

**Citations:** [R22], [R23], [R24]

**Design implications**
- **Care** must count practical/instrumental help (rides, meals, childcare, showing up) as fully as emotional talk.
- Support is often subtle and unnoticed; absence of logged support ≠ absence of support. Low "care" evidence should display as "little logged evidence", not "low care".
- The most important support signal is **perceived availability in crisis** — this maps to the `crisis` trust domain and deserves prominence.

---

### 2.8 Perceived partner responsiveness and the intimacy process

**Key findings**
- Intimacy develops when one person discloses, the other responds, and the discloser **perceives** the response as understanding, validating and caring [R25], [R26].
- In diary studies, both self-disclosure and partner disclosure predicted feelings of intimacy, and this was partly mediated by perceived partner responsiveness [R27].
- Perceived responsiveness is an organizing construct across closeness, trust and well-being research; it is by definition a *perception* by the recipient [R26].

**Evidence strength:** Strong.

**Citations:** [R25], [R26], [R27]

**Design implications**
- **Emotional safety** and **Mutuality** should centre on the user's perception of responsiveness: "When you shared something that mattered, did you feel understood?" The user's felt experience is legitimate primary evidence — but it is evidence *about the user's experience*, not a verified fact about the other person's intentions. Label it as such under "Known facts: you felt dismissed."
- Log disclosure events with the response the user perceived (understood / neutral / dismissed / used against me). This is richer than "conversation balance".
- Conversation balance (mutuality) is secondary; responsiveness is primary.

---

### 2.9 Capitalization — celebrating success

**Key findings**
- Sharing good news produces benefits beyond the event itself. **Active-constructive** responses (enthusiastic, engaged, asking questions) were associated with higher relationship quality; passive, deflecting or dismissive responses were not [R28].
- In dating couples, responses to *positive* event disclosures predicted relationship well-being and breakup two months later more strongly than responses to negative events [R29].
- "Share news of one's successes with the friend" was among the core friendship rules endorsed across cultures [R30].

**Evidence strength:** Strong (replicated; mostly couples, extended to friends).

**Citations:** [R28], [R29], [R30]

**Design implications**
- "Celebrating success" is a first-class **Care** input, not an optional extra. Offer a quick response-type tag: enthusiastic / muted / changed the subject / undermined.
- A repeated pattern of undermining or ignoring good news (≥3 instances) is a meaningful Care/Emotional-safety pattern even when crisis support is present.

---

### 2.10 Relationship and friendship maintenance

**Key findings**
- In marriage, five maintenance strategies — positivity, openness, assurances, social networks, sharing tasks — were related to relational quality, and equitable relationships showed more maintenance [R31].
- In friendship, four maintenance behaviors — **positivity, supportiveness, openness, interaction** — predicted satisfaction; best friends reported more maintenance than close or casual friends [R07].
- Continued communication, not proximity, distinguished friendships that stayed close across the college transition [R02].

**Evidence strength:** Strong for maintenance → satisfaction associations (correlational).

**Citations:** [R31], [R07], [R02]

**Design implications**
- Offer the four friendship maintenance behaviors as event tags. They map to: positivity → Care/Emotional safety; supportiveness → Care; openness → Mutuality/Trust; interaction → Consistency.
- Dormancy prompts (§6) are maintenance nudges **for the user**, not verdicts on the other person.

---

### 2.11 Friendship expectations and rules

**Key findings**
- A meta-analysis (36 samples, 8,825 participants) grouped friendship expectations into symmetrical reciprocity (loyalty, trust, genuineness), communion (intimacy, disclosure, empathy), solidarity (shared activities) and agency (status, resources). Sex differences were small (d ≈ 0.17 for reciprocity, 0.39 for communion, −0.34 for agency, ~0 for solidarity) [R08].
- Across British, Italian, Hong Kong and Japanese samples, core friendship rules included: stand up for the friend in their absence, share news of success, show emotional support, trust and confide, volunteer help in need, try to make them happy. Breaking **third-party rules** (e.g., jealousy of or criticism of the friend's other relationships, not keeping confidences) was associated with friendships ending [R30].

**Evidence strength:** Strong (meta-analysis) / moderate (cross-cultural rules, 1984 data).

**Citations:** [R08], [R30]

**Design implications**
- Do **not** apply gendered defaults; sex differences in expectations are small and overlapping [R08].
- Let the user set personal standards (which rules matter most to them); show evidence against *their* standards. This fits "user always has final control".
- Add **third-party loyalty** as an explicit Respect/Trust input: stood up for me in my absence; tolerant of my other friends; criticized me publicly; jealous of my other relationships [R30].

---

### 2.12 Attachment

**Key findings**
- Adult romantic relationships show attachment patterns analogous to infant–caregiver attachment [R32]. Contemporary research describes two dimensions: **anxiety** (fear of rejection, hypervigilance to cues of unavailability) and **avoidance** (discomfort with closeness and dependence) [R33].
- People regulate the risk of closeness: those less confident of a partner's regard protect themselves by perceiving and responding to rejection cues more readily [R34].
- Attachment orientation changes how the same responsive behavior is received [R35].

**Evidence strength:** Strong (large literature), with the caveat that friendship-specific attachment work is thinner.

**Citations:** [R32], [R33], [R34], [R35]

**Design implications**
- Never label the user or anyone else with an attachment "style". That is diagnosis (§5).
- Attachment research is the main justification for the **self-mirror**: when a user's reflections repeatedly read ambiguous events as rejection (e.g., a slow reply, a cancelled plan with a reason given), offer a neutral prompt: "Other explanations for this could be…" — not "you seem anxiously attached".
- Treat the user's emotional reactions as valid data about the user, and separate them from the observed behavior in the four-panel view (Known facts / Observed patterns / Possible interpretations / Unknowns).

---

### 2.13 Boundaries and privacy

**Key findings**
- Communication Privacy Management theory: people see themselves as owners of their private information; sharing it makes the recipient a co-owner bound by privacy rules. Violating those rules causes **boundary turbulence** [R36].
- Frequent mobile contact raised expectations of availability. Those expectations fed healthy dependence (linked to higher satisfaction) but also over-dependence and **entrapment** (guilt/pressure to respond), both linked to lower satisfaction [R37].
- Compliance tactics — reciprocation pressure ("I did this for you"), commitment/consistency traps, liking — can be used to obtain agreement people would not otherwise give [R38].

**Evidence strength:** Moderate.

**Citations:** [R36], [R37], [R38]

**Design implications**
- **Respect** inputs: respected a stated "no"; pressured after a refusal; used guilt or past favors as leverage; demanded constant availability; respected privacy rules.
- Map confidences to the `confidential` trust domain via CPM: "kept a confidence" / "shared without permission" are co-ownership events [R36].
- Kith itself must not create entrapment. No "you haven't replied to X" nudges based on messaging (§5).

---

### 2.14 Conflict and repair

**Key findings**
- In marital interaction, the balance of positive to negative behavior during conflict predicted later dissolution, along with health and physiological correlates [R39].
- In newlyweds, negative start-up, rejecting a partner's influence, and failure to de-escalate predicted divorce; positive affect during conflict predicted stability and happiness. Active-listening-style exchanges did not predict outcomes [R40].
- Playful bids and enthusiastic responses in everyday moments were associated with more humor and affection during later conflict [R41].

**Evidence strength:** Moderate for friendships (strong within marital research; extrapolated here).

**Citations:** [R39], [R40], [R41]

**Design implications**
- Conflict itself is not negative evidence. **Respect → disagreement handling** should log *how* conflict went: de-escalated / attempted repair / contempt / refused to hear my view.
- Log **repair attempts** after a rupture (apology, humor, checking in) as positive evidence in Emotional safety and Respect.
- Everyday small responsiveness ("bids") belongs under Care/Mutuality; Kith can allow tiny, fast logs ("they remembered", "they checked in").
- Do not import a numeric positive:negative ratio as a threshold (see §4).

---

### 2.15 Loneliness and the health value of relationships

**Key findings**
- Across 148 studies (308,849 participants), stronger social relationships were associated with a ~50% greater likelihood of survival — comparable to well-established risk factors such as smoking [R42].
- Loneliness is associated with heightened vigilance for social threat and more negative social expectations and interpretations — which can become self-reinforcing [R43].

**Evidence strength:** Strong.

**Citations:** [R42], [R43]

**Design implications**
- **Kith must not optimize for cutting people off.** Suggestions that move someone to Circle 5 ("limited/caution") should be rare, require strong evidence, and be user-initiated or user-confirmed. The default framing is "adjust expectations" or "protect this domain", not "end this relationship".
- If the user's recent entries are uniformly negative across many people, a lonely-mind bias is a plausible contributor [R43]. The self-mirror can gently note "Many of your recent reflections are negative across several relationships" — with no diagnosis, and with an optional pointer to support resources.
- Surface positive evidence in parallel with negative (§2.28).

---

### 2.16 Network structure — Dunbar layers, capacity, and their critics

**Key findings**
- Dunbar predicted a human group size of ~150 from primate neocortex ratios [R44]. Later work describes nested layers of roughly **5, 15, 50, 150** (each ~3× the previous), with emotional closeness and contact frequency falling outward — roughly weekly contact for the ~5 layer, monthly for ~15, and yearly for ~150 [R45], [R46].
- Individuals show persistent personal "social signatures" — a stable distribution of effort across their ties — even as specific people turn over [R47]. Time is a finite resource, and people cap how many ties they actively maintain [R48].
- **Critique:** re-analyzing primate data with modern methods produced human group-size estimates whose 95% intervals spanned roughly 2 to 520; the authors conclude that no precise cognitive limit can be derived [R49].

**Evidence strength:** Moderate for layered structure and limited capacity; **contested** for the specific numbers (especially 150).

**Citations:** [R44], [R45], [R46], [R47], [R48], [R49]

**Design implications**
- Circles 1–4 may use Dunbar-like **soft guidance** (~5 / ~15 / ~50 / ~150 cumulative) as information only. **Never enforce caps.** Copy: "Many people have around 5 people they'd call in a crisis. Yours may differ."
- Compare each relationship to **the user's own baseline** and that relationship's own history, not to population norms [R47].
- **Availability as separate from care is well supported** [R48]: capacity is finite, so someone with a new baby, a new job or a crisis has less to give per tie without caring less. Let the user mark a person or themselves as "capacity-limited" for a period; during that period, reciprocity and consistency evidence is down-weighted (*heuristic:* ×0.5) and never produces a pattern.
- Circle 5 ("limited/caution") is **not** a Dunbar layer; it is a Kith-specific protective category and should be documented as such.

---

### 2.17 Emotional-closeness decay without contact

**Key findings**
- In an 18-month longitudinal study, emotional closeness to friends declined when contact decreased, while kin relationships were more robust. Only ~49% of initially inner-layer friends stayed in the inner layer, versus ~70% of kin; making new friends was associated with declines in closeness to existing ones [R50], [R51].
- In a study of 251 women, time since last contact tracked emotional closeness, more strongly for kin than for friends [R52].
- In professional networks, most observed ties decayed within a year (~75% first-year decay); decay was slower for stronger ties and for ties embedded in stable mutual connections [R53].

**Evidence strength:** Moderate (small samples in the longitudinal friendship work; transition periods; banker data for decay functions).

**Citations:** [R50], [R51], [R52], [R53]

**Design implications**
- Dormancy thresholds per circle are justified (§6), but they should be framed as **"maintenance check-ins"** for the user, since both people share responsibility for contact.
- Add a `kin` flag: kin relationships tolerate longer gaps (*heuristic:* ×2 dormancy threshold) [R50], [R52].
- Use **dormancy** only to prompt; never auto-demote. A **re-review prompt every ~6 months** helps because circles are fluid during life transitions [R50].
- Mutual friends matter: ties embedded in a shared network decay more slowly [R53]. An optional "shared circle" tag can inform (not decide) dormancy prompts.

---

### 2.18 Weak ties

**Key findings**
- Weak ties (acquaintances) bridge otherwise disconnected clusters and are disproportionately the source of new information and opportunities, such as job leads [R54].
- Tie strength combines time, emotional intensity, intimacy and reciprocal services [R54] — the same ingredients Kith's dimensions capture.

**Evidence strength:** Strong (foundational, widely replicated).

**Citations:** [R54]

**Design implications**
- Circles are **not rankings of worth**. Circle 4 (acquaintances) is valuable; copy should never imply "lower = worse".
- The `introductions` trust domain is well-motivated: a weak tie can be highly trustworthy and useful for introductions without being close.
- No dormancy nudges for Circle 4 more often than yearly.

---

### 2.19 Similarity and homophily

**Key findings**
- Networks are strongly homophilous on demographics, values and social position, partly because of structural opportunity (where people live, work and worship) [R55].
- A meta-analysis (313 studies) found **actual** similarity predicted attraction before interaction but was non-significant in existing relationships (r ≈ .08), while **perceived** similarity remained associated (r ≈ .32) [R56].

**Evidence strength:** Strong.

**Citations:** [R55], [R56]

**Design implications**
- Kith should **not compute compatibility or similarity scores**. In existing relationships, actual similarity does not predict attraction [R56].
- The **Growth** dimension's "influence toward user's values" should not be operationalized as "similarity to the user". Reframe as in §2.22.

---

### 2.20 Self-disclosure and social penetration

**Key findings**
- Relationships deepen gradually in both breadth and depth of disclosure; withdrawal of disclosure accompanies decline [R57].
- Meta-analysis: people who disclose are liked more; people disclose more to those they like; people come to like those they have disclosed to. The effect is stronger when the disclosure is seen as personally directed rather than indiscriminate [R58].
- Disclosure builds intimacy mainly through the partner's responsiveness [R27].

**Evidence strength:** Strong.

**Citations:** [R57], [R58], [R27]

**Design implications**
- Log disclosure *depth* (surface / personal / vulnerable) for both directions. **Mutuality** includes reciprocal depth, not just talk time.
- A sustained drop in the other person's disclosure depth is a neutral "change detected" observation, not a verdict. Possible interpretations include stress, capacity, or drift.
- **Emotional safety** is most diagnosable at *vulnerable* disclosures: how the other person responded when the user was vulnerable.

---

### 2.21 Commitment and investment

**Key findings**
- The investment model: commitment grows with satisfaction and investments and shrinks with the quality of alternatives [R59], [R60].
- Meta-analysis (52 studies, 11,582 participants): satisfaction r = .68, alternatives r = −.48, investments r = .46 with commitment; together they explain ~61% of the variance. Commitment predicts staying (r = .47) [R61].

**Evidence strength:** Strong (mostly romantic relationships).

**Citations:** [R59], [R60], [R61]

**Design implications**
- **Years known and sunk investment are not evidence of quality.** High investment can sustain commitment to an unsatisfying relationship. Kith should never treat "known for 15 years" as a positive trust or care signal.
- The self-mirror can surface this neutrally: "You've invested a lot here; how satisfied are you with how it feels now?"
- Separate **commitment** (user's intent to stay) from dimension evidence in the UI.

---

### 2.22 Growth — being brought closer to one's ideal self

**Key findings**
- The "Michelangelo phenomenon": close partners who perceive and behaviorally affirm a person's *own* ideal self help that person move toward it, and this is associated with better relationship functioning [R62].

**Evidence strength:** Moderate (romantic couples; extrapolated).

**Citations:** [R62]

**Design implications**
- **Reframe Growth (refinement):** from "influence toward the user's values" to "supports who *I* want to become" — affirms my goals, gives honest constructive challenge in service of *my* aims, and doesn't pull me toward behavior I've said I want to leave behind.
- The user defines their own goals and values. Kith must not supply a moral standard.

---

### 2.23 Prosocial behavior

**Key findings**
- Helping is shaped at multiple levels — dispositions, mood, the specific situation and its costs, the relationship, and group context. Situational factors strongly affect whether any given person helps at any given time [R63].

**Evidence strength:** Strong.

**Citations:** [R63]

**Design implications**
- A single failure to help is weakly diagnostic of character. The "Possible interpretations" panel should list situational explanations (competing demands, not knowing help was needed, cost).
- Where the user didn't explicitly ask, log it as "didn't offer" rather than "refused"; they are different evidence.

---

### 2.24 Requests, influence and advice

**Key findings**
- The reciprocity norm is a powerful compliance lever: a prior favor or concession increases agreement to later requests. Commitment/consistency and liking are also exploitable [R38], [R03].
- People take advice in proportion to perceived advisor expertise and track record, and tend to under-weight advice relative to their own view (egocentric discounting) [R64].
- Disclosing a conflict of interest can make advisors give *more* biased advice, while recipients fail to discount it enough [R65].

**Evidence strength:** Strong (compliance); moderate (advice taking); moderate (COI disclosure, lab).

**Citations:** [R38], [R03], [R64], [R65]

**Design implications**
- **Pause & Reflect is well-motivated**, but the trigger must be *inconsistency with the relationship's baseline*, not requests per se. In communal relationships, asking for help when in need is normal and healthy [R04], [R06].
  - *Heuristic triggers:* first request in a new domain (e.g., the first financial request); a request substantially larger than any prior reciprocated exchange (≥2× the largest); urgency or pressure language; a request preceded by an unusual favor or flattery; a request after a gap longer than the circle's dormancy threshold.
  - A **reappearance-with-request pattern** requires ≥3 cycles (gap ≥ dormancy threshold → contact dominated by a request → contact lapses within ~30 days after resolution). 1–2 cycles = observation only.
- **Advice evaluation:** show the advisor's *domain* track record (from the domain-trust layer) and ask "Does this person benefit from what you decide?" **regardless of whether they disclosed an interest** [R65].

---

### 2.25 Relational mobility and culture

**Key findings**
- Across 39 societies (16,939 people), higher relational mobility — freedom to choose and leave relationships — predicted more self-disclosure, intimacy, generalized trust, and friend similarity [R66].
- Friendship norms differ culturally (e.g., caution about friends and an emphasis on practical help in a Ghanaian sample vs. emotional support in a US sample) [R24].
- Most psychology samples are WEIRD (Western, Educated, Industrialized, Rich, Democratic) and often unrepresentative [R67].

**Evidence strength:** Strong (relational mobility, multi-country); strong (WEIRD critique).

**Citations:** [R66], [R24], [R67]

**Design implications**
- Suggestions to "move someone outward" assume a high-mobility context. For users in low-mobility contexts (family businesses, small communities, workplace hierarchies), the suggestion should be "protect specific domains" rather than "distance".
- Disclosure depth norms vary; low disclosure is not low closeness in every culture. Mutuality should be read against the relationship's own baseline.
- Settings: allow the user to state what friendship looks like for them (practical vs. emotional emphasis) and weight Care inputs accordingly.

---

### 2.26 Romantic interest and courtship signaling (dating mode)

**Key findings**
- In speed dating, **selective** desire (liking this person more than others) was reciprocated (r ≈ .14), while **unselective** desire (liking everyone) was negatively reciprocated (r ≈ −.41) [R68].
- Reciprocity of liking — being liked increases liking — is robust, with several mediating mechanisms [R69].
- Responsiveness from a new acquaintance *increased* sexual desire for men and less-avoidant people, but *decreased* it for women (in experimental studies) and for highly avoidant people [R35].
- Machine learning on >100 self-reported traits could not predict relationship-specific romantic desire before people met [R70]. Profile-based matching algorithms lack evidence of predicting compatibility [R71].

**Evidence strength:** Moderate (speed dating and lab studies, mostly US students); strong for "compatibility is not predictable from profiles".

**Citations:** [R68], [R69], [R35], [R70], [R71]

**Design implications**
- Dating mode should summarize **observed mutual-investment behaviors**: who initiates; who proposes concrete plans; declines accompanied by an alternative ("can't Friday — Sunday?") vs. bare declines; the trend in engagement over the last 4–6 interactions. The "alternative offered" signal is a **product heuristic** consistent with reciprocity/selectivity research, not a directly tested predictor.
- **Signals should be person-relative**: effort directed at *the user specifically* (remembered details, tailored plans) is more informative than general friendliness [R68].
- Responsiveness/warmth is **not** a universal interest signal [R35]. Kith must not say "they're warm, so they're interested".
- No compatibility predictions and no "likelihood they like you" percentage [R70], [R71].
- Minimum 4 logged interactions before any dating-mode summary; before that, show "too early to see a pattern".
- Response time is excluded (see §2.27).

---

### 2.27 Digital communication and response latency

**Key findings**
- People do read meaning into email response latency, but the meaning depends heavily on prior impressions and context: delays hurt evaluations of a highly-regarded sender far more than of a poorly regarded one (vignette study, n = 55) [R72].
- Expectations of constant mobile availability contribute to over-dependence and entrapment, both associated with lower friendship satisfaction [R37].

**Evidence strength:** Emerging–moderate (small or cross-sectional samples).

**Citations:** [R72], [R37]

**Design implications**
- **Not tracking response time is supported.** Latency is interpreted through prior expectations (a confirmation-bias amplifier), and availability expectations create entrapment.
- Kith should also avoid indirect latency tracking (e.g., "last replied" timestamps in the UI).
- If a user logs "they took 3 days to reply", store it as a user note and show the possible interpretations (capacity, notification habits, different texting norms). It never feeds any dimension.

---

### 2.28 Cognitive biases in judging others

**Key findings**
- **Fundamental attribution error / correspondence bias:** observers over-attribute behavior to disposition and under-weight situational constraints, especially when unaware of the situation or cognitively busy [R73], [R74].
- The classic actor–observer asymmetry was near zero overall in a meta-analysis (173 studies), but appeared for **negative** events and reversed for positive ones — a self-serving pattern [R75].
- People see bias in others more readily than in themselves (**bias blind spot**) [R76].
- **Negativity bias:** bad events, feedback and relationship behaviors have stronger and longer-lasting effects than equivalent good ones [R77].
- **Order/recency effects:** when evaluating mixed evidence step by step, beliefs are disproportionately influenced by the most recent items [R78].

**Evidence strength:** Strong (correspondence bias, negativity bias); strong (bias blind spot); moderate (order effects in this applied setting).

**Citations:** [R73], [R74], [R75], [R76], [R77], [R78]

**Design implications**
- These findings are the core justification for **"infer motives cautiously"** and for the four-panel view. "Possible interpretations" must always include at least one situational explanation next to any dispositional one.
- **Timelines counter recency:** always show the full history alongside summaries. Summaries must be computed over the full weighted window, not the latest entry [R78].
- **Counter negativity bias:** show positive-evidence counts next to negative ones; single negative events never produce a "concern" (except significant events) [R77].
- **Self-mirror** is justified by the bias blind spot and the self-serving asymmetry [R75], [R76]: apply the same metrics to the user and present them without judgment.
- Journaling at emotional peaks captures a single negative event with high salience. Allow a "revisit after 48h" option on entries.

---

## 3. Feature/rule → research map

| Feature / rule | Supporting research | Strength | Caveat |
|---|---|---|---|
| Reciprocity tolerates imbalance; no strict tit-for-tat | Gouldner [R03]; Clark & Mills [R04]; Clark [R05]; Clark et al. [R06] | Strong | Communal/exchange is a continuum; some friendships are exchange-like |
| Multi-currency reciprocity incl. responsiveness to needs | [R06], [R07], [R22] | Moderate | Currencies are hard to equate; show them side by side, don't sum |
| Sustained one-sidedness = ≥80% over ≥12 initiations, ≥90 days | Binomial reasoning; [R04] | Heuristic | Natural initiator asymmetries exist; felt inequity required for "concern" |
| Availability separate from care | Miritello [R48]; Roberts & Dunbar [R50] | Moderate | Self-reported capacity may be used as an excuse; Kith can't tell |
| Response time not tracked | Kalman & Rafaeli [R72]; Hall & Baym [R37] | Emerging–moderate | Small samples; well aligned with the bias literature [R73], [R78] |
| Two-layer trust (domain ability + cross-domain integrity) | Mayer et al. [R13]; Lewicki et al. [R14]; Kim et al. [R16] | Strong/moderate | Organizational origin |
| Trust by domain | [R13], [R14] | Strong | Domains are product categories, not empirically derived |
| Evidence-based trust restoration, not time-based | Schweitzer et al. [R17]; Kim et al. [R16] | Moderate | Lab trust games |
| Deception-based breaches don't silently decay | [R17] | Moderate | User can archive explicitly |
| Forgiveness tracked separately from trust | Fincham [R19]; McCullough et al. [R20], [R21] | Strong | — |
| Single negative event ≠ concern (except significant events) | Baumeister et al. [R77]; Gilbert & Malone [R74]; Penner et al. [R63] | Strong | Severe events (violence, coercion) override |
| Repeated patterns weigh more than isolated events | [R74], [R63]; Rempel et al. predictability [R12] | Strong (principle) | Minimum counts are heuristic |
| Recency weighting (half-life) | Tie decay [R50], [R53]; change detection | Heuristic | Humans already over-weight recency [R78]; don't double-count; show the timeline |
| Change detection (last 6 months vs. prior) | Roberts & Dunbar [R50]; McCullough et al. [R21] | Moderate | Needs minimum evidence in both windows |
| Care includes celebrating success | Gable et al. [R28], [R29]; Argyle & Henderson [R30] | Strong | Couples-heavy evidence |
| Care includes practical help; invisible support | Adams & Plaut [R24]; Bolger et al. [R23] | Moderate | Unlogged support is invisible to Kith |
| Emotional safety = perceived responsiveness to vulnerability | Reis & Shaver [R25]; Reis et al. [R26]; Laurenceau et al. [R27] | Strong | Perception ≠ intent |
| Respect: boundaries, pressure, third-party loyalty | Petronio [R36]; Cialdini & Goldstein [R38]; Argyle & Henderson [R30] | Moderate | — |
| Respect: disagreement handling & repair | Gottman & Levenson [R39]; Gottman et al. [R40]; Driver & Gottman [R41] | Moderate | Marital data extrapolated |
| Growth = affirmation of the user's own ideal self | Drigotas et al. [R62] | Moderate | Couples data |
| Diagnostic "cost to them" weighting | Rusbult & Van Lange [R10]; Simpson [R11] | Moderate | Weight value is heuristic |
| Circles modeled on Dunbar layers, soft sizes | Dunbar [R44], [R45]; Zhou et al. [R46] | Contested (numbers) | Lindenfors et al. [R49]; social signatures vary [R47] |
| Dormancy thresholds by circle | Dunbar [R45]; Roberts & Dunbar [R50], [R52] | Moderate / heuristic | Logged contact ≠ actual contact |
| Kin tolerate longer gaps | [R50], [R52] | Moderate | Family can also be the source of harm |
| Circle 4 not "lesser"; introductions domain | Granovetter [R54] | Strong | — |
| No compatibility/similarity scoring | Montoya et al. [R56]; Joel et al. [R70]; Finkel et al. [R71] | Strong | — |
| "Forming" state for new relationships | Hall [R01] | Emerging (hours) | Hour estimates are rough |
| Pause & Reflect on baseline-inconsistent requests | Cialdini & Goldstein [R38]; Gouldner [R03] | Strong (mechanism) | Needs-based requests are normal [R06] |
| Advice evaluation: domain track record + COI check regardless of disclosure | Bonaccio & Dalal [R64]; Cain et al. [R65] | Moderate | Lab advice paradigms |
| Dating mode: selective, person-directed mutual investment | Eastwick et al. [R68]; Montoya & Insko [R69] | Moderate | Speed-dating samples |
| Dating mode: responsiveness ≠ interest | Birnbaum & Reis [R35] | Emerging–moderate | Gender/attachment moderation |
| Self-mirror | Pronin et al. [R76]; Malle [R75] | Strong | Must be non-judgmental |
| Four-panel epistemic view (facts/patterns/interpretations/unknowns) | Ross [R73]; Gilbert & Malone [R74] | Strong | — |
| Don't push users to cut ties; conservative Circle 5 | Holt-Lunstad et al. [R42]; Hawkley & Cacioppo [R43] | Strong | Safety overrides for abuse |
| Cultural settings for friendship emphasis | Thomson et al. [R66]; Adams & Plaut [R24]; Henrich et al. [R67] | Strong | — |
| Sunk investment ≠ quality | Rusbult [R59]; Le & Agnew [R61] | Strong | Romantic data |

---

## 4. Where evidence is uncertain — what Kith must communicate as uncertain

1. **Cultural variation.** Norms for disclosure, reciprocity, obligation and leaving relationships vary with relational mobility and culture [R66], [R24]. The product should say "In many cultures…" or "Research mostly from North America and Europe suggests…", never "Healthy friends do X."
2. **WEIRD samples.** Nearly all cited friendship research uses Western, often student samples [R67]. Hall's hours [R01], Oswald's maintenance work [R07], and most attachment/responsiveness work have this limitation.
3. **Individual differences.** People have persistent personal "social signatures" [R47] and different attachment orientations [R33]; a normal contact rhythm for one person is a warning sign for another. Always compare against the relationship's own baseline.
4. **The Hall hour estimates** [R01] are correlational, retrospective and approximate (ranges, not thresholds). Display only as context, never as targets.
5. **Dunbar numbers.** Layer sizes (5/15/50/150) and the ~3× scaling [R45], [R46] are debated; Lindenfors et al. found 95% intervals spanning roughly 2–520 [R49]. Circle size guidance is informational, not normative.
6. **Texting-era evidence.** Much maintenance and support research predates smartphones and group chats. Digital-era evidence (e.g., [R37], [R72]) is small and cross-sectional. How contact via memes, reactions and group chats maps onto "maintenance" is largely unknown; Kith should let users decide what counts as contact.
7. **Extrapolation from couples and organizations.** Gottman's conflict research [R39]–[R41], capitalization [R28], [R29], the investment model [R61], Michelangelo [R62], and trust repair [R16], [R17] are mostly romantic-couple or organizational/lab studies. Treat their application to friendship as plausible, not established.
8. **Numeric ratios.** Popular claims such as a fixed 5:1 positive-to-negative ratio are **[UNVERIFIED]** as precise constants for friendships and must not be used as thresholds.
9. **Self-report and logging bias.** Kith sees only what the user logs, when they log it — usually after salient (often negative) events [R77]. All levels must be phrased as "based on what you've recorded".
10. **Causality.** Most findings are correlational (maintenance → satisfaction; contact → closeness). Kith should not say "doing X will make them closer to you."
11. **Dating signals.** Evidence comes largely from speed-dating and lab paradigms [R68], [R35]; generalization to app-based dating and longer courtship is uncertain, and romantic desire is largely unpredictable in advance [R70].
12. **All numeric parameters in §6** are product heuristics informed by research, **not empirical constants**.

---

## 5. Things the product must NOT do (research-grounded)

1. **Diagnose motives or personality.** No "they're manipulative/narcissistic/avoidant". Observers systematically over-attribute behavior to disposition [R73], [R74]. Kith reports behaviors and patterns; interpretations are always plural and labelled as possibilities.
2. **Label attachment styles or mental states** of the user or others [R33]. Attachment informs neutral prompts only.
3. **Treat response latency as interest or care.** Latency meaning is context-dependent and read through prior impressions [R72]; availability expectations cause entrapment [R37]. Not tracked, not displayed, not inferred.
4. **Demand equal frequency / tit-for-tat.** Communal relationships don't keep ledgers, and imposing one can undermine them [R04], [R05].
5. **Let a single negative event produce "concern"** (except defined significant events). Negativity bias already inflates single events [R77]; situations explain much single-instance behavior [R63].
6. **Let trust recover through time alone** or treat an apology as repair [R17], [R16]. Conversely, **don't make past red flags permanent** when there is sustained counter-evidence; change detection exists for this [R21].
7. **Equate forgiveness with trust** or infer forgiveness from resumed contact [R19].
8. **Score compatibility or similarity**, or predict romantic interest as a probability [R56], [R70], [R71].
9. **Treat warmth/responsiveness as romantic interest** [R35].
10. **Enforce Dunbar caps** or rank people by circle "worth" [R49], [R54].
11. **Auto-demote people** for dormancy, or auto-move anyone to Circle 5. The user decides; Kith suggests [R42], [R43].
12. **Treat longevity or sunk investment as evidence of a good relationship** [R61].
13. **Present unlogged behavior as absent behavior** (e.g., "no care shown"). Support is often invisible [R23]; say "little recorded evidence".
14. **Apply gendered or cultural defaults** to expectations [R08], [R24], [R66].
15. **Encourage scorekeeping behaviors in the user** — nudges like "you've done 5 favors, they've done 1" — that shift communal relationships toward exchange framing [R04].
16. **Replace the user's judgment of their own experience.** Perceived responsiveness is the user's to report [R26]; Kith separates it from claims about the other person but doesn't overrule it.
17. **Ignore safety.** Research on caution must never delay safety messaging: threats, coercion, violence or stalking are significant events that bypass evidence thresholds and surface support resources.

---

## 6. Recommended parameter defaults (all heuristics, not empirical constants)

| Parameter | Default | Rationale | Flag |
|---|---|---|---|
| **Recency half-life (routine evidence)** — initiation, plans kept/cancelled, conversation balance | **180 days** (weights: 90d → 0.71, 1y → 0.25, 2y → 0.06) | Friend closeness measurably shifts over 9–18 months [R50]; ties decay within ~1 year without maintenance [R53]. 180d lets the last ~6–12 months dominate while retaining history. Humans already over-weight recency [R78], so the full timeline must remain visible and summaries must not use a shorter window. | Heuristic |
| **Half-life for rare diagnostic events** — crisis support, costly help, significant positive events | **365 days** | These are rare, high-information "strain tests" [R10], [R11]; a 180d half-life would erase them before they could recur. | Heuristic |
| **Significant negative events (deception, betrayal of confidence, coercion)** | **No time decay** until repair evidence exists; then **365 days** | Trust after deception does not fully recover with time or promises [R17]. Decay tied to counter-evidence, not the calendar. | Heuristic |
| **Weight floor for display** | Never hide; weights < 0.05 shown as "historical" | Counters recency and hindsight distortions [R78]. | Heuristic |
| **Confidence levels (per dimension)** | Insufficient: < 3 relevant events · Low: 3–5 · Moderate: 6–11 · High: ≥ 12 **and** spanning ≥ 90 days **and** ≥ 2 contexts | Repeated observation across situations is what distinguishes disposition from situation [R74], [R63]. | Heuristic |
| **Minimum for a "pattern"** | ≥ 3 similar events on ≥ 2 separate occasions ≥ 14 days apart | Avoids a single bad week creating a pattern; aligns with "repeated > isolated". | Heuristic |
| **Minimum for "concern" level** | Pattern (above) **and** negatives ≥ 50% of weighted relevant events in that dimension, **or** a significant event | A single event never yields concern [R77]. | Heuristic |
| **Reciprocity one-sidedness** | Observation: ≥ 75% one-sided with 8–11 initiations. Pattern: ≥ 80% with ≥ 12 initiations over ≥ 90 days (trailing 12 months) | Chance probability under 50/50 falls from ~11% (5/6) to ~2% (10/12); robust to a natural 60/40 split (~8%). "Concern" additionally requires one-sidedness in other currencies and user-reported felt inequity [R04], [R06]. | Heuristic |
| **Capacity-limited windows** | Evidence weight ×0.5 for reciprocity/consistency; no new patterns | Availability ≠ care [R48]. | Heuristic |
| **"Cost to them" diagnostic weight** | ×1.5 for positive events flagged costly | Conflict-of-interest situations reveal motives [R10]. | Heuristic |
| **Change detection** | Last 6 months vs. prior 6–18 months; require ≥ 3 relevant events in **each** window; report change only if the level moves ≥ 1 step | Lets past red flags fade with counter-evidence [R21], [R50]; prevents noise from sparse windows. | Heuristic |
| **Trust restoration after breach** | "Recovering": ≥ 3 trustworthy acts in the affected domain over ≥ 60 days. "Eligible for restored": ≥ 6 over ≥ 180 days, no new breach, user confirms | Consistent trustworthy behavior repairs non-deceptive violations [R17]. | Heuristic |
| **Forming state** | Known < 3 months **or** < 10 logged interactions → no Circle 1–2 suggestions | Friendship needs substantial shared time [R01]. | Heuristic |
| **Dormancy check-in prompts (no auto-demotion)** | Circle 1: **30 days** · Circle 2: **90 days** · Circle 3: **180 days** · Circle 4: **365 days** · Circle 5: none. Kin ×2. | Roughly 3–4× Dunbar's typical contact rates (weekly/monthly/yearly) [R45], so prompts fire only on clear departures; friendships decay without contact, kin less so [R50], [R52]. | Heuristic |
| **Circle size guidance (cumulative, informational)** | C1 ~5 (typically 3–7) · C1–2 ~15 · C1–3 ~50 · C1–4 ~150. Soft note if C1 > 10: "Would all of these be people you'd call in a crisis?" | Dunbar layers [R45], [R46]; numbers contested [R49]; personal signatures vary [R47]. | Heuristic |
| **Circle re-review prompt** | Every 6 months, and after user-flagged life transitions | Circles shift during transitions [R50], [R02]. | Heuristic |
| **Reappearance-with-request pattern** | ≥ 3 cycles (gap ≥ circle dormancy threshold → request-dominated contact → lapse within ~30 days) | Reciprocity-as-leverage [R38]; needs-based requests alone are normal [R06]. | Heuristic |
| **Pause & Reflect triggers** | First request in a new domain; request ≥ 2× largest prior reciprocated exchange; urgency/pressure; request after a dormancy-length gap; request preceded by unusual favor/flattery | Compliance tactics [R38]; baseline-relative, not request-based. | Heuristic |
| **Dating-mode minimum** | ≥ 4 logged interactions before any summary; trend computed over the last 4–6 interactions | Early interactions are noisy; desire is hard to predict [R70]. | Heuristic |
| **Entry "revisit" option** | Offer to revisit an emotionally charged entry after 48 hours | Negativity bias and in-the-moment salience [R77], [R78]. | Heuristic |

---

## 7. Framework refinements and contradictions (for the builder)

These are the places where research **contradicts or refines** the current framework:

1. **Reciprocity threshold** — "≥75% over ≥6 contacts" is too noisy (~11% false-positive rate even with perfect 50/50 initiation). Use ≥80% over ≥12 initiations spanning ≥90 days for a pattern; 75% with 8–11 is a low-confidence observation. Make reciprocity multi-currency and add "responsiveness to needs". "Concern" requires felt inequity from the user. (§2.2)
2. **Domain trust needs two layers** — per-domain ability/track record plus cross-domain integrity/benevolence. Integrity breaches flag all domains; competence lapses stay local. (§2.4, §2.5)
3. **One uniform 180-day half-life is insufficient** — keep 180d for routine evidence, use 365d for rare diagnostic events, and do **not** time-decay deception-based breaches until repair evidence exists. (§2.5, §6)
4. **Trust restoration** is triggered by counter-evidence counts, not elapsed time. (§2.5)
5. **Consistency's "gap regularity"** must not penalize the other person for gaps both people share; dormancy is a user maintenance prompt. Compare to the relationship's own rhythm, not a population norm. Add a `kin` flag (×2 thresholds). (§2.16, §2.17)
6. **Care** must include practical help and responses to *good* news (capitalization), and treat unlogged support as unknown, not absent. (§2.7, §2.9)
7. **Emotional safety** is best measured at moments of vulnerable disclosure as the user's *perceived* responsiveness. Display it as the user's experience, not the other's trait. (§2.8, §2.20)
8. **Growth** should be reframed from "influence toward the user's values" to "affirms who the user wants to become" (user-defined). No similarity metric. (§2.19, §2.22)
9. **Respect** should add third-party loyalty (defends me in my absence, tolerates my other friends, no public criticism) and privacy co-ownership (confidences). (§2.11, §2.13)
10. **Availability** separation is supported; add user-declared "capacity-limited" windows that down-weight reciprocity/consistency evidence. (§2.16)
11. **Pause & Reflect** must trigger on *baseline-inconsistent* requests, not on requests per se; needs-based asks are normal in communal relationships. The reappearance-with-request pattern needs ≥3 cycles. (§2.24)
12. **Advice evaluation** should ask about conflicts of interest even when the advisor has disclosed them; disclosure doesn't neutralize bias. (§2.24)
13. **Dating mode**: responsiveness/warmth is not a universal interest signal; weight *person-directed, selective* investment; "offers an alternative when declining" is a heuristic, not a validated predictor; no probability of interest. (§2.26)
14. **Circle 5** is Kith-specific, not a Dunbar layer; moves into it should be user-initiated or user-confirmed, given the health costs of disconnection and the negative-interpretation bias of loneliness. (§2.15, §2.16)
15. **Add a "cost to them" flag** to weight diagnostic events (interdependence theory). (§2.3)
16. **Add a "forming" state** for new relationships (no inner/close-circle suggestions). (§2.1)
17. **Cultural/individual settings** — let the user state their friendship emphasis (practical vs. emotional) and personal rules; avoid gendered defaults. (§2.11, §2.25)

---

## 8. References

All DOIs were verified against Crossref metadata on 2026-09-26. Links use `https://doi.org/`.

| Key | Reference | Link |
|---|---|---|
| R01 | Hall, J. A. (2019). How many hours does it take to make a friend? *Journal of Social and Personal Relationships, 36*(4), 1278–1296. | https://doi.org/10.1177/0265407518761225 |
| R02 | Oswald, D. L., & Clark, E. M. (2003). Best friends forever?: High school best friendships and the transition to college. *Personal Relationships, 10*(2), 187–196. | https://doi.org/10.1111/1475-6811.00045 |
| R03 | Gouldner, A. W. (1960). The norm of reciprocity: A preliminary statement. *American Sociological Review, 25*(2), 161–178. | https://doi.org/10.2307/2092623 |
| R04 | Clark, M. S., & Mills, J. (1979). Interpersonal attraction in exchange and communal relationships. *Journal of Personality and Social Psychology, 37*(1), 12–24. | https://doi.org/10.1037/0022-3514.37.1.12 |
| R05 | Clark, M. S. (1984). Record keeping in two types of relationships. *Journal of Personality and Social Psychology, 47*(3), 549–557. | https://doi.org/10.1037/0022-3514.47.3.549 |
| R06 | Clark, M. S., Mills, J., & Powell, M. C. (1986). Keeping track of needs in communal and exchange relationships. *Journal of Personality and Social Psychology, 51*(2), 333–338. | https://doi.org/10.1037/0022-3514.51.2.333 |
| R07 | Oswald, D. L., Clark, E. M., & Kelly, C. M. (2004). Friendship maintenance: An analysis of individual and dyad behaviors. *Journal of Social and Clinical Psychology, 23*(3), 413–441. | https://doi.org/10.1521/jscp.23.3.413.35460 |
| R08 | Hall, J. A. (2011). Sex differences in friendship expectations: A meta-analysis. *Journal of Social and Personal Relationships, 28*(6), 723–747. | https://doi.org/10.1177/0265407510386192 |
| R09 | Kelley, H. H., & Thibaut, J. W. (1978). *Interpersonal relations: A theory of interdependence.* Wiley. (Book; ISBN 0471034738) | https://openlibrary.org/books/OL4714077M/Interpersonal_relations |
| R10 | Rusbult, C. E., & Van Lange, P. A. M. (2003). Interdependence, interaction, and relationships. *Annual Review of Psychology, 54*, 351–375. | https://doi.org/10.1146/annurev.psych.54.101601.145059 |
| R11 | Simpson, J. A. (2007). Psychological foundations of trust. *Current Directions in Psychological Science, 16*(5), 264–268. | https://doi.org/10.1111/j.1467-8721.2007.00517.x |
| R12 | Rempel, J. K., Holmes, J. G., & Zanna, M. P. (1985). Trust in close relationships. *Journal of Personality and Social Psychology, 49*(1), 95–112. | https://doi.org/10.1037/0022-3514.49.1.95 |
| R13 | Mayer, R. C., Davis, J. H., & Schoorman, F. D. (1995). An integrative model of organizational trust. *Academy of Management Review, 20*(3), 709–734. | https://doi.org/10.5465/amr.1995.9508080335 |
| R14 | Lewicki, R. J., McAllister, D. J., & Bies, R. J. (1998). Trust and distrust: New relationships and realities. *Academy of Management Review, 23*(3), 438–458. | https://doi.org/10.5465/amr.1998.926620 |
| R15 | Lewicki, R. J., & Bunker, B. B. (1996). Developing and maintaining trust in work relationships. In R. M. Kramer & T. R. Tyler (Eds.), *Trust in organizations: Frontiers of theory and research* (pp. 114–139). Sage. | https://doi.org/10.4135/9781452243610.n7 |
| R16 | Kim, P. H., Ferrin, D. L., Cooper, C. D., & Dirks, K. T. (2004). Removing the shadow of suspicion: The effects of apology versus denial for repairing competence- versus integrity-based trust violations. *Journal of Applied Psychology, 89*(1), 104–118. | https://doi.org/10.1037/0021-9010.89.1.104 |
| R17 | Schweitzer, M. E., Hershey, J. C., & Bradlow, E. T. (2006). Promises and lies: Restoring violated trust. *Organizational Behavior and Human Decision Processes, 101*(1), 1–19. | https://doi.org/10.1016/j.obhdp.2006.05.005 |
| R18 | Dirks, K. T., Lewicki, R. J., & Zaheer, A. (2009). Repairing relationships within and between organizations: Building a conceptual foundation. *Academy of Management Review, 34*(1), 68–84. | https://doi.org/10.5465/amr.2009.35713285 |
| R19 | Fincham, F. D. (2000). The kiss of the porcupines: From attributing responsibility to forgiving. *Personal Relationships, 7*(1), 1–23. | https://doi.org/10.1111/j.1475-6811.2000.tb00001.x |
| R20 | McCullough, M. E., Worthington, E. L., Jr., & Rachal, K. C. (1997). Interpersonal forgiving in close relationships. *Journal of Personality and Social Psychology, 73*(2), 321–336. | https://doi.org/10.1037/0022-3514.73.2.321 |
| R21 | McCullough, M. E., Fincham, F. D., & Tsang, J.-A. (2003). Forgiveness, forbearance, and time: The temporal unfolding of transgression-related interpersonal motivations. *Journal of Personality and Social Psychology, 84*(3), 540–557. | https://doi.org/10.1037/0022-3514.84.3.540 |
| R22 | Cohen, S., & Wills, T. A. (1985). Stress, social support, and the buffering hypothesis. *Psychological Bulletin, 98*(2), 310–357. | https://doi.org/10.1037/0033-2909.98.2.310 |
| R23 | Bolger, N., Zuckerman, A., & Kessler, R. C. (2000). Invisible support and adjustment to stress. *Journal of Personality and Social Psychology, 79*(6), 953–961. | https://doi.org/10.1037/0022-3514.79.6.953 |
| R24 | Adams, G., & Plaut, V. C. (2003). The cultural grounding of personal relationship: Friendship in North American and West African worlds. *Personal Relationships, 10*(3), 333–347. | https://doi.org/10.1111/1475-6811.00053 |
| R25 | Reis, H. T., & Shaver, P. (1988). Intimacy as an interpersonal process. In S. Duck (Ed.), *Handbook of personal relationships: Theory, research and interventions* (pp. 367–389). Wiley. (Book chapter) | https://search.worldcat.org/title/16527128 |
| R26 | Reis, H. T., Clark, M. S., & Holmes, J. G. (2004). Perceived partner responsiveness as an organizing construct in the study of intimacy and closeness. In D. J. Mashek & A. P. Aron (Eds.), *Handbook of closeness and intimacy* (pp. 201–225). Erlbaum. (Book chapter; author-hosted PDF) | https://www.sas.rochester.edu/psy/people/faculty/reis_harry/assets/pdf/ReisClarkHolmes_2004.pdf |
| R27 | Laurenceau, J.-P., Barrett, L. F., & Pietromonaco, P. R. (1998). Intimacy as an interpersonal process: The importance of self-disclosure, partner disclosure, and perceived partner responsiveness in interpersonal exchanges. *Journal of Personality and Social Psychology, 74*(5), 1238–1251. | https://doi.org/10.1037/0022-3514.74.5.1238 |
| R28 | Gable, S. L., Reis, H. T., Impett, E. A., & Asher, E. R. (2004). What do you do when things go right? The intrapersonal and interpersonal benefits of sharing positive events. *Journal of Personality and Social Psychology, 87*(2), 228–245. | https://doi.org/10.1037/0022-3514.87.2.228 |
| R29 | Gable, S. L., Gonzaga, G. C., & Strachman, A. (2006). Will you be there for me when things go right? Supportive responses to positive event disclosures. *Journal of Personality and Social Psychology, 91*(5), 904–917. | https://doi.org/10.1037/0022-3514.91.5.904 |
| R30 | Argyle, M., & Henderson, M. (1984). The rules of friendship. *Journal of Social and Personal Relationships, 1*(2), 211–237. | https://doi.org/10.1177/0265407584012005 |
| R31 | Canary, D. J., & Stafford, L. (1992). Relational maintenance strategies and equity in marriage. *Communication Monographs, 59*(3), 243–267. | https://doi.org/10.1080/03637759209376268 |
| R32 | Hazan, C., & Shaver, P. (1987). Romantic love conceptualized as an attachment process. *Journal of Personality and Social Psychology, 52*(3), 511–524. | https://doi.org/10.1037/0022-3514.52.3.511 |
| R33 | Mikulincer, M., & Shaver, P. R. (2016). *Attachment in adulthood: Structure, dynamics, and change* (2nd ed.). Guilford Press. (Book; ISBN 9781462525546) | https://www.guilford.com/books/Attachment-in-Adulthood/Mikulincer-Shaver/9781462533817 |
| R34 | Murray, S. L., Holmes, J. G., & Collins, N. L. (2006). Optimizing assurance: The risk regulation system in relationships. *Psychological Bulletin, 132*(5), 641–666. | https://doi.org/10.1037/0033-2909.132.5.641 |
| R35 | Birnbaum, G. E., & Reis, H. T. (2012). When does responsiveness pique sexual interest? Attachment and sexual desire in initial acquaintanceships. *Personality and Social Psychology Bulletin, 38*(7), 946–958. | https://doi.org/10.1177/0146167212441028 |
| R36 | Petronio, S. (2010). Communication privacy management theory: What do we know about family privacy regulation? *Journal of Family Theory & Review, 2*(3), 175–196. | https://doi.org/10.1111/j.1756-2589.2010.00052.x |
| R37 | Hall, J. A., & Baym, N. K. (2012). Calling and texting (too much): Mobile maintenance expectations, (over)dependence, entrapment, and friendship satisfaction. *New Media & Society, 14*(2), 316–331. | https://doi.org/10.1177/1461444811415047 |
| R38 | Cialdini, R. B., & Goldstein, N. J. (2004). Social influence: Compliance and conformity. *Annual Review of Psychology, 55*, 591–621. | https://doi.org/10.1146/annurev.psych.55.090902.142015 |
| R39 | Gottman, J. M., & Levenson, R. W. (1992). Marital processes predictive of later dissolution: Behavior, physiology, and health. *Journal of Personality and Social Psychology, 63*(2), 221–233. | https://doi.org/10.1037/0022-3514.63.2.221 |
| R40 | Gottman, J. M., Coan, J., Carrere, S., & Swanson, C. (1998). Predicting marital happiness and stability from newlywed interactions. *Journal of Marriage and the Family, 60*(1), 5–22. | https://doi.org/10.2307/353438 |
| R41 | Driver, J. L., & Gottman, J. M. (2004). Daily marital interactions and positive affect during marital conflict among newlywed couples. *Family Process, 43*(3), 301–314. | https://doi.org/10.1111/j.1545-5300.2004.00024.x |
| R42 | Holt-Lunstad, J., Smith, T. B., & Layton, J. B. (2010). Social relationships and mortality risk: A meta-analytic review. *PLoS Medicine, 7*(7), e1000316. | https://doi.org/10.1371/journal.pmed.1000316 |
| R43 | Hawkley, L. C., & Cacioppo, J. T. (2010). Loneliness matters: A theoretical and empirical review of consequences and mechanisms. *Annals of Behavioral Medicine, 40*(2), 218–227. | https://doi.org/10.1007/s12160-010-9210-8 |
| R44 | Dunbar, R. I. M. (1992). Neocortex size as a constraint on group size in primates. *Journal of Human Evolution, 22*(6), 469–493. | https://doi.org/10.1016/0047-2484(92)90081-J |
| R45 | Dunbar, R. I. M. (2018). The anatomy of friendship. *Trends in Cognitive Sciences, 22*(1), 32–51. | https://doi.org/10.1016/j.tics.2017.10.004 |
| R46 | Zhou, W.-X., Sornette, D., Hill, R. A., & Dunbar, R. I. M. (2005). Discrete hierarchical organization of social group sizes. *Proceedings of the Royal Society B, 272*(1561), 439–444. | https://doi.org/10.1098/rspb.2004.2970 |
| R47 | Saramäki, J., Leicht, E. A., López, E., Roberts, S. G. B., Reed-Tsochas, F., & Dunbar, R. I. M. (2014). Persistence of social signatures in human communication. *PNAS, 111*(3), 942–947. | https://doi.org/10.1073/pnas.1308540110 |
| R48 | Miritello, G., Moro, E., Lara, R., Martínez-López, R., Belchamber, J., Roberts, S. G. B., & Dunbar, R. I. M. (2013). Time as a limited resource: Communication strategy in mobile phone networks. *Social Networks, 35*(1), 89–95. | https://doi.org/10.1016/j.socnet.2013.01.003 |
| R49 | Lindenfors, P., Wartel, A., & Lind, J. (2021). 'Dunbar's number' deconstructed. *Biology Letters, 17*(5), 20210158. | https://doi.org/10.1098/rsbl.2021.0158 |
| R50 | Roberts, S. G. B., & Dunbar, R. I. M. (2015). Managing relationship decay: Network, gender, and contextual effects. *Human Nature, 26*(4), 426–450. | https://doi.org/10.1007/s12110-015-9242-7 |
| R51 | Roberts, S. G. B., & Dunbar, R. I. M. (2011). The costs of family and friends: An 18-month longitudinal study of relationship maintenance and decay. *Evolution and Human Behavior, 32*(3), 186–197. | https://doi.org/10.1016/j.evolhumbehav.2010.08.005 |
| R52 | Roberts, S. G. B., & Dunbar, R. I. M. (2011). Communication in social networks: Effects of kinship, network size, and emotional closeness. *Personal Relationships, 18*(3), 439–452. | https://doi.org/10.1111/j.1475-6811.2010.01310.x |
| R53 | Burt, R. S. (2000). Decay functions. *Social Networks, 22*(1), 1–28. | https://doi.org/10.1016/S0378-8733(99)00015-5 |
| R54 | Granovetter, M. S. (1973). The strength of weak ties. *American Journal of Sociology, 78*(6), 1360–1380. | https://doi.org/10.1086/225469 |
| R55 | McPherson, M., Smith-Lovin, L., & Cook, J. M. (2001). Birds of a feather: Homophily in social networks. *Annual Review of Sociology, 27*, 415–444. | https://doi.org/10.1146/annurev.soc.27.1.415 |
| R56 | Montoya, R. M., Horton, R. S., & Kirchner, J. (2008). Is actual similarity necessary for attraction? A meta-analysis of actual and perceived similarity. *Journal of Social and Personal Relationships, 25*(6), 889–922. | https://doi.org/10.1177/0265407508096700 |
| R57 | Altman, I., & Taylor, D. A. (1973). *Social penetration: The development of interpersonal relationships.* Holt, Rinehart & Winston. (Book) | https://search.worldcat.org/title/623272 |
| R58 | Collins, N. L., & Miller, L. C. (1994). Self-disclosure and liking: A meta-analytic review. *Psychological Bulletin, 116*(3), 457–475. | https://doi.org/10.1037/0033-2909.116.3.457 |
| R59 | Rusbult, C. E. (1980). Commitment and satisfaction in romantic associations: A test of the investment model. *Journal of Experimental Social Psychology, 16*(2), 172–186. | https://doi.org/10.1016/0022-1031(80)90007-4 |
| R60 | Rusbult, C. E., Martz, J. M., & Agnew, C. R. (1998). The Investment Model Scale: Measuring commitment level, satisfaction level, quality of alternatives, and investment size. *Personal Relationships, 5*(4), 357–387. | https://doi.org/10.1111/j.1475-6811.1998.tb00177.x |
| R61 | Le, B., & Agnew, C. R. (2003). Commitment and its theorized determinants: A meta-analysis of the Investment Model. *Personal Relationships, 10*(1), 37–57. | https://doi.org/10.1111/1475-6811.00035 |
| R62 | Drigotas, S. M., Rusbult, C. E., Wieselquist, J., & Whitton, S. W. (1999). Close partner as sculptor of the ideal self: Behavioral affirmation and the Michelangelo phenomenon. *Journal of Personality and Social Psychology, 77*(2), 293–323. | https://doi.org/10.1037/0022-3514.77.2.293 |
| R63 | Penner, L. A., Dovidio, J. F., Piliavin, J. A., & Schroeder, D. A. (2005). Prosocial behavior: Multilevel perspectives. *Annual Review of Psychology, 56*, 365–392. | https://doi.org/10.1146/annurev.psych.56.091103.070141 |
| R64 | Bonaccio, S., & Dalal, R. S. (2006). Advice taking and decision-making: An integrative literature review, and implications for the organizational sciences. *Organizational Behavior and Human Decision Processes, 101*(2), 127–151. | https://doi.org/10.1016/j.obhdp.2006.07.001 |
| R65 | Cain, D. M., Loewenstein, G., & Moore, D. A. (2005). The dirt on coming clean: Perverse effects of disclosing conflicts of interest. *Journal of Legal Studies, 34*(1), 1–25. | https://doi.org/10.1086/426699 |
| R66 | Thomson, R., Yuki, M., Talhelm, T., Schug, J., Kito, M., Ayanian, A. H., et al. (2018). Relational mobility predicts social behaviors in 39 countries and is tied to historical farming and threat. *PNAS, 115*(29), 7521–7526. | https://doi.org/10.1073/pnas.1713191115 |
| R67 | Henrich, J., Heine, S. J., & Norenzayan, A. (2010). The weirdest people in the world? *Behavioral and Brain Sciences, 33*(2–3), 61–83. | https://doi.org/10.1017/S0140525X0999152X |
| R68 | Eastwick, P. W., Finkel, E. J., Mochon, D., & Ariely, D. (2007). Selective versus unselective romantic desire: Not all reciprocity is created equal. *Psychological Science, 18*(4), 317–319. | https://doi.org/10.1111/j.1467-9280.2007.01897.x |
| R69 | Montoya, R. M., & Insko, C. A. (2008). Toward a more complete understanding of the reciprocity of liking effect. *European Journal of Social Psychology, 38*(3), 477–498. | https://doi.org/10.1002/ejsp.431 |
| R70 | Joel, S., Eastwick, P. W., & Finkel, E. J. (2017). Is romantic desire predictable? Machine learning applied to initial romantic attraction. *Psychological Science, 28*(10), 1478–1489. | https://doi.org/10.1177/0956797617714580 |
| R71 | Finkel, E. J., Eastwick, P. W., Karney, B. R., Reis, H. T., & Sprecher, S. (2012). Online dating: A critical analysis from the perspective of psychological science. *Psychological Science in the Public Interest, 13*(1), 3–66. | https://doi.org/10.1177/1529100612436522 |
| R72 | Kalman, Y. M., & Rafaeli, S. (2011). Online pauses and silence: Chronemic expectancy violations in written computer-mediated communication. *Communication Research, 38*(1), 54–69. | https://doi.org/10.1177/0093650210378229 |
| R73 | Ross, L. (1977). The intuitive psychologist and his shortcomings: Distortions in the attribution process. *Advances in Experimental Social Psychology, 10*, 173–220. | https://doi.org/10.1016/S0065-2601(08)60357-3 |
| R74 | Gilbert, D. T., & Malone, P. S. (1995). The correspondence bias. *Psychological Bulletin, 117*(1), 21–38. | https://doi.org/10.1037/0033-2909.117.1.21 |
| R75 | Malle, B. F. (2006). The actor–observer asymmetry in attribution: A (surprising) meta-analysis. *Psychological Bulletin, 132*(6), 895–919. | https://doi.org/10.1037/0033-2909.132.6.895 |
| R76 | Pronin, E., Lin, D. Y., & Ross, L. (2002). The bias blind spot: Perceptions of bias in self versus others. *Personality and Social Psychology Bulletin, 28*(3), 369–381. | https://doi.org/10.1177/0146167202286008 |
| R77 | Baumeister, R. F., Bratslavsky, E., Finkenauer, C., & Vohs, K. D. (2001). Bad is stronger than good. *Review of General Psychology, 5*(4), 323–370. | https://doi.org/10.1037/1089-2680.5.4.323 |
| R78 | Hogarth, R. M., & Einhorn, H. J. (1992). Order effects in belief updating: The belief-adjustment model. *Cognitive Psychology, 24*(1), 1–55. | https://doi.org/10.1016/0010-0285(92)90002-J |

**Count:** 78 references — 73 with DOIs (all resolved against Crossref metadata), plus 5 books/chapters without DOIs (R09, R25, R26, R33, R57) verified via publisher, library-catalogue or author-hosted records.
