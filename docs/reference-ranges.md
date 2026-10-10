# Reference ranges

Status: **implemented** in the web app, the oximetry card and the PDF report (Phase 7 polish, after Phase 6). The values are orientative reading aids. Sources were searched in the second round; see [Sources](#sources). Two values are contradicted by the primary source and are flagged as open decisions. Code: `packages/core/src/reference.ts` (rules and constants), `apps/web/src/components/RefBadge.tsx` (state badge). Decision: [ADR-0013](decisions/0013-reference-ranges.md).

## Principles

1. **Additive only.** Reference information is added next to existing metrics, charts and text. Nothing shown before is removed or replaced: the AHI colour hints, the `Meter`, the existing badges, the explainers and the plain-language summary rules all stay.
2. **A reference is not a target.** Ranges are orientative reading aids. They do not replace the clinician's judgement, and every place that shows one says so (the report footnote, the card notes).
3. **Device-specific.** Some metrics mean different things on different devices (leak in particular). A range applies only to the device family it was written for. Families come from the stored manufacturer of the night's first session: `philips` (Philips Respironics), `resmed` (ResMed), `other` (demo data and unknown devices).
4. **No invented thresholds.** A metric without a verified reference shows its value and a neutral note (`No verified reference for this metric`), but no status.
5. **State is never colour alone** (see [design-system.md](design-system.md)). Each state is an icon, a colour and a text label.

## Three states

| State | Label (en / ca / es) | Icon (Lucide) | Colour (light / dark text) |
|---|---|---|---|
| Within range | Within range / Dins del rang / Dentro del rango | `CircleCheck` | green `#006300` / `#4ade80` |
| Attention | Attention / Atenció / Atención | `TriangleAlert` | amber `#8a5300` / `#fbbf24` |
| Out of range | Out of range / Fora de rang / Fuera de rango | `CircleX` | red `#b42323` / `#fca5a5` |

- Icons come from `lucide-react` (ISC licence, compatible with GPL-3.0-or-later). The names were checked against the installed version (1.55.0). The existing `Badge` keeps its own icons and is unchanged.
- The colours are the existing status tokens (`--st-good`, `--st-warn`, `--st-bad`), so the badges match the rest of the app in both themes.
- In the PDF the icon and the text carry the state, so it reads in black and white too.

## Metrics and values

### AHI (events per hour), all families
| Band | Range | State |
|---|---|---|
| Normal | < 5 | Within range |
| Mild | 5 to < 15 | Attention |
| Moderate or severe | ≥ 15 | Out of range |

*Unverified.* These are diagnostic bands, not treatment targets. The existing colour hints (green < 5, amber < 15, red ≥ 15) and the existing AHI badge already use these cut-offs, so the reference line only adds the text.

### Leak (L/min), judged on the 70th percentile
The night's **70th percentile** leak (time-weighted, `NightSummary.leak.p70`) is the figure judged. The 95th percentile stays on screen, unchanged.
- **ResMed:** below 24 L/min = within range; 24 or more = out of range. Source: ResMed AirSense 10 clinical guide, Sleep Report, *Mask Seal* ("Good — if the 70th percentile leak is less than 24 L/min"). Primary source, read. ResMed's leak figure is *unintentional* leak.
- **Philips DS2:** total leak (vent flow included). Working band from the maintainer's clinical experience, **not from a source**: **30 to 50 L/min = within range**; above 50 up to 60 = attention; **above 60 L/min, sustained = out of range** (the maintainer's reading of 60 to 70 L/min as the level where the device may struggle to hold the therapy pressure and keep the airway open). The app uses the night's 70th percentile as the sustained level. The threshold is one constant (`REFERENCE.leakPhilips.problem`); 70 would be the alternative. The Philips manual defines *Large Leak* only as a percentage of time, with no L/min threshold ([Sources](#sources)).
- **Other / unknown:** no status; note *No verified reference for this metric*.

### Usage (hours per night)
- At least 4 h per night = within range; less = attention. The compliance figure (≥ 4 h on ≥ 70 % of nights) already uses the same rule and is cited in the report with the 70 % share. *Unverified as a clinical threshold; it is the common payer rule.*

### Pressure, flat-topped breaths, periodic breathing, RERA
- **No reference range.** The value is shown with the note *No verified reference for this metric*. No state icon.

## Oximetry (from a separate oximeter)

Shown only when oximetry has been imported for the night.

| Metric | Reference | State |
|---|---|---|
| **ODI4** (desaturations ≥ 4 % per hour) | < 5 normal · 5 to < 15 mild · 15 to < 30 moderate · ≥ 30 severe | Within range (< 5), Attention (5 to < 15), Out of range (≥ 15). *Unverified; adults, polysomnography-derived.* |
| ODI3 (desaturations ≥ 3 % per hour) | No verified adult range | Value and note only |
| T90 (time below 90 % SpO₂) | No verified range | Value and note only |
| SpO₂ average and lowest | No verified range | Value and note only |

The oximetry card also states that the ODI bands come from sleep-lab (polysomnography) data and that a home oximeter can give different values. The existing plain-language summary rules (ODI4 ≥ 5 per hour; time below 90 % ≥ 5 % of the recording) are unchanged.

*T88 is shown in the data but has no reference line on the card.*

## Where it appears

**Web app**
- **Dashboard hero**: AHI, usage and leak tiles get a reference line of text. The usage and AHI badges that were already there stay. Leak gets a three-state badge for ResMed, or the Philips / no-reference note.
- **Oximetry card**: ODI4 gets a three-state badge and its reference line; the other tiles get the *no verified reference* note; a note explains the sleep-lab origin of the bands.
- Not yet: the night view, the trend charts and the Compare page (the report's trend charts already draw the 5 per hour and 4 h guide lines).

**PDF report**
- The summary table gains a **Reference** column: AHI and median AHI, usage, leak (per family), compliance and pressure. Badges appear only where a status exists.
- A footnote under the table: *References are orientative reading aids, not targets, and do not replace your clinician's judgement. The sources are being confirmed.*
- Existing tables, figures and text are unchanged.

## Sources

Searched on 2026-10-10. *Primary* means the document itself was read (text extracted from the PDF or the source file); *secondary* means a summary or a search snippet only. Where a value has no entry it is unsourced.

| Value in the app | Source | What it actually says | Status |
|---|---|---|---|
| AHI 5 and 15 bands | Epstein et al., *Clinical Guideline for the Evaluation, Management and Long-term Care of OSA in Adults*, JCSM 2009; 5(3):263–276. [PDF](https://www.med.upenn.edu/cbti/assets/user-content/documents/JCSM_ClinicalGuidelinesforOSA.pdf), [DOI 10.5664/jcsm.27497](https://jcsm.aasm.org/doi/10.5664/jcsm.27497) | Severity is defined for the **respiratory disturbance index (RDI)**: mild for RDI ≥ 5 and < 15, moderate for RDI ≥ 15 and ≤ 30, severe for RDI > 30 per hour. The guideline says the index definition has varied over time. It does not define a "normal" band; the < 5 band follows from the mild threshold. | **Primary** (text read). AHI versus RDI wording is a difference to keep in mind. |
| Usage ≥ 4 h per night, and 70 % of nights | CMS, *LCD L33718* (title not confirmed in the text read; the related NCD is 240.4, CPAP therapy for OSA), original effective date 10/01/2015. [CMS page](https://www.cms.gov/medicare-coverage-database/view/lcd.aspx?lcdid=33718) | Adherence is use of PAP ≥ 4 hours per night on 70 % of nights during a consecutive 30-day period in the first three months of use. | **Primary** (text read). It is a coverage rule, not a clinical target. |
| ResMed ≥ 4 h | ResMed, *AirSense 10 AutoSet, AFH, Elite CPAP clinical guide* (APAC, English, 48 pp.). [PDF](https://www.resmed.com.au/hubfs/airsense-10-autoset-afh-elite-cpap-clinical-guide-apac-eng.pdf) | "Days 4hrs+": days used for more than 4 hours. Consistent with the 4 h rule above. | **Primary** (text read). |
| **ResMed leak 24 L/min** (70th percentile) | Same ResMed guide, Sleep Report, *Mask Seal*: "Good—if the **70th percentile** leak is less than 24 L/min. Mask needs adjustment." | The 24 L/min threshold belongs to the **70th percentile** of leak. The guide's *Leak* figure is the average of daily 95th-percentile leak. | **Primary** (text read). The app now judges the 70th percentile (resolved). |
| ResMed *AHI for low leak only* | Same ResMed guide: "AHI and AI are calculated for times of low leak only." | ResMed excludes high-leak periods from its AHI. | **Primary** (text read). Not used by the app; noted for the explainer. |
| Philips large leak | Philips, *DreamStation CPAP user manual*. [PDF](https://www.documents.philips.com/doclib/enc/11405972/DreamStation_CPAP_User_Manual.pdf) | Large Leak is the **percentage of time** the leak was so high that events could not be identified with statistical accuracy. Mask Fit displays 100 % minus Large Leak (last 1, 7 and 30 days). | **Primary** (text read). The definition is sourced; **no L/min threshold is given**, so no status can be sourced. |
| OSCAR large-leak line 24 L/min | OSCAR source, `oscar/SleepLib/profiles.h`: `m_leakRedLine = initPref(STR_CS_LeakRedline, 24.0f)`, applies to all machines (the user guide says so too). Copy read: [wpfleger96/oscar-code](https://github.com/wpfleger96/oscar-code) (third-party mirror; upstream [sleepfiles.com/OSCAR](https://www.sleepfiles.com/OSCAR/)). | Default line 24.0 L/min, shown for every machine, including Philips total leak. | **Primary code** (mirror). OSCAR's default is a generic line, not a Philips range. |
| ODI4 bands (5, 15) | Home oximetry vs polysomnography, Clinics 2020, [doi:10.6061/clinics/2020/e2414](https://doi.org/10.6061/clinics/2020/e2414) ([PMC7654954](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7654954/)) | Best ODI4 cut-off for moderate-to-severe OSA (AHI > 15): **14 events/h** (ODI3: 12). Uses the AASM ≥ 4 % hypopnea definition. | **Primary** (text read). Supports 15 as the out-of-range boundary within one event. |
| ODI4 bands (5, 15), diabetes cohort | Frontiers in Endocrinology 2021, [doi:10.3389/fendo.2021.598470](https://doi.org/10.3389/fendo.2021.598470) ([PMC7985532](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7985532/)) | ODI cut-offs 5, 15 and 25 per hour predict AHI ≥ 5, ≥ 15 and ≥ 30 in 440 PSG patients. **The ODI percentage used (3 % or 4 %) was not confirmed in the text read.** | **Primary** (text read) with an open detail. |
| ODI < 5 excludes AHI ≥ 5 | Fabius et al., *Sleep and Breathing* 2019, [PubMed 29564732](https://pubmed.ncbi.nlm.nih.gov/29564732/) | In 3,413 portable recordings, ODI < 5 predicted AHI < 5 (sensitivity 97.7 %, specificity 97.0 %). Same oximeter for both measures. **ODI percentage not stated in the abstract.** | **Primary** (abstract read). Supports 5 as the normal boundary. |
| T90 | Ningbo study, *American Journal of Translational Research* 2023, [PubMed 37303658](https://pubmed.ncbi.nlm.nih.gov/37303658/) | T90 has diagnostic value (AUC 0.87 for OSA) but the abstract gives **no cut-off**. Search found no guideline cut-off; study-defined bands exist (≤ 5, 5–10, 10–25, > 25 %) but are research conventions. | **Primary** (abstract read). No status is justified. |
| T88, SpO₂ mean and minimum | Not found | — | Unsourced. No status. |
| ODI3 | Clinics 2020 (ODI3 cut-off 12/h, above) | Only a cut-off for AHI > 15, not a band. | Unsourced as a band. No status. |
| Pressure, flat-topped, periodic breathing, RERA | None | — | No reference. No status. |

## Open decisions

1. **Philips band (partly set).** The maintainer's bands are 30 to 50 L/min within range, 50 to 60 attention, above 60 out of range. Still to decide: 60 or 70 as the out-of-range line; whether "sustained" should be measured as time above the line rather than the night's 70th percentile; and whether any source exists.
2. **ODI percentage (resolved).** ODI4 is kept for all ODI bands. The Clinics 2020 cut-off (14 per hour) is for ODI4. The diabetes study and the Fabius abstract do not state the percentage in the text read; this does not change the decision.
3. **AHI 30 boundary (resolved).** No change. Every AHI of 15 or more stays *out of range*; moderate and severe share one state.

## Tests
- `packages/core/src/reference.test.ts`: boundaries of every band (4.99 / 5 / 14.99 / 15, 23.9 / 24, 3.99 / 4), family mapping, the Philips and unknown leak returning no status, and the manufacturer carried on the night summary.
- `e2e/reference.e2e.ts`: demo references and notes on the dashboard; the report's column and footnote; the oximetry card badge; a ResMed card with the 24 L/min reference.

## Open items
- Resolve the open decisions above.
- Remove *unverified* from the UI notes once every value that keeps a status has a primary source.
- Decide whether the Philips large-leak percentage (its definition is sourced) can be shown next to the band.
- Decide whether T90 / T88 should ever carry a status.
- Add the reference badges to the night view and the Compare page if wanted.
- Translations are in place for en / ca / es (parity is tested by `i18n.test.ts`); review the Catalan and Spanish wording with a native reader.
