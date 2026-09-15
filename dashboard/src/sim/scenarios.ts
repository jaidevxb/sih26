import { DEFAULTS, PLANT, type Inputs } from './model'

export type ScenarioId = 'blizzard' | 'gensetFailure' | 'shipDelay' | 'crewSurge'

export interface Scenario {
  id: ScenarioId
  label: string
  /** What the event does to the station. */
  apply: (base: Inputs) => Inputs
  /** One line on what the dispatcher did about it. Shown under the buttons. */
  response: string
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'blizzard',
    label: 'BLIZZARD 5 D',
    apply: (b) => ({
      ...b,
      outsideTemp_C: -38,
      windSpeed_ms: 29,
      solar_pct: 1,
      stormDays: 5,
      calm: {
        temp_C: DEFAULTS.outsideTemp_C,
        wind_ms: DEFAULTS.windSpeed_ms,
        solar_pct: DEFAULTS.solar_pct,
      },
    }),
    response:
      'Wind farm locked out above the 25 m/s cut-out and heat demand up to ~135 kW: the plan holds a set online through the storm, suspends nothing critical, and lets the boiler carry the thermal peak.',
  },
  {
    id: 'gensetFailure',
    label: 'GENSET 1 FAILURE',
    apply: (b) => ({ ...b, gensetsAvailable: 1 }),
    response:
      'One set left. It is held online continuously — no shutdown-on-battery — and the pack is kept at a raised state of charge as the only contingency cover. Fuel burn barely moves; the exposure is what changed.',
  },
  {
    id: 'shipDelay',
    label: 'SHIP DELAYED 21 D',
    apply: (b) => ({
      ...b,
      daysToResupply: Math.min(365, b.daysToResupply + 21),
    }),
    response:
      'Resupply pushed out 21 days. Days-of-autonomy is unchanged — the fuel on hand is what it is — so the question is whether the margin still covers the longer wait.',
  },
  {
    id: 'crewSurge',
    label: 'CREW SURGE',
    apply: (b) => ({
      ...b,
      crew: 52,
      outsideTemp_C: -9,
      solar_pct: 62,
    }),
    response:
      'Summer campaign: 52 on station, milder air and real solar. Base and deferrable load both rise, so the plan runs the sets harder and leans on the longer daylight window for the shiftable block.',
  },
]

export const SCENARIO_BY_ID = Object.fromEntries(
  SCENARIOS.map((s) => [s.id, s]),
) as Record<ScenarioId, Scenario>

/** Clears any scenario state without touching the operator's slider settings. */
export function clearScenario(inp: Inputs): Inputs {
  return {
    ...inp,
    gensetsAvailable: PLANT.gensetCount,
    stormDays: 0,
    calm: null,
  }
}
