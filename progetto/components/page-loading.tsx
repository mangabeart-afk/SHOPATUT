type PageLoadingProps = {
  variant?: 'page' | 'dashboard' | 'auth'
}

export default function PageLoading({ variant = 'page' }: PageLoadingProps) {
  if (variant === 'auth') {
    return (
      <main className="auth-shell loading-auth-shell" aria-busy="true" aria-live="polite">
        <section className="auth-card loading-auth-card" aria-label="Caricamento pagina">
          <span className="loading-auth-logo skeleton-block" />
          <span className="loading-heading skeleton-block" />
          <span className="loading-row skeleton-block" />
          <span className="loading-row skeleton-block" />
          <span className="loading-row skeleton-block" />
          <span className="loading-auth-button skeleton-block" />
          <p className="loading-message">Caricamento…</p>
        </section>
      </main>
    )
  }

  const isDashboard = variant === 'dashboard'

  return (
    <main className="shell loading-shell" aria-busy="true" aria-live="polite">
      <aside className="sidebar loading-sidebar" aria-hidden="true">
        <div className="loading-brand skeleton-block" />
        <div className="loading-nav-lines">
          {Array.from({ length: isDashboard ? 6 : 8 }, (_, index) => (
            <span className="skeleton-block" key={index} />
          ))}
        </div>
        <span className="loading-user skeleton-block" />
      </aside>
      <section className="content loading-content">
        <header className="topbar loading-topbar" aria-hidden="true">
          <div>
            <span className="loading-eyebrow skeleton-block" />
            <span className="loading-title skeleton-block" />
          </div>
          <span className="loading-action skeleton-block" />
        </header>
        {isDashboard && (
          <section className="panel loading-panel" aria-hidden="true">
            <span className="loading-heading skeleton-block" />
            <div className="loading-details-grid">
              <span className="skeleton-block" /><span className="skeleton-block" />
              <span className="skeleton-block" /><span className="skeleton-block" />
            </div>
          </section>
        )}
        <section className="panel loading-panel" aria-hidden="true">
          <span className="loading-heading skeleton-block" />
          <div className="loading-stat-grid">
            {Array.from({ length: isDashboard ? 3 : 4 }, (_, index) => (
              <span className="skeleton-block" key={index} />
            ))}
          </div>
        </section>
        {isDashboard ? (
          <section className="panel loading-panel" aria-hidden="true">
            <span className="loading-heading skeleton-block" />
            <div className="loading-photo-grid">
              {Array.from({ length: 5 }, (_, index) => <span className="skeleton-block" key={index} />)}
            </div>
          </section>
        ) : (
          <section className="panel loading-panel" aria-hidden="true">
            <span className="loading-heading skeleton-block" />
            <span className="loading-row skeleton-block" />
            <span className="loading-row skeleton-block" />
            <span className="loading-row skeleton-block" />
            <span className="loading-row skeleton-block" />
          </section>
        )}
        {isDashboard && (
          <section className="panel loading-panel" aria-hidden="true">
            <span className="loading-heading skeleton-block" />
            <span className="loading-row skeleton-block" />
            <span className="loading-row skeleton-block" />
            <span className="loading-row skeleton-block" />
          </section>
        )}
        <p className="loading-message">Caricamento dati…</p>
      </section>
    </main>
  )
}
