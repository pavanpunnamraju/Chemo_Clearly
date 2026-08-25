# AC-T — Regimen Content Draft

**Status: AI-drafted, not reviewed.** No PES exists for AC-T, so this is grounded entirely
in the same research-based approach as R-CHOP. Every clinical claim below is source-tagged.
Goes to logic-agent for medical/UX review before being presented to the human as ready.
Schema: `docs/content/schema.md`.

## Sources

| id | source | type |
|---|---|---|
| S1 | NCI (National Cancer Institute), "AC-T" (cancer.gov/about-cancer/treatment/drugs/ac-t) | federal clinical authority |
| S2 | Living Beyond Breast Cancer (LBBC), "AC-T Chemotherapy Regimen" (lbbc.org) | reputable patient-education org |
| S3 | breastcancer.org, "AC-T Chemo Treatment" | reputable patient-education org |
| A1 | Patient forum/blog accounts ("red devil" nickname, day 7-8 worst-day reports, taste-change notes) | **anecdotal — not a clinical source** |
| S5a | FDA Prescribing Information, ADRIAMYCIN (doxorubicin HCl) for Injection (accessdata.fda.gov/drugsatfda_docs/label/2012/062921s022lbl.pdf) — cumulative-dose → CHF-risk table | FDA drug label |
| S5d | Roila et al., 2016 MASCC/ESMO Antiemetic Guideline update — emetic-risk classification of antineoplastic agents (anthracycline+cyclophosphamide reclassified as highly emetogenic), PMID 27501965 | clinical practice guideline |
| S5e | "Management and Outcome of Taxane-Induced Nail Side Effects: Experience of 79 Patients from a Single Centre," PMC6751462 | peer-reviewed study |
| S5f | "Paclitaxel-induced peripheral neuropathy in patients receiving adjuvant chemotherapy for breast cancer," PMID 22105895 | peer-reviewed study |

---

## `overview`

**tags:** `what-it-is`, `schedule`

**drug_names:** `doxorubicin`, `cyclophosphamide`, `paclitaxel`

**plain:** AC-T is three chemotherapy medicines given in two back-to-back phases to treat
breast cancer. First "AC": doxorubicin (Adriamycin) plus cyclophosphamide (Cytoxan) — 4
doses, one every 2–3 weeks. Then "T": paclitaxel (Taxol) — 4 more doses. All three are
given by IV. Total course is roughly 4–5 months depending on schedule. [S1, S2]

**detail:** Two common schedules exist: **dose-dense** (AC every 2 weeks × 4, then taxane
every 2 weeks × 4, ~16 weeks total, with a growth-factor injection to support blood counts
between doses) or **standard** (AC every 3 weeks × 4, then taxane every 3 weeks × 4, or
taxane given weekly at a lower dose, ~5 months total). Doxorubicin damages cancer cell DNA;
cyclophosphamide damages DNA in resting cancer cells; paclitaxel works differently — it
disrupts the internal "skeleton" structure cancer cells need to divide, which is why the
side-effect pattern shifts noticeably once you move from the AC phase to the T phase. [S1, S2]
Doxorubicin is usually given through a port near a large vein; cyclophosphamide and
paclitaxel can go through a regular arm/hand IV or the same port. [S2]

---

## `timeline`

**tags:** `schedule`, `how-it-feels-daily`

**plain — AC phase:**
- **Infusion day:** Several hours in the chair; anti-nausea premedication is standard given
  how strongly AC can trigger nausea. Red/orange urine on the day of and day after each AC
  infusion is expected — that's the doxorubicin drug color, not blood. [S1, S2]
- **First few days after:** Fatigue and nausea are common in this window, typically most
  noticeable in the first few days after each AC dose. [S1, S2]
- **The low-count window (the nadir), in the days after each AC dose:** Your white blood
  cell count drops to its lowest point somewhere in this stretch before recovering, which
  is why infection precautions matter most here. The exact timing shifts with your
  schedule and phase — ask your team when your counts are expected to be lowest for your
  own regimen. [S1, S2]
- **If prescribed a growth-factor injection:** protects blood counts between doses.
- **Rest of the cycle:** Gradual recovery until the next AC dose. [S1, S2]

**review_note:** Growth-factor-support schedule for this protocol is unconfirmed —
routed to Dr. Reddy per orchestrator handoff. Do not guess a cadence
(single injection vs. multi-day) until he answers; the TODO line above is a deliberate
placeholder, not a sourcing gap to fill independently.

**plain — T (paclitaxel) phase:** Generally more tolerable than AC for nausea/fatigue, but
this is when joint/muscle aches and nerve tingling in hands and feet tend to show up or
worsen — often a couple of days after each dose. [S1, S2]

---

## `daily_life`

**tags:** `how-it-feels-daily`, `work-daily-life`, `fatigue`, `fertility-intimacy`

**plain:** Many people plan time off or reduced workload especially during the AC phase and
right after each dose; energy often improves somewhat during the T phase, though joint
aches or neuropathy can affect what feels comfortable then. How much time off you need
varies a lot by person and job — it's reasonable to plan for the lighter end until you
know how you personally respond. [S2]

**Exercise:** Gentle activity (walking) can help fatigue, appetite, and mood, as tolerated.
Avoid new intense exercise or contact activities during low-count windows given
bruising/infection risk, and be mindful of balance if you're developing neuropathy in the
T phase. [S2]

**Driving:** Safe as long as you're not currently dizzy, very fatigued, on a new sedating
medicine, or having numbness/weakness in your feet that affects pedal control — if in
doubt, don't drive that day. [S2]

**Intimacy:** Physical intimacy is generally safe; use a barrier method during and for
some time after treatment since trace chemo drugs can be present in bodily fluids (ask
your team for the exact window). See `fertility_intimacy` for more. [S1, S2]

**Helpful routines:** Many people find it easier to plan chores/appointments for the
second half of each cycle when energy is more likely to be back; keeping a simple symptom
log can help you and your team spot patterns across the AC-to-T transition.

**call_team_if:** Fatigue that keeps you from basic daily activities and doesn't improve
with rest.

**source:** S2

---

## `side_effects`

### Low blood counts / infection risk
**tags:** `infection-risk`
**tier:** `call_team`
**plain:** Both phases can lower your infection-fighting white blood cells. **A fever
during a low-count window is a medical emergency, not a routine call-team item — see the
`emergency` section for the exact threshold and what to do.** [S1, S2]
**self_care:** Hand hygiene, avoid sick contacts/crowds during low-count windows; you may
be prescribed a growth-factor injection.
**call_team_if:** Chills without fever, sore throat, cough, painful urination.
**detail:** Low white blood cell counts are expected with this regimen — most patients
have at least one low-count episode over the full course, which is a major reason
growth-factor support is commonly used, especially on dose-dense schedules. A fever during
one of these windows (see `emergency`) needs same-day care regardless of how mild it
feels. [S1, S2]
**source:** S1, S2

### Low red blood cells / anemia
**tags:** `fatigue`
**tier:** `self_care`
**plain:** You may feel unusually tired, weak, or look pale — this is from a temporary drop
in red blood cells, common with both the AC and T phases. [S1, S2]
**self_care:** Pace activities, prioritize sleep, avoid driving/heavy machinery when very
tired.
**call_team_if:** Shortness of breath, dizziness, fast or irregular heartbeat.
**detail:** A meaningful share of patients on AC-T develop a low red blood cell count on a
routine blood test at some point in the course; most cases are mild and don't need
transfusion, but your team checks counts regularly and will flag it if it needs
attention. [S1, S2]
**source:** S1, S2

### Nausea and appetite loss
**tags:** `nausea-appetite`
**tier:** `self_care`
**plain:** Most common during the AC phase; usually managed with anti-nausea medicine given
before infusion and prescribed for home use. [S1, S2]
**self_care:** Small frequent meals, bland foods, stay ahead of nausea with prescribed
medicine rather than waiting for symptoms.
**call_team_if:** Can't keep fluids down, vomiting >24h, signs of dehydration.
**detail:** The AC phase (doxorubicin + cyclophosphamide) is classified as highly
emetogenic by the MASCC/ESMO antiemetic guideline, which is why anti-nausea medicine is
given routinely before every AC dose; the taxane (T) phase is generally less emetogenic.
With standard preventive medicine, most patients have this well-controlled, though it
varies by individual. [S5d]
**source:** S1, S2, S5d

### Hair loss
**tags:** `hair-skin-appearance`
**tier:** `self_care`
**plain:** Hair loss is expected with this regimen, typically starting within the first
few weeks. [S2]
**self_care:** Scarves/hats/wigs; consider a short cut beforehand; scalp sun protection.
**detail:** Hair loss is expected in essentially all patients on this regimen — doxorubicin
and cyclophosphamide together make it near-universal rather than a side effect some
patients get and others don't. [S2]
**source:** S2

### Mouth sores
**tags:** `mouth-digestion`
**tier:** `self_care`
**plain:** The lining of the mouth can become irritated during treatment. [S2]
**self_care:** Gentle rinses, soft toothbrush, avoid acidic/spicy/rough foods.
**call_team_if:** Pain or sores interfering with eating or drinking.
**detail:** Reported in some patients on similar anthracycline/cyclophosphamide regimens;
most cases are mild irritation rather than severe sores. [S2]
**source:** S2

### Nerve tingling/numbness (peripheral neuropathy)
**tags:** `nerve-tingling`
**tier:** `call_team`
**plain:** Most associated with the taxane (T) phase — tingling, numbness, or pain in
hands or feet. [S1, S2]
**self_care:** Check hands/feet for injuries you might not feel; comfortable, well-fitting
shoes.
**call_team_if:** New or worsening numbness/burning, weakness, balance trouble — this can
affect treatment dosing, so report it rather than waiting.
**detail:** Some degree of peripheral neuropathy is common with paclitaxel — one adjuvant
breast cancer cohort found it in the large majority of patients to some extent, though
severe (dose-limiting) neuropathy is much less common than mild tingling. Weekly
paclitaxel schedules tend to have less severe neuropathy than every-3-week schedules,
though all-grade rates are similar; ask your team which schedule you're on. [S1, S2, S5f]
**source:** S1, S2, S5f

### Joint and muscle aches
**tags:** `aches-pain`
**tier:** `self_care`
**plain:** Body/joint aches are common a day or two after paclitaxel doses. [S2]
**self_care:** Over-the-counter pain relief if your team approves it, gentle movement, heat.
**detail:** Joint/muscle aches ("taxane arthralgia-myalgia") occur in a substantial share
of patients on paclitaxel, usually starting 1-3 days after a dose and resolving within a
week; it tends to lessen with later doses for most patients. [S2]
**source:** S2

### Bladder irritation (cyclophosphamide)
**tags:** `urinary`
**tier:** `call_team`
**plain:** Cyclophosphamide can irritate the bladder. [S1, S2]
**self_care:** Drink plenty of fluids, especially the first few days after an AC dose.
**call_team_if:** Red/orange urine on the day of and day after infusion is expected. Call
if it's still discolored after 2 days, if you see clots, or if it burns to urinate.
**detail:** At the IV doses used in AC-T, clinically significant bladder irritation
(hemorrhagic cystitis) is uncommon — it's much more frequent at the higher cumulative
doses used in some transplant-conditioning regimens, which this isn't. Staying
well-hydrated around AC infusion days is the main prevention. [S1, S2]
**source:** S1, S2

### Skin/nail changes and sun sensitivity
**tags:** `hair-skin-appearance`
**tier:** `self_care`
**plain:** Skin can become more sensitive to sun, and nails may darken or become brittle. [S2]
**self_care:** Sunscreen and protective clothing; gentle nail care.
**call_team_if:** A nail that becomes painful, or redness, swelling, or drainage around a
nail — these can be treated, and shouldn't be waited out.
**detail:** Nail changes — darkening, brittleness, ridging, and sometimes lifting from the
nail bed — can happen with paclitaxel. Many are mild, but they can also become painful
rather than purely cosmetic. [S5e]
**source:** S2, S5e

### Bruising/bleeding
**tags:** `bleeding-bruising`
**tier:** `call_team`
**plain:** Low platelets can make you bruise or bleed more easily. [S2]
**self_care:** Gentle hygiene habits, avoid NSAIDs unless cleared by your team.
**call_team_if:** Nosebleed lasting over 5 minutes, blood in urine/stool, unusual bruising.
**detail:** Low platelet counts on a routine blood test are less common with AC-T than the
white-cell/red-cell drops, but do occur at some point in a meaningful minority of
patients; most cases are mild and don't cause bleeding problems or need treatment. [S2]
**source:** S2

### Diarrhea
**tags:** `mouth-digestion`
**tier:** `self_care`
**plain:** Can occur with either phase. [S2]
**self_care:** Hydrate, low-fiber bland foods.
**call_team_if:** Frequent watery stools, bloody diarrhea, dizziness.
**detail:** Diarrhea affects a meaningful minority of patients on AC-related regimens;
most cases are mild and manageable with the self-care steps above. [S2]
**source:** S2

---

## `emergency`

### About this list

**tags:** `emergency-signs`
**plain:** Most people never experience these. They're listed so you know what to act on
quickly if you do.

### Fever during your low-blood-cell window (neutropenic fever)

**tags:** `emergency-signs`, `infection-risk`
**tier:** `emergency`
**plain:** **Fever during your low-blood-cell window** — a temperature of
100.4°F (38.0°C) or higher sustained for an hour, or a single reading of 101°F (38.3°C)
or higher, is a medical emergency when your infection-fighting white blood cells are low
(called neutropenic fever). Call your care team immediately, day or night — don't wait
for office hours or "see if it comes down." This is different from a fever during an
infusion/allergic reaction (below), which the infusion team is already watching for in
real time. Ask your team when your counts are expected to be lowest — that timing shifts
between the AC and taxane phases and with your specific schedule — but treat a fever at
this threshold as an emergency at any point in treatment, not only in that window.
**source:** S1, S2

### Infusion or allergic reaction

**tags:** `emergency-signs`
**tier:** `emergency`
**plain:** **Infusion/allergic reaction** — can happen during or shortly after an infusion (any of
the three drugs): rash, itching, swelling, trouble breathing, dizziness, fever. Tell the
infusion team immediately.
**detail:** Infusion/allergic reactions are most closely watched for on paclitaxel and the
first AC infusion, which is why premedication and monitoring are routine on those doses.
**source:** S1, S2

### Heart symptoms

**tags:** `emergency-signs`, `heart`
**tier:** `emergency`
**plain:** **Heart symptoms** (doxorubicin-related, more relevant at higher cumulative doses) — new
or worsening shortness of breath, swelling in legs/feet, chest pain/pressure, rapid
unexplained weight gain.
**detail:** Doxorubicin's heart-risk (congestive heart failure) is dose-dependent: the AC
phase of this regimen reaches a cumulative doxorubicin dose of 240 mg/m², which is below
the range where the FDA label begins quantifying risk (under 300 mg/m²) — risk still
rises steeply if a patient has received doxorubicin before (including in a prior cancer),
which is why disclosing prior treatment matters.
**source:** S1, S5a

### Severe low-blood-count complications

**tags:** `emergency-signs`, `infection-risk`
**tier:** `emergency`
**plain:** **Severe low-blood-count complications** — confusion or signs of serious infection during
the nadir window.
**source:** S1, S2

### When to call 911 vs. your care team

**tags:** `emergency-signs`
**plain:** **Call 911 or go to the ER for**: trouble breathing, chest pain, confusion, or anything
that feels life-threatening. **Call your care team right away** for the other items above,
including the fever threshold. Calling is always the right call — no one will think you're
overreacting.

---

## `fertility_intimacy`

**tags:** `fertility-intimacy`

**plain:** AC-T can affect fertility and can bring on menopause symptoms (hot flashes,
irregular or stopped periods) even in patients who weren't near menopause age. [S1, S2] If
future fertility matters to you, talk to your care team about preservation options before
starting. Effective contraception is generally recommended during treatment — ask your team
for the specific timeframe for your situation. **Don't breastfeed during treatment or for
some months after your last dose** — the chemotherapy drugs pass into breast milk and can
harm a nursing infant; ask your team for the exact timeframe for your situation, since it
varies by drug. [S1] Changes in how you feel about intimacy and body image are common and
worth raising with your team or a counselor — physical closeness like hugging and holding
hands stays safe throughout.

**source:** S1, S2

---

## `practical_life`

**tags:** `household-safety`, `work-daily-life`

**plain:** Tell your care team about every medicine, supplement, and vitamin you take.
Drinking plenty of fluids helps protect your kidneys and bladder, especially in the days
after an AC dose. Protect skin from sun exposure throughout treatment (photosensitivity).
Report fever or any sign of infection right away rather than waiting it out. For a period
after each infusion (this varies by drug — ask your team for specifics), traces of the
chemo drugs can be in your urine, stool, sweat, or vomit, so: use your usual toilet but
close the lid and flush (twice if low-flow); wash hands well after; keep pregnant
household members away from contact with body waste; wash soiled laundry separately. [S1,
S2]

**source:** S1, S2

---

## `patient_voices` (anecdotal — never a clinical claim)

**tags:** `emotional-support`

> AC is nicknamed the "red devil" — patients often describe it as the harder half of the
> regimen, sometimes knocking them down for several days after each dose, with the taxane
> (T) phase generally described as more manageable day-to-day but bringing its own joint
> aches and nerve tingling. [A1]

> Several patients mention taste changes during AC and say staying hydrated (plain water
> kept nearby) helped. [A1]

> Some patients on a growth-factor injection schedule mention day 7–8 as a particularly
> hard point in the cycle — this is anecdotal and not a documented clinical pattern; your
> own experience and schedule may differ. [A1]

**plain framing for the app:** "Other patients describe the AC part of this regimen as the
tougher stretch, with the days right after each dose being hardest, and the Taxol (T) part
as generally easier day-to-day but with more joint aches or tingling. Your own experience
may be different — your care team is the best judge of what's expected for you."

**source:** A1 — anecdotal, forum/blog material, explicitly not used for any clinical claim.

---

## `big_picture`

**tags:** `long-term-outlook`

**plain:** AC-T is a well-established, widely used regimen for breast cancer, often given
before or after surgery. [S1] As with R-CHOP, doxorubicin carries a lifetime maximum dose
because of cumulative heart risk — tell your team if you've received it before. [S1]

**source:** S1
