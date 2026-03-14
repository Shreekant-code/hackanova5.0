import {
  CheckCircle2,
  FileText,
  Home,
  LogOut,
  Menu,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: Home },
  { to: "/schemes", label: "Schemes", icon: FileText },
  { to: "/documents", label: "Documents", icon: Upload },
];

const navLinkClass = ({ isActive }) =>
  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
    isActive
      ? "bg-blue-50 text-blue-700 ring-1 ring-blue-100"
      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
  }`;

const AppLayout = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-slate-50/80">
      <button
        type="button"
        onClick={() => setMenuOpen(true)}
        className="fixed left-4 top-4 z-20 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm md:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      <aside
        className={`fixed inset-y-0 left-0 z-30 w-72 border-r border-slate-200 bg-white px-4 py-6 transition-transform duration-200 ${
          menuOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0`}
      >
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600">
              Gov Assist
            </p>
            <h1 className="mt-1 text-lg font-bold text-slate-900">Automation Portal</h1>
          </div>
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 md:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={navLinkClass}
                onClick={() => setMenuOpen(false)}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="mt-10 rounded-xl border border-slate-200 bg-white p-3">
          <div className="mb-3 flex items-center gap-2 text-slate-700">
            <UserRound className="h-4 w-4" />
            <p className="text-sm font-medium">{user?.name || "User"}</p>
          </div>
          <p className="text-xs text-slate-500">{user?.email || "No email available"}</p>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>

        <div className="mt-6 rounded-xl bg-blue-50 p-3 text-xs text-blue-700">
          <p className="flex items-center gap-1 font-medium">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Safe Mode
          </p>
          <p className="mt-1 leading-relaxed">
            Captcha and authentication bypass are disabled. Manual review happens before any submit.
          </p>
        </div>
      </aside>

      <main className="min-h-screen px-4 pb-8 pt-16 md:ml-72 md:px-8 md:pt-8">
        <Outlet />
      </main>
    </div>
  );
};

export default AppLayout;
