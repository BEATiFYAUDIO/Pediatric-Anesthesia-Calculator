import React, { useMemo, useState } from "react";
import "./App.css";

/* ---------- small utils ---------- */
const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const roundTo = (n: number, step = 0.1) => Math.round(n / step) * step;

/* unit helpers */
const KG_PER_LB = 1 / 2.2046226218;
const LBS_PER_KG = 2.2046226218;

const formatKgLbs = (kg?: number) => (!kg || Number.isNaN(kg) ? "—" : `${round(kg, 2)} kg / ${round(kg * LBS_PER_KG, 2)} lbs`);

const feetInchesFromCm = (cm: number) => {
  const totalIn = cm / 2.54;
  const ft = Math.floor(totalIn / 12);
  const inches = totalIn - ft * 12;
  return { ft, inches };
};
const formatCmFtIn = (cm?: number) => (!cm || Number.isNaN(cm) ? "—" : `${round(cm, 1)} cm / ${feetInchesFromCm(cm).ft} ft ${round(feetInchesFromCm(cm).inches, 1)} in`);

/* parsing */
function parseWeight(v: string, unit: "kg" | "lb"): number | undefined {
  const num = parseFloat(v);
  if (Number.isNaN(num)) return undefined;
  return unit === "kg" ? num : num * KG_PER_LB;
}
function parseHeightCm(args: { cmValue: string; ftValue: string; inValue: string; unit: "cm" | "ftin" }): number | undefined {
  const { cmValue, ftValue, inValue, unit } = args;
  if (unit === "cm") {
    const cm = parseFloat(cmValue);
    return Number.isNaN(cm) ? undefined : cm;
  }
  const ft = parseFloat(ftValue);
  const inch = parseFloat(inValue);
  if (Number.isNaN(ft) && Number.isNaN(inch)) return undefined;
  const totalIn = (Number.isNaN(ft) ? 0 : ft * 12) + (Number.isNaN(inch) ? 0 : inch);
  return totalIn * 2.54;
}
function parseAgeYears(yrs: string, mos: string): number | undefined {
  const y = parseFloat(yrs || "0");
  const m = parseFloat(mos || "0");
  const hasY = !Number.isNaN(y) && yrs !== "";
  const hasM = !Number.isNaN(m) && mos !== "";
  if (!hasY && !hasM) return undefined;
  return (hasY ? y : 0) + (hasM ? m / 12 : 0);
}

/* BMI */
const bmiFromKgCm = (kg?: number, cm?: number) => {
  if (!kg || !cm) return undefined;
  const m = cm / 100;
  return m > 0 ? kg / (m * m) : undefined;
};

/* ---------- dosing helpers & data ---------- */
function calcDoseRange(
  kg: number,
  minPerKg: number,
  maxPerKg: number,
  opts?: { units?: string; roundTo?: number; cap?: number }
) {
  const units = opts?.units ?? "mg";
  const step = opts?.roundTo ?? 0.1;
  const cap = opts?.cap ?? Infinity;
  const low = Math.min(minPerKg * kg, cap);
  const high = Math.min(maxPerKg * kg, cap);
  return low === high ? `${roundTo(low, step)} ${units}` : `${roundTo(low, step)}–${roundTo(high, step)} ${units}`;
}

/* Common pediatric anesthesia meds (IV unless noted) */
const MEDS = [
  { name: "Propofol (induction)", perKg: [2, 3], units: "mg", note: "Titrate to effect" },
  { name: "Ketamine (IV)", perKg: [1, 2], units: "mg", note: "Analgesic/sedative" },
  { name: "Fentanyl", perKg: [1, 2], units: "mcg", note: "Slow IV" },
  { name: "Morphine", perKg: [0.05, 0.1], units: "mg", note: "Slow IV" },
  { name: "Midazolam (IV)", perKg: [0.05, 0.1], units: "mg", note: "Titrate" },
  { name: "Rocuronium", perKg: [0.6, 1.2], units: "mg", note: "Intubating dose" },
  { name: "Succinylcholine", perKg: [1, 2], units: "mg", note: "Avoid if contraindicated" },
  { name: "Atropine", perKg: [0.02, 0.02], units: "mg", note: "Min 0.1 mg; cap 1 mg" },
  { name: "Epinephrine 0.1 mg/mL (code)", perKg: [0.01, 0.01], units: "mg", note: "0.1 mL/kg of 0.1 mg/mL" },
  { name: "Dexamethasone", perKg: [0.1, 0.5], units: "mg", note: "PONV/airway edema" },
  { name: "Ondansetron", perKg: [0.1, 0.15], units: "mg", note: "Max 4 mg" },
  { name: "Acetaminophen (IV)", perKg: [10, 15], units: "mg", note: "q6h; max 75 mg/kg/day" },
  { name: "Ibuprofen (PO)", perKg: [10, 10], units: "mg", note: "q6–8h; max 40 mg/kg/day" },
  { name: "Lidocaine (plain) – max", perKg: [3, 5], units: "mg", note: "Max w/o epi" },
  { name: "Lidocaine w/ epi – max", perKg: [7, 7], units: "mg", note: "Max with epi" },
  { name: "Bupivacaine – max", perKg: [2, 3], units: "mg", note: "Regional/local" },
] as const;

/* ---------- airway helpers ---------- */
/** Age-based ETT formulas:
 *  Uncuffed ID (mm) ≈ (age/4) + 4
 *  Cuffed   ID (mm) ≈ (age/4) + 3.5
 *  Depth (oral) ≈ 3 × ETT ID (cm)  OR  ≈ 12 + age/2 (cm)
 */
function ettForAgeWeight(ageYears?: number, kg?: number) {
  let cuffed: number | undefined;
  let uncuffed: number | undefined;

  if (ageYears !== undefined && ageYears >= 1) {
    uncuffed = (ageYears / 4) + 4;
    cuffed = (ageYears / 4) + 3.5;
  } else if (kg !== undefined) {
    // Neonatal/infant weight-based suggestions
    // (typical ranges; device/brand/airway anatomy may vary)
    if (kg < 1.5)      { cuffed = 2.5; uncuffed = 2.5; }
    else if (kg < 3)   { cuffed = 3.0; uncuffed = 3.0; }
    else if (kg < 4)   { cuffed = 3.5; uncuffed = 3.5; }
    else               { cuffed = 3.5; uncuffed = 3.5; } // term neonate+
  }

  const size = cuffed ?? uncuffed;
  const depthBySize = size ? 3 * size : undefined;          // cm
  const depthByAge  = ageYears !== undefined ? (12 + ageYears / 2) : undefined; // cm

  const blade = suggestBlade(ageYears);
  return {
    cuffed: size ? roundTo(size, 0.5) : undefined,
    uncuffed: uncuffed ? roundTo(uncuffed, 0.5) : undefined,
    depthBySize: depthBySize ? round(depthBySize, 1) : undefined,
    depthByAge: depthByAge ? round(depthByAge, 1) : undefined,
    blade
  };
}

function suggestBlade(ageYears?: number) {
  if (ageYears === undefined) return "Miller 0–1 (infant) or Mac 2+ as age increases";
  if (ageYears < 0.25) return "Miller 0 (preterm/term)";
  if (ageYears < 1)    return "Miller 0–1";
  if (ageYears < 2)    return "Miller 1 (or Mac 1–2)";
  if (ageYears < 5)    return "Mac 2 (or Miller 2 per preference)";
  if (ageYears < 10)   return "Mac 2–3";
  return "Mac 3 (or video laryngoscope as per device)";
}

/* ---------- fluids ---------- */
/** 4–2–1 maintenance (mL/hr) */
function mIV_421(kg: number) {
  if (kg <= 0) return 0;
  if (kg <= 10) return 4 * kg;
  if (kg <= 20) return 40 + 2 * (kg - 10);
  return 60 + (kg - 20); // 1 mL/kg/hr beyond 20 kg
}
const bolus20 = (kg?: number) => (kg ? 20 * kg : undefined);

/* ---------- PALS quick calcs (cardiac arrest) ---------- */
/** Defib energy: 1st 2 J/kg, 2nd 4 J/kg, subsequent 4–10 J/kg (max adult dose) */
function palsShockEnergies(kg?: number) {
  if (!kg) return undefined;
  const first = 2 * kg;
  const second = 4 * kg;
  const subsequentLow = 4 * kg;
  const subsequentHigh = 10 * kg;
  return { first, second, subsequentLow, subsequentHigh };
}
/** Epinephrine 0.01 mg/kg of 0.1 mg/mL (i.e., 0.1 mL/kg) IV/IO */
function palsEpiArrest(kg?: number) {
  if (!kg) return undefined;
  const mg = 0.01 * kg;
  const mL = 0.1 * kg; // 0.1 mg/mL concentration
  return { mg: round(mg, 3), mL: round(mL, 2) };
}

export default function App() {
  /* weight/height */
  const [weightValue, setWeightValue] = useState("");
  const [weightUnit, setWeightUnit] = useState<"kg" | "lb">("kg");
  const [heightUnit, setHeightUnit] = useState<"cm" | "ftin">("cm");
  const [heightCmValue, setHeightCmValue] = useState("");
  const [heightFtValue, setHeightFtValue] = useState("");
  const [heightInValue, setHeightInValue] = useState("");

  /* NEW: age */
  const [ageYearsValue, setAgeYearsValue] = useState("");
  const [ageMonthsValue, setAgeMonthsValue] = useState("");

  const kg = useMemo(() => parseWeight(weightValue, weightUnit), [weightValue, weightUnit]);
  const cm = useMemo(
    () => parseHeightCm({ cmValue: heightCmValue, ftValue: heightFtValue, inValue: heightInValue, unit: heightUnit }),
    [heightUnit, heightCmValue, heightFtValue, heightInValue]
  );
  const ageY = useMemo(() => parseAgeYears(ageYearsValue, ageMonthsValue), [ageYearsValue, ageMonthsValue]);

  const bmi = useMemo(() => bmiFromKgCm(kg, cm), [kg, cm]);

  const medRows = useMemo(() => {
    if (!kg) return [] as Array<{ name: string; perkg: string; calc: string; note?: string }>;
    return (MEDS as any).map((m: any) => {
      const [minPk, maxPk] = m.perKg as [number, number];
      const units = m.units;
      let calc: string;
      if (units === "mcg") {
        const low = minPk * kg;
        const high = maxPk * kg;
        calc = low === high ? `${roundTo(low, 1)} mcg` : `${roundTo(low, 1)}–${roundTo(high, 1)} mcg`;
      } else {
        let cap = Infinity;
        if (m.name.startsWith("Ondansetron")) cap = 4;
        if (m.name.startsWith("Atropine")) cap = 1;
        calc = calcDoseRange(kg, minPk, maxPk, { units: "mg", roundTo: 0.05, cap });
      }
      const perkgLabel = minPk === maxPk ? `${minPk} ${units}/kg` : `${minPk}–${maxPk} ${units}/kg`;
      return { name: m.name, perkg: perkgLabel, calc, note: m.note };
    });
  }, [kg]);

  /* equipment suggestions from before */
  const lma = kg
    ? (kg < 5 ? { size: 1, range: "<5 kg" }
      : kg < 10 ? { size: 1.5, range: "5–10 kg" }
      : kg < 20 ? { size: 2, range: "10–20 kg" }
      : kg < 30 ? { size: 2.5, range: "20–30 kg" }
      : kg < 50 ? { size: 3, range: "30–50 kg" }
      : kg < 70 ? { size: 4, range: "50–70 kg" }
      : { size: 5, range: "≥70 kg" })
    : undefined;

  const circuit = kg ? (kg < 10 ? "Infant/pediatric circuit (low compliance)" : kg < 20 ? "Pediatric circuit" : "Adult circuit") : undefined;

  /* NEW derived calcs */
  const airway = useMemo(() => ettForAgeWeight(ageY, kg), [ageY, kg]);
  const miv = useMemo(() => (kg ? mIV_421(kg) : undefined), [kg]);
  const bolus = useMemo(() => bolus20(kg), [kg]);
  const shocks = useMemo(() => palsShockEnergies(kg), [kg]);
  const epi = useMemo(() => palsEpiArrest(kg), [kg]);

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-50 to-slate-100">
      {/* Top bar */}
      <header className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/70 backdrop-blur-md">
        <div className="mx-auto max-w-6xl px-4 flex items-center justify-between py-3">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-sky-700 text-white shadow-sm">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z" />
              </svg>
            </span>
            <div>
              <h1 className="text-base font-semibold tracking-tight text-slate-900">Pediatric Anesthesia Calculator</h1>
              <p className="text-xs text-slate-500">Clinical reference — verify with local guidelines</p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {/* Inputs */}
        <section className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 p-4 md:p-5">
          <div className="grid gap-5 md:grid-cols-2">
            {/* Weight */}
            <div>
              <label className="text-sm font-medium text-slate-700">Weight <span className="text-rose-600">*</span></label>
              <div className="mt-2 flex items-center gap-2">
                <input
                  value={weightValue}
                  onChange={(e) => setWeightValue(e.target.value)}
                  type="number"
                  inputMode="decimal"
                  placeholder={weightUnit === "kg" ? "kg" : "lbs"}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm placeholder:text-slate-400 focus:ring-2 focus:ring-sky-300 no-spinner"
                />
                <div className="overflow-hidden rounded-xl ring-1 ring-slate-300">
                  <button
                    className={`px-3 py-2 text-sm ${weightUnit === "kg" ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50"}`}
                    onClick={() => setWeightUnit("kg")}
                  >kg</button>
                  <button
                    className={`px-3 py-2 text-sm ${weightUnit === "lb" ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50"}`}
                    onClick={() => setWeightUnit("lb")}
                  >lbs</button>
                </div>
              </div>
              <p className="mt-1.5 text-xs text-slate-500">{kg ? formatKgLbs(kg) : "Enter weight to begin."}</p>
            </div>

            {/* Height + BMI */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-sm font-medium text-slate-700">Height (optional)</label>
                {kg && cm && (
                  <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-slate-200 bg-white text-slate-700">
                    BMI: <span className="ml-1 font-semibold">{round(bmi ?? 0, 1)}</span>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {heightUnit === "cm" ? (
                  <input
                    value={heightCmValue}
                    onChange={(e) => setHeightCmValue(e.target.value)}
                    type="number"
                    inputMode="decimal"
                    placeholder="cm"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm placeholder:text-slate-400 focus:ring-2 focus:ring-sky-300 no-spinner"
                  />
                ) : (
                  <div className="flex w-full items-center gap-2">
                    <input
                      value={heightFtValue}
                      onChange={(e) => setHeightFtValue(e.target.value)}
                      type="number"
                      inputMode="decimal"
                      placeholder="ft"
                      className="w-1/2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm placeholder:text-slate-400 focus:ring-2 focus:ring-sky-300 no-spinner"
                    />
                    <input
                      value={heightInValue}
                      onChange={(e) => setHeightInValue(e.target.value)}
                      type="number"
                      inputMode="decimal"
                      placeholder="in"
                      className="w-1/2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm placeholder:text-slate-400 focus:ring-2 focus:ring-sky-300 no-spinner"
                    />
                  </div>
                )}
                <div className="overflow-hidden rounded-xl ring-1 ring-slate-300">
                  <button
                    className={`px-3 py-2 text-sm ${heightUnit === "cm" ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50"}`}
                    onClick={() => setHeightUnit("cm")}
                  >cm</button>
                  <button
                    className={`px-3 py-2 text-sm ${heightUnit === "ftin" ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50"}`}
                    onClick={() => setHeightUnit("ftin")}
                  >ft/in</button>
                </div>
              </div>
              <p className="mt-1.5 text-xs text-slate-500">{cm ? formatCmFtIn(cm) : "Add height to see BMI."}</p>
            </div>

            {/* NEW: Age */}
            <div className="md:col-span-2">
              <label className="text-sm font-medium text-slate-700">Age (for ETT & blade sizing)</label>
              <div className="mt-2 flex items-center gap-2">
                <input
                  value={ageYearsValue}
                  onChange={(e) => setAgeYearsValue(e.target.value)}
                  type="number"
                  inputMode="decimal"
                  placeholder="years"
                  className="w-1/2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm placeholder:text-slate-400 focus:ring-2 focus:ring-sky-300 no-spinner"
                />
                <input
                  value={ageMonthsValue}
                  onChange={(e) => setAgeMonthsValue(e.target.value)}
                  type="number"
                  inputMode="decimal"
                  placeholder="months"
                  className="w-1/2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm placeholder:text-slate-400 focus:ring-2 focus:ring-sky-300 no-spinner"
                />
                {ageY !== undefined && (
                  <span className="ml-auto inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-slate-200 bg-white text-slate-700">
                    ~{round(ageY, 2)} yrs
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-xs text-slate-500">If age is unknown in infants, weight-based neonatal ETT suggestions are used.</p>
            </div>
          </div>
        </section>

        {/* Results */}
        <section className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Equipment */}
          <div className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 p-4 md:p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Equipment</h2>
              <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-slate-200 bg-slate-50 text-slate-600">Weight/age-based</span>
            </div>

            {!kg ? (
              <p className="text-sm text-slate-500">Enter weight to view equipment sizing.</p>
            ) : (
              <div className="space-y-3 text-sm">
                <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-slate-800">LMA size</div>
                      <div className="text-xs text-slate-500">Common ranges by weight</div>
                    </div>
                    <div className="text-right">
                      <div className="text-base font-semibold text-slate-900">{lma?.size}</div>
                      <div className="text-xs text-slate-500">{lma?.range}</div>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                  <div className="mb-1 font-medium text-slate-800">ETT size & depth (estimates)</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="text-slate-600">
                      <div>Cuffed ID: <span className="font-semibold text-slate-900">{airway?.cuffed ?? "—"}</span> mm</div>
                      <div>Uncuffed ID: <span className="font-semibold text-slate-900">{airway?.uncuffed ?? "—"}</span> mm</div>
                    </div>
                    <div className="text-slate-600">
                      <div>Depth (3×ID): <span className="font-semibold text-slate-900">{airway?.depthBySize ?? "—"}</span> cm</div>
                      <div>Depth (12 + age/2): <span className="font-semibold text-slate-900">{airway?.depthByAge ?? "—"}</span> cm</div>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-slate-600">
                    Blade: <span className="font-medium text-slate-900">{airway?.blade ?? "—"}</span>
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-slate-800">Breathing circuit</div>
                      <div className="text-xs text-slate-500">Suggested by weight</div>
                    </div>
                    <div className="text-right text-sm font-semibold text-slate-900">{circuit}</div>
                  </div>
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  Estimates only; device brand and anatomy vary. Confirm ETT position clinically (capnography, auscultation, CXR as indicated).
                </div>
              </div>
            )}
          </div>

          {/* Medications */}
          <div className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 p-4 md:p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Medication Doses</h2>
              {kg && <div className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-slate-200 bg-white text-slate-700">for {formatKgLbs(kg)}</div>}
            </div>
            {!kg ? (
              <p className="text-sm text-slate-500">Enter weight to view medication doses.</p>
            ) : (
              <div className="overflow-hidden rounded-xl ring-1 ring-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-slate-700">Drug</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-700">Dose/kg</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-700">Calculated</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-700">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {medRows.map((r) => (
                      <tr key={r.name} className="hover:bg-slate-50/60">
                        <td className="px-3 py-2">{r.name}</td>
                        <td className="px-3 py-2 text-slate-600">{r.perkg}</td>
                        <td className="px-3 py-2 font-semibold">{r.calc}</td>
                        <td className="px-3 py-2 text-slate-600">{r.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              Typical reference ranges; confirm with institutional guidelines & patient factors.
            </div>
          </div>
        </section>

        {/* NEW: Fluids & PALS */}
        <section className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Fluids */}
          <div className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 p-4 md:p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Fluids</h2>
              {kg && <span className="pill bg-white text-slate-700">4–2–1 rule</span>}
            </div>
            {!kg ? (
              <p className="text-sm text-slate-500">Enter weight to calculate maintenance & bolus.</p>
            ) : (
              <div className="grid gap-3 text-sm">
                <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                  <div className="font-medium text-slate-800">Maintenance (4–2–1)</div>
                  <div className="text-slate-700">
                    {round(miv ?? 0, 0)} mL/hr <span className="text-slate-500">(~{round((miv ?? 0) * 24, 0)} mL/day)</span>
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                  <div className="font-medium text-slate-800">Bolus (isotonic)</div>
                  <div className="text-slate-700">{round(bolus ?? 0, 0)} mL (20 mL/kg)</div>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  Use balanced crystalloids per local practice; reassess frequently. Neonates/CHD may require tailored strategies.
                </div>
              </div>
            )}
          </div>

          {/* PALS quick reference (arrest) */}
          <div className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 p-4 md:p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">PALS — Cardiac Arrest Quick Calcs</h2>
              {kg && <span className="pill bg-white text-slate-700">auto-calculated</span>}
            </div>
            {!kg ? (
              <p className="text-sm text-slate-500">Enter weight to see shock energies & epinephrine volume.</p>
            ) : (
              <div className="grid gap-3 text-sm">
                <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                  <div className="font-medium text-slate-800">Defibrillation energy</div>
                  <div className="text-slate-700">
                    1st: <span className="font-semibold">{round(shocks!.first, 0)} J</span> &nbsp;•&nbsp;
                    2nd: <span className="font-semibold">{round(shocks!.second, 0)} J</span> &nbsp;•&nbsp;
                    Subsequent: <span className="font-semibold">{round(shocks!.subsequentLow, 0)}–{round(shocks!.subsequentHigh, 0)} J</span>
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                  <div className="font-medium text-slate-800">Epinephrine (IV/IO, 0.1 mg/mL)</div>
                  <div className="text-slate-700">
                    {epi?.mg} mg &nbsp;= <span className="font-semibold">{epi?.mL} mL</span> (0.01 mg/kg = 0.1 mL/kg)
                  </div>
                  <div className="mt-1 text-xs text-slate-600">Repeat every 3–5 min per guidelines.</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                  Reference ranges only; follow current PALS/ACLS and local policies.
                </div>
              </div>
            )}
          </div>
        </section>

        {/* NEW: NPO cheat (static) */}
        <section className="mt-6 rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 p-4 md:p-5">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Preop Fasting (typical)</h2>
          <ul className="text-sm text-slate-700 list-disc pl-5 space-y-1">
            <li>Clear liquids: up to <span className="font-semibold">2 h</span> pre-anesthetic</li>
            <li>Breast milk: <span className="font-semibold">4 h</span></li>
            <li>Infant formula / nonhuman milk / light meal: <span className="font-semibold">6 h</span></li>
            <li>Fatty or large meal: <span className="font-semibold">8 h</span></li>
          </ul>
          <p className="mt-2 text-xs text-slate-600">Confirm with local policy; NICU/GERD/diabetes & urgent cases differ.</p>
        </section>

        <p className="mt-6 text-[11px] text-slate-500">
          Disclaimer: Educational reference. Verify doses, indications, and contraindications with current guidelines and institutional policies.
        </p>
      </main>
    </div>
  );
}
