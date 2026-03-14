import { UserPlus2, ShieldCheck, Dna, Lock, Cpu, ArrowLeft, Fingerprint, Sparkles } from "lucide-react";
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "react-toastify";
import Spinner from "../components/common/Spinner.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { authApi } from "../services/api.js";

const RegisterPage = () => {
  const navigate = useNavigate();
  const { setSession } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const onChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const validate = () => {
    if (!form.name.trim()) {
      toast.error("Legal Name is required for identity mapping.");
      return false;
    }
    if (!form.email.trim()) {
      toast.error("Communication endpoint (Email) is required.");
      return false;
    }
    if (form.password.trim().length < 6) {
      toast.error("Security token must be at least 6 characters.");
      return false;
    }
    if (form.password !== form.confirmPassword) {
      toast.error("Security token mismatch.");
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
      toast.success("Identity Initialized successfully.");
      navigate("/dashboard", { replace: true });
    } catch (error) {
      toast.error(error.message || "Protocol Initialization Failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center overflow-hidden bg-white selection:bg-indigo-600 selection:text-white py-20">
      
      {/* --- Aesthetic Background (Matches Login/Home) --- */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-[-10%] right-[-10%] h-[600px] w-[600px] rounded-full bg-blue-50/50 blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] left-[-10%] h-[600px] w-[600px] rounded-full bg-indigo-50/50 blur-[120px]" />
        <svg className="absolute inset-0 h-full w-full opacity-[0.03]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      {/* --- Navigation --- */}
      <Link 
        to="/" 
        className="fixed top-8 left-8 z-50 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-black transition-all"
      >
        <ArrowLeft className="h-4 w-4" /> Return to Root
      </Link>

      {/* --- Registration Identity Card --- */}
      <div className="relative z-10 w-full max-w-xl px-6">
        <div className="group relative rounded-[2.5rem] border border-slate-100 bg-white/80 p-10 shadow-[0_50px_100px_-20px_rgba(0,0,0,0.08)] backdrop-blur-2xl transition-all hover:shadow-[0_50px_100px_-20px_rgba(79,70,229,0.1)]">
          
          {/* Header */}
          <div className="text-center mb-10">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-black text-white shadow-xl shadow-slate-200 group-hover:bg-indigo-600 transition-colors duration-500">
              <Dna className="h-8 w-8 animate-pulse" />
            </div>
            <h1 className="text-3xl font-[1000] uppercase tracking-tighter text-slate-900">
              Initialize <span className="text-indigo-600 italic">Identity.</span>
            </h1>
            <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.3em] text-slate-400">
              Create your global citizen profile
            </p>
          </div>

          <form className="grid grid-cols-1 md:grid-cols-2 gap-6" onSubmit={handleSubmit}>
            {/* Name Field */}
            <div className="space-y-2 md:col-span-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex justify-between">
                Legal Entity Name
                <Sparkles className="h-3 w-3 text-indigo-400" />
              </label>
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={onChange}
                required
                className="w-full rounded-2xl border border-slate-100 bg-slate-50/50 px-5 py-4 text-sm font-semibold outline-none transition-all focus:border-indigo-600 focus:bg-white focus:ring-4 focus:ring-indigo-50"
                placeholder="Ex: Johnathan Doe"
              />
            </div>

            {/* Email Field */}
            <div className="space-y-2 md:col-span-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex justify-between">
                Communication Endpoint
                <Cpu className="h-3 w-3 text-indigo-400" />
              </label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={onChange}
                required
                className="w-full rounded-2xl border border-slate-100 bg-slate-50/50 px-5 py-4 text-sm font-semibold outline-none transition-all focus:border-indigo-600 focus:bg-white focus:ring-4 focus:ring-indigo-50"
                placeholder="identity@network.gov"
              />
            </div>

            {/* Password Field */}
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex justify-between">
                Security Token
                <Lock className="h-3 w-3 text-indigo-400" />
              </label>
              <input
                type="password"
                name="password"
                value={form.password}
                onChange={onChange}
                required
                className="w-full rounded-2xl border border-slate-100 bg-slate-50/50 px-5 py-4 text-sm font-semibold outline-none transition-all focus:border-indigo-600 focus:bg-white focus:ring-4 focus:ring-indigo-50"
                placeholder="••••••••"
              />
            </div>

            {/* Confirm Password Field */}
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex justify-between">
                Verify Token
                <ShieldCheck className="h-3 w-3 text-indigo-400" />
              </label>
              <input
                type="password"
                name="confirmPassword"
                value={form.confirmPassword}
                onChange={onChange}
                required
                className="w-full rounded-2xl border border-slate-100 bg-slate-50/50 px-5 py-4 text-sm font-semibold outline-none transition-all focus:border-indigo-600 focus:bg-white focus:ring-4 focus:ring-indigo-50"
                placeholder="••••••••"
              />
            </div>

            {/* Submit Button */}
            <div className="md:col-span-2 pt-4">
              <button
                type="submit"
                disabled={submitting}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                className="group relative w-full overflow-hidden rounded-2xl bg-black py-5 text-[11px] font-black uppercase tracking-[0.4em] text-white transition-all active:scale-[0.98] hover:bg-indigo-600 shadow-xl shadow-indigo-100 hover:shadow-indigo-200 disabled:opacity-50"
              >
                {submitting ? (
                  <Spinner label="Initializing..." size="sm" />
                ) : (
                  <div className="flex items-center justify-center gap-3">
                    <Fingerprint className={`h-5 w-5 transition-all ${isHovered ? 'animate-pulse scale-110 text-white' : 'text-indigo-400'}`} />
                    <span>Confirm Registration</span>
                  </div>
                )}
                {submitting && (
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_1.5s_infinite]" />
                )}
              </button>
            </div>
          </form>

          {/* Footer Navigation */}
          <div className="mt-10 pt-8 border-t border-slate-50 text-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Already have an Identity?{' '}
              <Link to="/login" className="text-indigo-600 hover:underline underline-offset-4">
                Enter Portal
              </Link>
            </p>
          </div>
        </div>

        {/* Dynamic Security Footer */}
        <div className="mt-8 flex justify-center gap-8 opacity-30 grayscale transition-all hover:opacity-100 hover:grayscale-0">
           <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
              <span className="text-[8px] font-black uppercase tracking-widest text-slate-600">Dynamic Encryption</span>
           </div>
           <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-slate-500" />
              <span className="text-[8px] font-black uppercase tracking-widest text-slate-600">Contextual Mapping Ready</span>
           </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}} />
    </div>
  );
};

export default RegisterPage;