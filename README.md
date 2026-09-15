# HIMSHAKTI

Energy management dashboard for **Bharati**, India's Antarctic research station
(69°24'S). SIH 2026, problem statement 26061.

Everything runs in the browser on a simulated station. No backend, no database.

```bash
cd dashboard
npm install
npm run dev
```

---

## The problem in one line

Diesel arrives **once a year by ship**. So fuel is not a cost — it is the
survival margin. The dashboard measures everything in **days of autonomy**.

## The idea in one line

A diesel genset's waste heat is what heats the buildings and melts snow for
water. So **you cannot optimise electricity on its own** — switch a genset off to
save fuel and you force the boiler on. Our dispatcher costs both together.

## How the dispatcher works — 8 rules

Every hour, for 365 days:

1. Wind and solar serve the load first.
2. Any surplus charges the battery.
3. Surplus still left goes to electric heating rather than being spilled.
4. If the battery can cover what's missing, the gensets stay off.
5. Otherwise run a genset — never below its minimum stable load.
6. **N-1:** one genset alone is only allowed if the battery could instantly
   replace it. Otherwise a second one shares the load.
7. Genset waste heat covers the heating load; the boiler makes up the rest.
8. Restarting a genset costs fuel, so the plan doesn't cycle them all day.

**Baseline** (what stations do today) is deliberately dumb: the lead genset never
stops, sits at a fixed 75 % load, there's no battery and no load shifting, and
surplus wind is spilled.

All of it is in one file: [`dashboard/src/sim/model.ts`](dashboard/src/sim/model.ts).

## The physics

```
heat demand    = 2.4 × (18 − outside °C)          kW
base load      = 22 + crew × 0.9                  kW
wind           = 0.9 × v²  (0 below 3 or above 25 m/s), capped at 18 kW
genset fuel    = 0.08 × 90 + 0.21 × output        L/h   ← low load is worse per kWh
boiler fuel    = heat ÷ 8.5                       L/h
waste heat     = 0.55 × genset output             kW
days autonomy  = fuel on hand ÷ daily burn
```

## What the numbers say

At the default settings — 25 crew, −28 °C, 12 m/s wind, 210 days to the ship:

| | Optimised | Baseline |
|---|---|---|
| Days of autonomy | **201** | 179 |
| Daily burn | 629 L | 718 L |
| Fuel saved | **9.4 %** | — |

The tank holds 215,000 L, which is about one year of *optimised* burn. At the
baseline rate that same fuel does not reach the next ship. That is the pitch.

## Things worth knowing before a viva

- **Every slider recomputes the whole year** — two 365-day simulations plus a
  72 h plan, about 40 ms. Nothing is pre-baked.
- **Lower minimum stable load, bigger battery, and N-1 off all increase
  autonomy**, because the model says so, not because it was hard-coded.
- **The baseline is not N-1 compliant.** One genset with no battery behind it
  cannot survive losing that genset. So the optimised plan isn't only cheaper —
  it's the only one that meets the reserve rule. Worth saying out loud.
- **With a small battery the optimiser can burn *more* than the baseline.** That
  is real: holding N-1 without storage means running a second genset. The status
  pill says so when it happens. It's an argument for the battery, not a bug.
- **Genset failure barely changes fuel burn.** One set running continuously
  burns about what two cycling sets do. What changes is exposure, so that
  scenario turns the pill amber.

## Deploying

Netlify config is in [`netlify.toml`](netlify.toml) — base `dashboard`, build
`npm run build`, publish `dashboard/dist`.

## Stack

React + Vite + TypeScript, Recharts for the charts, Tailwind for layout, lucide
for icons. No UI kit, no component library.
