import {
  ArrowRight,
  Bot,
  Clock3,
  FileArchive,
  FileSearch2,
  FileUp,
  Home,
  Layers,
  LogIn,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

const navItems = [
  { href: "#home", label: "Home", icon: Home },
  { href: "#features", label: "Features", icon: Sparkles },
  { href: "#how-it-works", label: "How It Works", icon: Workflow },
];

const featureCards = [
  {
    icon: Bot,
    title: "AI Scheme Recommendation",
    description: "Discover schemes aligned with your profile, category, occupation, and eligibility.",
  },
  {
    icon: Workflow,
    title: "Automatic Form Filling",
    description: "Prepare field values and safely fill official portals with guided automation steps.",
  },
  {
    icon: FileUp,
    title: "Smart Document Upload",
    description: "Match document names to upload fields and attach files where they are required.",
  },
  {
    icon: FileSearch2,
    title: "AI Data Extraction",
    description: "Extract structured data from PDFs and images for faster, accurate autofill.",
  },
];

const howItWorksSteps = [
  {
    icon: FileArchive,
    title: "Upload Documents",
    description: "Add your documents once to build a reusable profile context.",
  },
  {
    icon: FileSearch2,
    title: "AI Extracts Your Data",
    description: "Important identity and eligibility fields are extracted and normalized.",
  },
  {
    icon: Sparkles,
    title: "Find Eligible Schemes",
    description: "Recommendations are ranked based on profile details and eligibility fit.",
  },
  {
    icon: Workflow,
    title: "Auto Fill Scheme Forms",
    description: "Use guided automation to fill forms while keeping final submission in your control.",
  },
];

const benefitCards = [
  {
    icon: Clock3,
    title: "Save Time",
    description: "Skip repetitive data entry across multiple application portals.",
  },
  {
    icon: Workflow,
    title: "Automatic Application",
    description: "Use prepared automation steps to accelerate the apply journey.",
  },
  {
    icon: ShieldCheck,
    title: "Accurate Data Mapping",
    description: "Field-level mapping improves consistency and reduces manual errors.",
  },
  {
    icon: Layers,
    title: "Easy Document Management",
    description: "Keep extracted data and uploaded documents organized in one place.",
  },
];

const Reveal = ({ children, delay = 0, className = "" }) => {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setVisible(true);
        observer.unobserve(entry.target);
      },
      {
        threshold: 0.2,
      }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transform-gpu transition duration-700 ease-out motion-reduce:transition-none ${
        visible ? "translate-y-0 opacity-100" : "translate-y-5 opacity-0"
      } ${className}`}
    >
      {children}
    </div>
  );
};

const HomePage = () => (
  <div id="home" className="min-h-screen bg-slate-50 text-slate-900">
    <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <Link to="/" className="inline-flex items-center gap-2">
          <span className="rounded-lg bg-blue-600 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-white">
            Gov Assist
          </span>
        </Link>

        <nav className="hidden items-center gap-2 md:flex">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <a
                key={item.href}
                href={item.href}
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </a>
            );
          })}
          <Link
            to="/login"
            className="ml-2 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            <LogIn className="h-4 w-4" />
            Login
          </Link>
        </nav>

        <Link
          to="/login"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 md:hidden"
        >
          <LogIn className="h-4 w-4" />
          Login
        </Link>
      </div>
    </header>

    <main>
      <section className="relative overflow-hidden px-4 pb-20 pt-14 sm:px-6 sm:pt-20 lg:px-8">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-0 top-0 h-64 w-64 rounded-full bg-blue-100 blur-3xl" />
          <div className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-emerald-100 blur-3xl" />
        </div>

        <div className="relative mx-auto grid w-full max-w-7xl items-center gap-10 lg:grid-cols-2">
          <Reveal>
            <p className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">
              <Sparkles className="h-3.5 w-3.5" />
              AI Powered Eligibility Assistant
            </p>
            <h1 className="mt-5 text-4xl font-extrabold leading-tight text-slate-900 sm:text-5xl">
              Discover Government Schemes Instantly
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
              Find and apply for government schemes automatically using AI-powered form filling.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                to="/login"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-blue-700"
              >
                Get Started
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#features"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:bg-slate-100"
              >
                Explore Features
              </a>
            </div>
          </Reveal>

          <Reveal delay={120}>
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                What You Get
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {[
                  "Personalized eligibility checks",
                  "Document-aware autofill context",
                  "Guided form filling workflow",
                  "Manual final submit control",
                ].map((item) => (
                  <div
                    key={item}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-slate-700 transition hover:-translate-y-0.5 hover:shadow-sm"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section id="features" className="px-4 pb-20 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-7xl">
          <Reveal>
            <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">Feature Highlights</h2>
            <p className="mt-3 max-w-2xl text-sm text-slate-600 sm:text-base">
              Everything you need to discover, prepare, and complete scheme applications faster.
            </p>
          </Reveal>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {featureCards.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <Reveal key={feature.title} delay={index * 70}>
                  <article className="h-full rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/80 transition hover:-translate-y-1 hover:shadow-lg">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                      <Icon className="h-5 w-5" />
                    </span>
                    <h3 className="mt-4 text-base font-semibold text-slate-900">{feature.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">{feature.description}</p>
                  </article>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="bg-white px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-7xl">
          <Reveal>
            <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">How It Works</h2>
            <p className="mt-3 max-w-2xl text-sm text-slate-600 sm:text-base">
              Follow a simple path from documents to ready-to-review filled forms.
            </p>
          </Reveal>

          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {howItWorksSteps.map((step, index) => {
              const Icon = step.icon;
              return (
                <Reveal key={step.title} delay={index * 80}>
                  <article className="relative h-full rounded-2xl border border-slate-200 bg-slate-50 p-5 transition hover:-translate-y-1 hover:shadow-md">
                    <span className="absolute right-4 top-4 inline-flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                      {index + 1}
                    </span>
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-white text-blue-700 shadow-sm">
                      <Icon className="h-5 w-5" />
                    </span>
                    <h3 className="mt-4 text-base font-semibold text-slate-900">{step.title}</h3>
                    <p className="mt-2 text-sm text-slate-600">{step.description}</p>
                  </article>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      <section className="px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-7xl">
          <Reveal>
            <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">Platform Benefits</h2>
            <p className="mt-3 max-w-2xl text-sm text-slate-600 sm:text-base">
              Built to reduce effort while preserving your control during final submission.
            </p>
          </Reveal>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {benefitCards.map((benefit, index) => {
              const Icon = benefit.icon;
              return (
                <Reveal key={benefit.title} delay={index * 70}>
                  <article className="h-full rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/80 transition hover:-translate-y-1 hover:shadow-lg">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                      <Icon className="h-5 w-5" />
                    </span>
                    <h3 className="mt-4 text-base font-semibold text-slate-900">{benefit.title}</h3>
                    <p className="mt-2 text-sm text-slate-600">{benefit.description}</p>
                  </article>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      <section className="px-4 pb-20 sm:px-6 lg:px-8">
        <Reveal className="mx-auto w-full max-w-5xl">
          <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl shadow-slate-200/70 sm:p-12">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">Start Now</p>
            <h3 className="mt-3 text-2xl font-bold text-slate-900 sm:text-3xl">
              Ready to discover the schemes you&apos;re eligible for?
            </h3>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-600 sm:text-base">
              Sign in and let the platform guide you through recommendations, documents, and form filling.
            </p>
            <div className="mt-7">
              <Link
                to="/login"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-blue-700"
              >
                Get Started
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </Reveal>
      </section>
    </main>
  </div>
);

export default HomePage;
