const SectionCard = ({ title, subtitle = "", children, action = null, className = "" }) => (
  <section
    className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/70 ${className}`}
  >
    <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
      </div>
      {action}
    </header>
    {children}
  </section>
);

export default SectionCard;
