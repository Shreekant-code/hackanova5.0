import { UserPlus2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import Spinner from "../components/common/Spinner.jsx";
import AuthShell from "../components/forms/AuthShell.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { authApi } from "../services/api.js";

const RegisterPage = () => {
  const navigate = useNavigate();
  const { setSession } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const onChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const validate = () => {
    if (!form.name.trim()) {
      toast.error("Name is required.");
      return false;
    }
    if (!form.email.trim()) {
      toast.error("Email is required.");
      return false;
    }
    if (form.password.trim().length < 6) {
      toast.error("Password must be at least 6 characters.");
      return false;
    }
    if (form.password !== form.confirmPassword) {
      toast.error("Passwords do not match.");
      return false;
    }
    return true;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!validate()) return;

    try {
      setSubmitting(true);
      const response = await authApi.register({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
      });
      setSession({
        token: response.token,
        user: response.user,
      });
      toast.success("Registration successful");
      navigate("/dashboard", { replace: true });
    } catch (error) {
      toast.error(error.message || "Registration failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Create Account"
      subtitle="Register once and continue all scheme applications from one dashboard."
      footerText="Already have an account?"
      footerLink="/login"
      footerLinkLabel="Login"
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">Full Name</span>
          <input
            type="text"
            name="name"
            value={form.name}
            onChange={onChange}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-blue-500 transition placeholder:text-slate-400 focus:ring-2"
            placeholder="Test User"
            autoComplete="name"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">Email</span>
          <input
            type="email"
            name="email"
            value={form.email}
            onChange={onChange}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-blue-500 transition placeholder:text-slate-400 focus:ring-2"
            placeholder="test@example.com"
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
            placeholder="At least 6 characters"
            autoComplete="new-password"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">Confirm Password</span>
          <input
            type="password"
            name="confirmPassword"
            value={form.confirmPassword}
            onChange={onChange}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-blue-500 transition placeholder:text-slate-400 focus:ring-2"
            placeholder="Repeat password"
            autoComplete="new-password"
          />
        </label>

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {submitting ? (
            <Spinner label="Creating..." size="sm" />
          ) : (
            <>
              <UserPlus2 className="h-4 w-4" />
              Register
            </>
          )}
        </button>
      </form>
    </AuthShell>
  );
};

export default RegisterPage;
