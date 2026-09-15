import type { ReactNode } from 'react'

export function KpiTile({
  label,
  value,
  unit,
  sub,
  bg,
  bar,
}: {
  label: string
  value: string
  unit?: string
  sub: ReactNode
  bg: string
  /** 0–1; renders the thin fill bar instead of a sub-line above the caption. */
  bar?: number
}) {
  return (
    <div className="kpi" style={{ background: bg }}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">
        {value}
        {unit ? <span className="kpi-unit">{unit}</span> : null}
      </div>
      {bar !== undefined ? (
        <div className="kpi-bar" role="presentation">
          <span style={{ width: `${Math.max(0, Math.min(1, bar)) * 100}%` }} />
        </div>
      ) : null}
      <div className="kpi-sub">{sub}</div>
    </div>
  )
}
