import { useEffect, useMemo, useRef, useState } from 'react'
import { Moon, RotateCcw, Sun } from 'lucide-react'
import { DAY0, DEFAULTS, PLANT, type Inputs } from './sim/model'
import { computeDashboard, fmt } from './sim/derive'
import { SCENARIOS, clearScenario, type ScenarioId } from './sim/scenarios'
import { PALETTES, STATUS_COLOR, type Mode } from './ui/theme'
import { Panel } from './ui/Panel'
import { KpiTile } from './ui/KpiTile'
import { ControlPanel } from './ui/ControlPanel'
import { BurndownChart, DispatchChart, ForecastChart, Legend } from './ui/charts'

/** 1 real second = 4 simulated minutes. */
const CLOCK_STEP_MIN = 4

type RowState = 'open' | 'accepted' | 'overridden'

export default function App() {
  const [mode, setMode] = useState<Mode>('light')
  const [inputs, setInputs] = useState<Inputs>(DEFAULTS)
  const [scenario, setScenario] = useState<ScenarioId | null>(null)
  const [rows, setRows] = useState<Record<string, RowState>>({})
  const [clock, setClock] = useState(() => new Date(DAY0.getTime()))

  /** Slider values as the operator set them, before any scenario was applied. */
  const baseInputs = useRef<Inputs>(DEFAULTS)

  useEffect(() => {
    document.documentElement.dataset.theme = mode
  }, [mode])

  useEffect(() => {
    const t = setInterval(() => {
      setClock((c) => new Date(c.getTime() + CLOCK_STEP_MIN * 60_000))
    }, 1000)
    return () => clearInterval(t)
  }, [])

  const dash = useMemo(() => computeDashboard(inputs), [inputs])
  const p = PALETTES[mode]

  // The plan is anchored to midnight of the first simulated day; the clock just
  // moves a marker along it.
  const planStart = new Date(DAY0.getFullYear(), DAY0.getMonth(), DAY0.getDate())
  const hourIndex = Math.floor((clock.getTime() - planStart.getTime()) / 3_600_000)
  const nowIndex = Math.min(dash.plan.length - 1, Math.max(0, hourIndex))
  const currentLoad = dash.plan[nowIndex]?.load_kW ?? 0

  function patch(next: Partial<Inputs>) {
    setInputs((prev) => {
      const merged = { ...prev, ...next }
      baseInputs.current = { ...baseInputs.current, ...next }
      return merged
    })
  }

  function toggleScenario(id: ScenarioId) {
    if (scenario === id) {
      setScenario(null)
      setInputs(clearScenario(baseInputs.current))
      return
    }
    const s = SCENARIOS.find((x) => x.id === id)!
    setScenario(id)
    setInputs(s.apply(clearScenario(baseInputs.current)))
  }

  function resetAll() {
    baseInputs.current = DEFAULTS
    setInputs(DEFAULTS)
    setScenario(null)
    setRows({})
  }

  const active = SCENARIOS.find((s) => s.id === scenario)
  const statusColor = STATUS_COLOR[dash.status.level]
  const k = dash.kpis
  const gained = k.daysAutonomy - k.daysAutonomyBaseline

  return (
    <div className="page">
      {/* ------------------------------------------------------------ top bar */}
      <header className="topbar">
        <span className="brand">HIMSHAKTI</span>
        <span className="station">
          {PLANT.station} — {PLANT.latitude} {PLANT.longitude}
        </span>
        <span className="mono clock">
          {clock.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
          {'  '}
          {clock.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
        </span>
        <button
          type="button"
          className="btn"
          onClick={() => setMode(mode === 'light' ? 'dark' : 'light')}
          title="Toggle display mode"
        >
          {mode === 'light' ? <Moon size={12} /> : <Sun size={12} />}
        </button>
        <button type="button" className="btn" onClick={resetAll}>
          <RotateCcw size={11} style={{ marginRight: 4, verticalAlign: -1 }} />
          Reset
        </button>
        <span className="pill" style={{ background: statusColor }} title={dash.status.message}>
          <span className="dot" />
          {dash.status.label}
        </span>
      </header>

      {/* --------------------------------------------------------- kpi row 1 */}
      <div className="row-kpi">
        <KpiTile
          hero
          label="Days of fuel left"
          value={String(k.daysAutonomy)}
          unit="days"
          bg="#0B2E5C"
          sub={
            <>
              Station's current practice lasts {k.daysAutonomyBaseline} days.{' '}
              <strong>
                Our plan adds {gained >= 0 ? gained : 0} day{Math.abs(gained) === 1 ? '' : 's'}.
              </strong>
            </>
          }
        />
        <KpiTile
          label="Fuel in the tank"
          value={fmt.litres(k.fuelRemaining_L)}
          unit="L"
          bg="#1B2836"
          bar={k.tankFrac}
          sub={<>{(k.tankFrac * 100).toFixed(0)} % of one year's delivery</>}
        />
        <KpiTile
          label="Power needed now"
          value={fmt.kW(currentLoad)}
          unit="kW"
          bg="#2E6B4F"
          sub={<>Highest today {fmt.kW(k.peakToday_kW)} kW</>}
        />
        <KpiTile
          label="Fuel saved so far"
          value={fmt.litres(Math.abs(k.fuelSavedYtd_L))}
          unit="L"
          bg={k.fuelSavedYtd_L >= 0 ? '#1E6FB8' : '#C0392B'}
          sub={<>{fmt.pct1(k.savedPct)} % vs current practice</>}
        />
      </div>

      {/* ------------------------------------------------ row 2: plan + control */}
      <div className="row-main">
        <Panel
          title="Next 48 hours — where the power comes from"
          right={
            <Legend
              items={[
                { name: 'Genset 1', color: p.g1 },
                { name: 'Genset 2', color: p.g2 },
                { name: 'Wind', color: p.wind },
                { name: 'Solar', color: p.solar },
                { name: 'Battery', color: p.battery },
                { name: 'Total load', color: p.load, dashed: true },
              ]}
            />
          }
          bodyClass="chart"
        >
          <DispatchChart plan={dash.plan} windows={dash.shiftWindows} p={p} nowIndex={nowIndex} />
        </Panel>

        <div className="side">
          <div className="scenarios">
            {SCENARIOS.map((s) => (
              <button
                key={s.id}
                type="button"
                className="btn"
                aria-pressed={scenario === s.id}
                onClick={() => toggleScenario(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>
          {active && (
            <div
              className={`banner ${dash.status.level === 'alarm' ? 'banner-alarm' : 'banner-caution'}`}
            >
              <span>{active.response}</span>
            </div>
          )}
          <Panel
            title="Try it — move any slider"
            note={scenario ? 'scenario on' : 'live'}
            bodyClass="p-0 scroll"
          >
            <ControlPanel inputs={inputs} onChange={patch} />
          </Panel>
        </div>
      </div>

      {/* --------------------------------------- row 3: burndown + forecast */}
      <div className="row-charts">
        <Panel
          title="Fuel left over the year — will it reach the ship?"
          right={
            <Legend
              items={[
                { name: 'Our plan', color: p.optimised },
                { name: 'Current practice', color: p.baseline },
              ]}
            />
          }
          bodyClass="chart"
        >
          <BurndownChart data={dash.burndown} resupplyDay={dash.resupplyDay} p={p} />
        </Panel>
        <Panel
          title="What's coming — next 72 hours"
          right={
            <Legend
              items={[
                { name: 'Power needed', color: p.optimised },
                { name: 'Likely range', color: p.band },
                { name: 'Heat needed', color: p.heat, dashed: true },
              ]}
            />
          }
          bodyClass="chart"
        >
          <ForecastChart data={dash.forecast} p={p} />
        </Panel>
      </div>

      {/* ------------------------------------------ row 4: recommendations */}
      <Panel
        title="What the system recommends right now"
        note={dash.status.message}
        bodyClass="p-0 scroll"
      >
        <table className="grid">
          <thead>
            <tr>
              <th style={{ width: 70 }}>Time</th>
              <th style={{ width: 260 }}>Do this</th>
              <th>Because</th>
              <th style={{ width: 90, textAlign: 'right' }}>Fuel saved</th>
              <th style={{ width: 140 }} />
            </tr>
          </thead>
          <tbody>
            {dash.recommendations.map((r) => {
              const state = rows[r.id] ?? 'open'
              return (
                <tr key={r.id} data-state={state}>
                  <td className="mono">{r.time}</td>
                  <td>{r.action}</td>
                  <td style={{ color: 'var(--fg-muted)' }}>{r.reason}</td>
                  <td className="mono" style={{ textAlign: 'right', fontWeight: 600 }}>
                    {fmt.litresSmall(r.fuelSaved_L)} L
                  </td>
                  <td>
                    <span style={{ display: 'flex', gap: 4 }}>
                      <button
                        type="button"
                        className="btn btn-sm btn-accept"
                        aria-pressed={state === 'accepted'}
                        onClick={() =>
                          setRows((s) => ({
                            ...s,
                            [r.id]: state === 'accepted' ? 'open' : 'accepted',
                          }))
                        }
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-override"
                        aria-pressed={state === 'overridden'}
                        onClick={() =>
                          setRows((s) => ({
                            ...s,
                            [r.id]: state === 'overridden' ? 'open' : 'overridden',
                          }))
                        }
                      >
                        Override
                      </button>
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Panel>
    </div>
  )
}
