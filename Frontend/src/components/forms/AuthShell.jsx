import { Link } from "react-router-dom";

const AuthShell = ({ title, subtitle, children, footerText, footerLink, footerLinkLabel }) => (
  <div className="relative min-h-screen overflow-hidden bg-slate-50 px-4 py-10">
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(37,99,235,0.14),_transparent_45%)]" />
    <div className="relative mx-auto w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-lg shadow-slate-200/70">
      <div className="mb-7">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600">Gov Assist</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm text-slate-500">{subtitle}</p>
      </div>

      {children}

      <p className="mt-6 text-center text-sm text-slate-600">
        {footerText}{" "}
        <Link className="font-semibold text-blue-600 hover:text-blue-700" to={footerLink}>
          {footerLinkLabel}
        </Link>
      </p>
    </div>
  </div>
);

export default AuthShell;
