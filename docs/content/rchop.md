# R-CHOP — Regimen Content Draft

**Status: AI-drafted, not reviewed.** Every clinical claim below is source-tagged. Goes to
logic-agent for medical/UX review before being presented to the human as ready. Dr. Reddy's
review/approval (the design doc's canonical-content step) happens after that, outside this
pipeline. Schema: `docs/content/schema.md`.

## Sources

| id | source | type |
|---|---|---|
| S1 | Cleveland Clinic, "What Is R-CHOP Chemotherapy?" (my.clevelandclinic.org/health/treatments/r-chop) | reputable clinical org |
| S2 | Cancer Research UK, "R-CHOP" (cancerresearchuk.org/about-cancer/treatment/drugs/r-chop) | reputable clinical org |
| S3 | NCODA/ACCC/HOPA/ONS Patient Education Sheet — R-CHOP, Oct 2025 (`docs/references/PES_R-CHOP.md`) | patient-education org (full-standing source; also the critique reference that motivated this schema) |
| S4 | Outcomes4Me, "Why the third day after chemo often feels the worst" | patient-health content org |
| A1 | Patient forum accounts (HealthUnlocked non-Hodgkin's-friends community, general chemo timeline blogs) | **anecdotal — not a clinical source** |
| S5a | FDA Prescribing Information, ADRIAMYCIN (doxorubicin HCl) for Injection (accessdata.fda.gov/drugsatfda_docs/label/2012/062921s022lbl.pdf) — cumulative-dose → CHF-risk table | FDA drug label |
| S5b | Xu et al., "Incidence and risk factors for febrile neutropenia of patients with diffuse large B-cell lymphoma receiving R-CHOP-21 in China," PMID 38200251 | peer-reviewed study |
| S5c | "Aspects of vincristine-induced neuropathy in hematologic malignancies: a systematic review," PMC6682573 | peer-reviewed systematic review |
| S5d | Roila et al., 2016 MASCC/ESMO Antiemetic Guideline update — emetic-risk classification of antineoplastic agents (anthracycline+cyclophosphamide reclassified as highly emetogenic), PMID 27501965 | clinical practice guideline |

---

## `overview`

**tags:** `what-it-is`, `schedule`

**plain:** R-CHOP is five medicines given together to treat certain lymphomas (cancers of
the lymph system). The name is the first letter of each drug: **R**ituximab,
**C**yclophosphamide, doxorubicin (**H**ydroxydaunorubicin), vincristine (**O**ncovin),
**P**rednisone. Four are given by IV on day 1 of each cycle; prednisone is a pill you take
at home for 5 days. A typical course is 6 cycles, 3 weeks apart, so about 18 weeks total.
[S1, S2]

**detail:** Rituximab is a monoclonal antibody (targeted therapy) that flags cancer cells
for the immune system to destroy; the other four are cytotoxic chemotherapy/steroid that
work by damaging cancer cells' ability to divide. Cycle length is most often 21 days, though
some protocols use 14-day ("dose-dense") cycles with growth-factor support. R-CHOP is most
often used for diffuse large B-cell lymphoma (DLBCL), and also for some follicular and
mantle cell lymphomas. [S1, S2]

---

## `timeline`

**tags:** `schedule`, `how-it-feels-daily`

**plain:** Here's roughly what one 3-week cycle feels like:

- **Day 1 (infusion day):** You'll be at the infusion center several hours — rituximab is
  given slowly the first time (it can take hours) to watch for reactions; the other three
  IV drugs are faster. You'll likely get anti-nausea and anti-allergy medicine first. Most
  people feel okay to a little tired the rest of that day. [S1, S2]
- **Days 2–5:** You keep taking prednisone (with food, not at night — it can keep you
  awake). Some people feel a temporary steroid "boost" of energy or restlessness during
  these days, followed by a dip once it's stopped. [S3, S4]
- **Roughly days 7–10 (the "nadir"):** Your white blood cell count is typically at its
  lowest here, which is why infection precautions matter most in this window. [S1, S2]
- **Days 11–21:** Most people gradually feel more like themselves as counts recover, until
  the next cycle starts.

**detail:** Hair loss, if it happens, usually starts within about 3 weeks of the first
infusion. [S1] Red/orange urine on the day of and day after infusion is expected — that's
the doxorubicin drug color, not blood. [S1, S3]

---

## `daily_life`

**tags:** `how-it-feels-daily`, `work-daily-life`, `fatigue`, `fertility-intimacy`

**plain:** Most people plan for lighter workload or time off around infusion day and the
few days after, and gradually pick back up toward the end of the cycle — how much varies a
lot by person and job. Some people work full schedules throughout; others need most of the
first week off each cycle. It's reasonable to plan for the lighter end until you know how
you personally respond. [S1, S3]

**Exercise:** Light activity (short walks) is usually fine and can help fatigue,
constipation, and mood. Rest when you need to, but staying a little active tends to help
more than full bed rest. Avoid new intense exercise or contact sports during low-count
windows (around days 7-10) given bruising/infection risk. [S1, S3]

**Driving:** Safe as long as you're not currently dizzy, very fatigued, or on a new
sedating medicine (some anti-nausea drugs can make you drowsy) — if in doubt, don't drive
that day. [S1]

**Intimacy:** Physical intimacy is generally safe; use a barrier method during and for
some time after treatment since trace chemo drugs can be present in bodily fluids (ask
your team for the exact window). See `fertility_intimacy` for more. [S1]

**Helpful routines:** Many people find it easier to plan chores/appointments for the
second half of each cycle when energy is more likely to be back; keeping a simple symptom
log can help you and your team spot patterns cycle to cycle.

**call_team_if:**
- You're too fatigued to manage basic daily activities
- Fatigue doesn't improve with rest at all

**source:** S1, S3

---

## `side_effects`

### Low white blood cells / infection risk
**tags:** `infection-risk`
**tier:** `call_team`
**plain:** This treatment temporarily lowers your infection-fighting white blood cells,
especially around days 7–10. **A fever is a medical emergency, not a routine call-team
item — at any point in treatment, not only during this window — see the `emergency`
section for the exact threshold and what to do.** [S1, S2]
**self_care:** Wash hands often; avoid crowds and sick contacts; your team may give you a
growth-factor injection to help counts recover faster.
**call_team_if:** Chills without fever; sore throat; cough; painful urination; unusual
tiredness; red/swollen/painful skin area.
**detail:** A fever during a low-count window (febrile neutropenia) is a well-recognized
risk on R-CHOP — enough that R-CHOP is treated as a higher-risk regimen for it, which is
why the threshold in the `emergency` section matters and why your team may give
growth-factor support to lower that risk. [S5b]
**source:** S1, S2, S5b

### Low platelets / bruising and bleeding
**tags:** `bleeding-bruising`
**tier:** `call_team`
**plain:** You may bruise or bleed more easily than usual. [S1]
**self_care:** Use a soft toothbrush and electric razor; avoid NSAIDs like ibuprofen unless
your team says it's fine; blow your nose gently.
**call_team_if:** A nosebleed that won't stop after 5 minutes of pressure; a cut that keeps
bleeding; significant gum bleeding; blood in urine or stool; severe headache.
**detail:** Some patients on R-CHOP-type regimens develop a low platelet count on a
routine blood test (thrombocytopenia) at some point in treatment; most cases are mild and
don't cause bleeding problems or need treatment. [S1]
**source:** S1

### Low red blood cells / anemia
**tags:** `fatigue`
**tier:** `self_care`
**plain:** You may feel unusually tired, weak, or look pale — this is from a temporary drop
in red blood cells. [S1, S2]
**self_care:** Pace activities, prioritize sleep, avoid driving/heavy machinery when very
tired.
**call_team_if:** Shortness of breath, dizziness, fast or irregular heartbeat.
**detail:** Some patients on R-CHOP develop a low red blood cell count on a routine blood
test (anemia) at some point in treatment, though severity varies widely — many cases are
mild and don't need transfusion. [S1]
**source:** S1

### Nausea and vomiting
**tags:** `nausea-appetite`
**tier:** `self_care`
**plain:** Nausea is common but usually well-controlled with medicine your team gives you
before and after infusion. [S1, S2, S3]
**self_care:** Take anti-nausea medicine on schedule even if you feel fine — it works
better as prevention than treatment; eat small, bland, frequent meals.
**call_team_if:** Vomiting more than 24 hours; can't keep fluids down; signs of dehydration;
blood or coffee-ground appearance in vomit.
**detail:** Without anti-nausea medicine, doxorubicin and cyclophosphamide together are
classified as highly emetogenic by the MASCC/ESMO antiemetic guideline; with the standard
preventive medicines given before and after infusion, most patients have this
well-controlled, though rates still vary by study and individual. [S5d]
**source:** S1, S5d

### Mouth sores
**tags:** `mouth-digestion`
**tier:** `self_care`
**plain:** The treatment can irritate the lining of your mouth. [S1]
**self_care:** Rinse with a mild salt/baking-soda rinse after meals and at bedtime; use a
soft toothbrush; avoid acidic, spicy, or rough foods.
**call_team_if:** Pain or sores that interfere with eating/drinking.
**detail:** Reported in some patients on CHOP-based regimens; most cases are mild
irritation rather than the severe mouth sores seen with higher-intensity regimens. [S1]
**source:** S1

### Diarrhea / constipation
**tags:** `mouth-digestion`
**tier:** `self_care`
**plain:** Bowel changes in either direction are common — from the chemo itself, the
steroid, or anti-nausea medicine. [S1]
**self_care:** For diarrhea: hydrate, low-fiber bland foods. For constipation: hydrate,
gentle activity, fiber if tolerated.
**call_team_if:** 4+ bowel movements above your normal in 24 hours, bloody diarrhea, or
constipation lasting 3+ days.
**detail:** Constipation (often from vincristine) is common on CHOP-based regimens;
diarrhea affects somewhat fewer. Both are usually manageable with the self-care steps
above, and your team may prescribe a laxative alongside vincristine preventively. [S1]
**source:** S1

### Nerve tingling/numbness (peripheral neuropathy)
**tags:** `nerve-tingling`
**tier:** `call_team`
**plain:** Vincristine can cause tingling, numbness, or pain, usually in hands or feet. [S1, S2]
**self_care:** Check feet daily for injuries you might not feel; wear well-fitting shoes.
**call_team_if:** Pins-and-needles or burning that's new or worsening, trouble moving
arms/legs, balance problems.
**detail:** Peripheral neuropathy is a common effect of vincristine, though reported rates
vary widely between studies depending on how it's measured; it often improves after
treatment ends, though it sometimes persists — which is why reporting it early matters.
Your team may adjust the vincristine dose if it worsens. [S5c]
**source:** S1, S5c

### Hair loss
**tags:** `hair-skin-appearance`
**tier:** `self_care`
**plain:** Hair loss is common with this regimen, usually starting within a few weeks of
the first infusion, and grows back after treatment ends (texture/color may be different at
first). [S1]
**self_care:** Consider a short haircut beforehand; scarves/hats/wigs; protect scalp from
sun.
**detail:** Hair loss is expected in essentially all patients on this regimen by the
second or third cycle — it's driven by doxorubicin and cyclophosphamide together, not a
side effect that some patients get and others don't. [S1]
**source:** S1

### Bladder irritation (cyclophosphamide)
**tags:** `urinary`
**tier:** `call_team`
**plain:** Cyclophosphamide can irritate the bladder. [S1]
**self_care:** Drink plenty of water, especially days 1–3 of each cycle.
**call_team_if:** Red/orange urine on the day of and day after infusion is expected. Call
if it's still discolored after 2 days, if you see clots, or if it burns to urinate.
**detail:** At the IV doses used in R-CHOP, clinically significant bladder irritation
(hemorrhagic cystitis) is uncommon — it's much more frequent at the higher cumulative
doses used in some transplant-conditioning regimens, which this isn't. Staying
well-hydrated around infusion days is the main prevention. [S1]
**source:** S1

### Steroid (prednisone) effects
**tags:** `emotional-support`
**tier:** `self_care`
**plain:** Prednisone can cause mood swings, irritability, trouble sleeping, and increased
appetite or blood sugar while you're taking it (days 1-5 of each cycle). Some people also
notice a "crash" — low energy or low mood — for a day or two after stopping it each cycle,
as your body adjusts back down. [S1, S3]
**self_care:** Take it in the morning with food, not at night; let people close to you know
this can happen so it isn't mistaken for something else; gentle activity and a consistent
sleep routine help; if you have diabetes or are at risk, monitor blood sugar more closely
during these days per your team's guidance.
**call_team_if:** Mood changes that feel severe, thoughts of self-harm, or symptoms that
don't ease up once you're a few days past the taper.
**detail:** Psychiatric-type side effects (mood swings, irritability, insomnia, anxiety)
from short courses of steroids like prednisone are common — reported in a meaningful
share of patients — though severe reactions are much less frequent; risk rises with dose
and is usually short-lived, easing within days of stopping. [S1, S3]
**source:** S1, S3

---

## `emergency`

**tags:** `emergency-signs`

**plain, always show this section prominently, separate from the list above:**

Most people never experience these. They're listed so you know what to act on quickly if
you do.

- **Fever during your low-blood-cell window (roughly days 7–10)** — a temperature of
  100.4°F (38.0°C) or higher sustained for an hour, or a single reading of 101°F (38.3°C)
  or higher, is a medical emergency when your infection-fighting white blood cells are low
  (called neutropenic fever). Call your care team immediately, day or night — don't wait
  for office hours or "see if it comes down." This is different from a fever during an
  infusion reaction (below), which the infusion team is already watching for in real time.
  Treat a fever at this threshold as an emergency at any point in treatment, not only
  during this window — you have no way to know your counts on a given day. [S1, S2]
- **Infusion reaction, can happen during or right after treatment** — chills/shaking,
  itching/rash, trouble breathing or wheezing, tongue swelling, dizziness or faintness,
  fever, back/neck pain. Tell the infusion team immediately if this happens during
  treatment. [S1, S3]
- **Signs of a serious allergic/skin reaction** — painful mouth/skin sores, blistering,
  peeling skin, widespread rash. [S1]
- **Heart symptoms** (doxorubicin can affect the heart, especially at higher lifetime
  doses) — swelling of belly/legs/hands/feet, shortness of breath, new or worsening chest
  pain/pressure, rapid weight gain (5+ lbs in a day). [S1, S3]
- **Signs of a serious brain/nerve problem** — confusion, sudden loss of balance, trouble
  walking or talking, one-sided weakness, new vision problems. [S1]
- **Tumor lysis syndrome signs** (more relevant right after starting treatment, when a lot
  of cancer cells break down quickly) — severe nausea/vomiting/diarrhea, very
  little/dark urine, muscle cramps, fast heartbeat, confusion. [S1]

**Call 911 or go to the ER for**: trouble breathing, chest pain, confusion, or anything
that feels life-threatening. **Call your care team right away** for the other items above,
including the fever threshold. Calling is always the right call — no one will think you're
overreacting.

**detail:** Rituximab infusion reactions are the most common item on this list — reported
in a substantial share of patients on their *first* infusion specifically (which is why
that dose is given more slowly and watched closely), dropping off sharply on later doses.
[S1] Doxorubicin's heart-risk (congestive heart failure) is dose-dependent: R-CHOP's
standard 6-cycle course reaches a cumulative doxorubicin dose of 300 mg/m², where the
FDA label lists a CHF risk of roughly 1-2%, rising steeply if a patient has received
doxorubicin before (including in a prior cancer) — which is why disclosing prior
treatment matters. [S5a] Tumor lysis syndrome is
uncommon overall and mainly a first-cycle concern in patients with a high existing tumor
burden; your team screens for this risk before your first infusion. [S1]

**source (detail):** S1, S5a

---

## `fertility_intimacy`

**tags:** `fertility-intimacy`

**plain:** This treatment can affect your ability to have children — talk to your care
team about fertility preservation before you start if this matters to you. It's also
recommended to use effective birth control during treatment and for some months after
(ask your team for the exact timeframe for your situation, since it differs by drug). Don't
breastfeed during treatment or for months after your last dose — the chemotherapy drugs
pass into breast milk and can harm a nursing infant; ask your team for the exact
timeframe for your situation, since it differs by drug. Changes in how you feel
about intimacy and your body are common and worth talking about — physical closeness like
hugging and holding hands stays safe throughout. [S1]

**source:** S1 (cross-checked against S2's general fertility guidance)

---

## `practical_life`

**tags:** `household-safety`, `work-daily-life`

**plain:** Tell your care team about every medicine, supplement, and vitamin you take —
some can interact with treatment. For a period after each infusion (this varies by drug —
ask your team for specifics), traces of the chemo drugs can be in your urine, stool, sweat,
or vomit, so: use your usual toilet but close the lid and flush (twice if low-flow); wash
hands well after; keep pregnant household members away from contact with body waste; wash
soiled laundry separately. [S1]

**source:** S1

---

## `patient_voices` (anecdotal — never a clinical claim)

**tags:** `emotional-support`

> "Day 3 is when it really hits — the steroids wear off and you just feel wiped." [A1]
> This "day 3" pattern is reported widely across chemo regimens in general (not
> R-CHOP-specific clinical research) — several patients describe fatigue, nausea, and
> general achiness peaking around day 3, once the day-1 pre-medications wear off. [S4]

> Several patients describe the week-1/nadir stretch as the hardest, with the days right
> after each infusion being when fatigue, mouth soreness, and low counts are most
> noticeable — and describe things gradually improving as the next infusion approaches. [A1]

**plain framing for the app:** "Other patients on R-CHOP have said the first few days after
each infusion tend to be the hardest, and that it gets more manageable as you settle into
the rhythm of cycles. Everyone's experience is different, and your care team is the best
judge of what's normal for you."

**source:** A1 — anecdotal, forum/blog material, explicitly not used for any clinical claim.

---

## `big_picture`

**tags:** `long-term-outlook`

**plain:** R-CHOP is one of the most established treatments for diffuse large B-cell
lymphoma. There's a small increased long-term risk of a second cancer (like leukemia) after this
treatment — your team will talk with you about this. [S3] Doxorubicin has a lifetime
maximum dose because of heart-risk buildup — tell your team if you've ever received it
before (including in a prior cancer treatment). [S3]

**review_note:** Remission-likelihood statistic/framing routed to Dr. Reddy per
orchestrator handoff (2026-08-06) — deliberately not guessed.

**source:** S1, S3
