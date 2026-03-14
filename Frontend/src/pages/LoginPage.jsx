import { LogIn } from "lucide-react";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import AuthShell from "../components/forms/AuthShell.jsx";
import Spinner from "../components/common/Spinner.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { authApi } from "../services/api.js";

const LoginPage = () => {
  const { setSession } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: "",
  });

  const onChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const email = form.email.trim();
    const password = form.password.trim();

    if (!email || !password) {
      toast.error("Email and password are required.");
      return;
    }

    try {
      setSubmitting(true);
      const response = await authApi.login({
        email,
        password,
      });
      setSession({
        token: response.token,
        user: response.user,
      });
      toast.success("Login successful");
      const redirectTo = location.state?.from || "/dashboard";
      navigate(redirectTo, { replace: true });
    } catch (error) {
      toast.error(error.message || "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Welcome Back"
      subtitle="Sign in to continue your government scheme workflow."
      footerText="New to the platform?"
      footerLink="/register"
      footerLinkLabel="Create account"
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">Email</span>
          <input
            type="email"
            name="email"
            value={form.email}
            onChange={onChange}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-blue-500 transition placeholder:text-slate-400 focus:ring-2"
            placeholder="you@example.com"
            autoComplete="email"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">Password</span>
          <input
            type="password"
            name="password"
            value={form.password}
            onChange={onChange}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-blue-500 transition placeholder:text-slate-400 focus:ring-2"
            placeholder="Enter password"
            autoComplete="current-password"
          />
        </label>

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {submitting ? (
            <Spinner label="Signing in..." size="sm" />
          ) : (
            <>
              <LogIn className="h-4 w-4" />
              Login
            </>
          )}
        </button>
      </form>
    </AuthShell>
  );
};

export default LoginPage;
