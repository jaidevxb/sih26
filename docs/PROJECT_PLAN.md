# SIH 2026 — PS 26061: AI-Driven Smart Energy Management for Polar Research Stations

## Context

**Problem Statement 26061** (MoES / NCPOR, Software, Clean & Green Technology) asks for an AI system doing
load forecasting, renewable integration, and fuel optimisation for polar research stations under extreme
conditions. The PS text is deliberately thin, so the framing is ours to choose — and the framing decides
whether we win.

**The framing we're committing to:** NCPOR's stations (Maitri, Bharati in Antarctica; Himadri in the Arctic)
are electrical islands resupplied with diesel **once a year by ship**. That one fact dominates everything.
Fuel is not a cost line — it is the survival margin. So our system is not a "green dashboard"; it is a
**fuel-survival optimizer** that makes the annual fuel last longer, with a days-of-autonomy countdown as the
hero metric.

**The technical insight we build the pitch on:** a diesel genset at 25 % load burns roughly 1.5–2× more fuel
per kWh than at 75 %, and below ~30 % it wet-stacks and damages itself. But you cannot just switch it off,
because its **waste heat** is what heats the buildings and melts snow for water. Electricity and heat are
**coupled** — optimise them separately and you get the wrong answer. Co-optimising them is the core of our
solution and the thing competing teams will miss.

**Current state:** empty repo. Team is EEE, AI-assisted coding, targeting the **internal college hackathon +
SIH idea PPT** first, with the build structured so it extends to the December Grand Finale without rework.

**Decisions already locked:** station modelled = **Bharati** (year-round crew, modern, best documented);
centrepiece = fuel-survival optimizer; engine = rule-based + MILP hybrid; hardware-in-the-loop = optional
stretch goal only. SPOC has approved the project; internal-hackathon dates pending.

---

## Product name — team to choose

- **HIMSHAKTI** (हिम = snow, शक्ति = power) — the energy framing.
- **KAVACH** (कवच = armour / shield) — the protection framing.

---

## Why the optimizer, and not the other three options

We had four candidate centrepieces. This section explains the call, because the whole build plan follows
from it.

**Important:** this is a decision about *what leads the pitch and where the depth goes* — not about what we
cut. Forecasting and blizzard-response are both still built. They just aren't the headline.

**Why not forecasting as the centrepiece?**
A forecast answers *"what will happen."* It never answers *"so what do we do about it."* The first question
any judge asks is "and then?" — and if the answer is a chart, we've lost. Worse, forecasting is the
*commodity* choice: most teams who pick this PS will build exactly this, which puts us in a comparison on
MAPE — a number NCPOR does not care about. And we get forecasting anyway, as Layer 2. We just don't lead
with it.

**Why not blizzard / crisis resilience?**
Dramatic, but narrow. A blizzard is an edge case lasting a few days a year; NCPOR's actual problem is 365
days of fuel discipline. It's also hard to quantify — *"the crew survived"* is not a number that fits on a
slide, and unquantified claims lose to measured ones. In our design this is a **scenario button**, not a
product. We still get the drama on stage; we just don't build the company around it.

**Why not all of them, equally weighted?**
This is the classic way strong teams lose. A SIH pitch is a few minutes long — split evenly across four
capabilities, each gets roughly a minute, and nothing is memorable. Judges retain **one number**. Equal
weighting also splits our build time into four mediocre modules instead of one excellent one with three
solid supports, and against domain experts depth beats breadth every time.

**Why the fuel-survival optimizer wins:**
1. It is the only option producing a **single defensible number tied to the mission** — extra days of
   autonomy. Everything else produces charts.
2. It is where **EEE knowledge is a moat**. Genset efficiency curves, minimum stable load, N-1 reserve,
   waste-heat coupling — a CS-heavy team cannot easily reach this, and judges from MoES will recognise it.
3. It addresses the PS's own third clause — *"fuel optimization"* — which is also NCPOR's real operational
   pain, given one resupply ship a year.
4. **It subsumes the others.** Forecasting becomes its input; blizzard response becomes a scenario it
   handles. Choosing it loses us nothing and focuses everything.

---

## Architecture — five layers

```
[L1 PolarSim]  physics-based digital twin  →  synthetic year of station data
      ↓
[L2 Forecast]  24–72 h ahead: elec load, heat load, solar, wind
      ↓
[L3 Optimizer] MILP rolling-horizon dispatch  (+ rule-based fallback)   ← THE HERO
      ↓
[L4 Fuel Ledger] annual budget, days-of-autonomy, stockout risk
      ↓
[L5 Dashboard] live sim + scenario playground + baseline-vs-AI comparison
```

### L1 — PolarSim (the digital twin)

**Why it exists:** there is no public NCPOR energy dataset. Nobody at SIH will have real telemetry. So we
write a physics-grounded simulator, calibrate it against published Antarctic station energy studies, and
state this openly in the PPT as a methodology choice — not an apology. It also lets us demo a blizzard on
stage, which real data never would.

Generates 1 year at 15-min resolution:
- **Weather model** — temperature, windspeed, solar elevation with true polar-night/midnight-sun cycles for
  the chosen latitude. Blizzard events as correlated wind/temperature excursions.
- **Building thermal model** — heat loss `Q = U·A·ΔT` plus ventilation and infiltration; snow-melt water
  demand as a function of crew size.
- **Occupancy calendar** — summer campaign (~50–60 crew) vs winter-over (~20–25). Biggest single load driver.
- **Load library** — each load tagged `critical` / `deferrable` / `sheddable`, with a power profile and, for
  deferrables, a completion deadline.
- **Asset models** — 2–3 gensets with fuel-consumption curves (litres/h vs load factor, non-linear), waste-heat
  recovery efficiency, a backup boiler, a cold-derated battery, PV array with snow-cover soiling, wind turbine
  with cut-in/cut-out and an icing lockout.
- **Event injection API** — `blizzard(days)`, `genset_failure(id)`, `resupply_delay(days)`, `crew_surge(n)`.

### L2 — Forecast

- Targets: electrical load, thermal load, PV availability, wind availability. Horizon 72 h, hourly.
- Model: gradient boosting (LightGBM) on lag features + rolling stats + weather + occupancy + calendar.
  Small, fast, trains in seconds, runs on station hardware with no GPU — say that, it's a credibility point.
- **Always report against a naive baseline** (persistence / seasonal-naive). The lift is the story, not the
  absolute number.
- Emit **P10/P50/P90** quantiles, not a point forecast — the optimizer needs the uncertainty to size reserve.

### L3 — Optimizer (build this before the forecaster)

Rolling-horizon MILP, 48 h lookahead, 1 h steps, re-solved every step. OR-Tools CP-SAT or PuLP/CBC.

- **Decision variables:** genset on/off (binary) and loading per unit; battery charge/discharge; deferrable
  load start times; boiler firing; renewable curtailment.
- **Objective:** minimise total litres burned, plus penalties for genset starts (wear), unmet thermal comfort,
  and unserved critical load (effectively infinite).
- **Constraints that carry the whole pitch:**
  - electrical power balance
  - **thermal balance including recovered waste heat** ← the coupling; this is our differentiator
  - genset minimum stable load (anti wet-stacking) and min up/down times
  - battery SoC limits with **cold-temperature capacity derating**
  - deferrable loads must complete inside their window
  - **N-1 spinning reserve** — survive the largest genset tripping
- **Rule-based fallback:** a deterministic priority-order dispatcher that always returns a feasible answer.
  If the solver stalls on stage, the demo continues and we explain the safety architecture. This is not a
  hack — a life-safety system genuinely needs a deterministic fallback, so present it as a design virtue.
- **Baseline strategy** for comparison: "always-on largest genset, no load shifting" — what stations
  realistically do today. Every saving we claim is measured against this.

### L4 — Fuel Ledger

- Annual fuel budget vs actual burn, as a burndown chart against the next resupply date.
- **Days-of-autonomy** at current burn rate — the hero number on screen.
- Monte Carlo over weather and occupancy uncertainty → **probability of stockout before resupply**.
- What-if: "ship delayed 21 days — do we survive?" Answer with a number, in front of the judges.

### L5 — Dashboard

- **Hero panel:** days-of-autonomy gauge + fuel burndown, AI curve vs baseline curve diverging over the year.
- Live simulation clock (accelerated), stacked dispatch chart (genset / PV / wind / battery), forecast-vs-actual.
- **Scenario buttons:** Blizzard · Genset Failure · Resupply Delayed · Crew Surge. One click, visible response.
- **Money slide, on screen:** litres saved, % reduction, **extra days of autonomy gained**, CO₂ avoided.

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Core | Python 3.11 | simulator, ML, optimizer in one language |
| Optimizer | OR-Tools CP-SAT (fallback PuLP/CBC) | fast, free, no licence |
| ML | LightGBM + pandas/numpy | CPU-only, seconds to train |
| API | FastAPI + WebSocket | streams live sim ticks to the UI |
| Frontend | React + Vite + Recharts + Tailwind | fast to build, looks finished |
| Storage | SQLite / Parquet | zero-config, offline-first |

**Offline-first is a required talking point.** Stations have thin, expensive satellite links. Everything runs
on-prem on modest hardware, no cloud dependency, no GPU. Say this explicitly — judges from MoES will care.

---

## Build phases

**Phase 0 — Foundation (½ day)**
Repo scaffold, config schema for station profiles (Bharati / Maitri / Himadri), shared data model for a
timestep record.

**Phase 1 — PolarSim (1½ days)**
Weather, thermal, occupancy, load library, asset models, event injection. Ship a generated year as Parquet
plus plots that look physically plausible. *Gate: the annual profile must be defensible to an EEE professor.*

**Phase 2 — Optimizer + baseline (2 days) ← highest value, do it early**
Rule-based dispatcher first, then the MILP, then the baseline strategy, then the comparison harness.
Initially run with **perfect foresight** (feed it the simulator's true future) so it can be built and
validated before the forecaster exists. *Gate: MILP beats baseline on fuel by a clear, reproducible margin.*

**Phase 3 — Forecast (1 day)**
Train the models, swap them in behind the same interface that perfect-foresight used. Measure how much of the
saving survives real forecast error — **report that honestly**, it's a sign of rigour and judges probe for it.

**Phase 4 — Dashboard (2 days)**
Hero panel first, then dispatch charts, then scenario buttons. Do not start the UI until Phase 2 produces
numbers worth displaying.

**Phase 5 — Pitch (1 day)**
PPT in SIH's format, a rehearsed 3-minute demo script, and a recorded fallback video in case the laptop or
venue Wi-Fi fails.

**Stretch (finale only, not internals):** ESP32 + current sensors + relays driving a lamp/heater as a physical
micro-grid, with our controller commanding it. Powerful for an EEE team — but only after the software is
locked.

---

## Idea PPT — section map

1. **Problem** — one year of fuel, one ship, no second chance. Lead with the constraint, not the technology.
2. **Solution** — the five layers, one diagram.
3. **Differentiator** — heat/electricity coupling and genset low-load inefficiency. State plainly that
   electrical-only optimisation is wrong, and why.
4. **Technical approach** — stack, MILP formulation sketch, forecast lift over baseline.
5. **Feasibility** — offline, CPU-only, retrofits onto existing meters; deterministic fallback for life safety.
6. **Impact** — litres saved → days of autonomy → reduced resupply risk → CO₂ and black-carbon reduction in a
   protected environment (Antarctic Treaty / Madrid Protocol framing).
7. **Research** — cite published Antarctic station energy studies, NCPOR expedition reports, Maitri II's
   stated green-station goal. Show the simulator is calibrated, not invented.

---

## Verification

- **Physical sanity:** annual energy per capita and fuel burn land inside the range published for comparable
  Antarctic stations. If the simulator says a 25-person station burns 20 litres a day, it's wrong.
- **Energy balance:** at every timestep, generation + discharge = load + charge + losses, within tolerance.
  Assert it in a test — a violated balance invalidates every saving we claim.
- **Optimizer correctness:** on a small hand-checkable instance, MILP output matches a manually computed
  optimum. Confirm genset minimum-load and N-1 reserve constraints are never violated across a full year.
- **Saving is real:** same simulated year, same weather seed, baseline vs AI — report litres and days gained.
  Re-run across ≥10 random seeds so the headline number isn't a lucky draw.
- **Forecast honesty:** MAPE against persistence baseline, and the saving measured under real forecast error,
  not perfect foresight.
- **Demo resilience:** full run-through offline with Wi-Fi disabled; kill the solver mid-demo and confirm the
  rule-based fallback takes over visibly.

---

## Open items for the team

- **Product name** — HIMSHAKTI or KAVACH.
- **Internal-hackathon date** from the SPOC, so Phases 4–5 can be scheduled backwards from it.
