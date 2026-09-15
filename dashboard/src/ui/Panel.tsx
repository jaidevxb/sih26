import type { ReactNode } from 'react'

export function Panel({
  title,
  note,
  right,
  children,
  bodyClass = '',
}: {
  title: string
  note?: string
  right?: ReactNode
  children: ReactNode
  bodyClass?: string
}) {
  return (
    <section className="panel">
      <header className="panel-head">
        <h2 className="panel-title">{title}</h2>
        {right ?? (note ? <span className="panel-note">{note}</span> : null)}
      </header>
      <div className={`panel-body ${bodyClass}`}>{children}</div>
    </section>
  )
}
