import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";

type Surface = {
  id: "today" | "structure" | "history";
  title: string;
  description: string;
};

type Feature = {
  title: string;
  description: string;
};

type Integration = {
  name: "Slack" | "Discord" | "GitHub" | string;
  monogram: string;
  tone: "slack" | "discord" | "github";
};

type FooterLink = {
  label: string;
  href: string;
  external?: boolean;
};

type FooterGroup = {
  heading: string;
  links: FooterLink[];
};

type FooterContent = {
  groups: FooterGroup[];
  copyrightYear: number;
};

type LandingContent = {
  brandName: string;
  eyebrow: string;
  headline: string;
  subhead: string;
  primaryCta: { label: string; to: string };
  secondaryCta: { label: string; href: string };
  surfaces: Surface[];
  features: Feature[];
  integrations: Integration[];
  closingCta: {
    headline: string;
    body: string;
    label: string;
    to: string;
  };
  footer: FooterContent;
};

const REPO_URL = "https://github.com/Fyralisinc/fyraliscore";
const DOCS_URL = `${REPO_URL}#readme`;
const ARCHITECTURE_URL = `${REPO_URL}/blob/main/CODEBASE-ARCHITECTURE.md`;

const LANDING_CONTENT: LandingContent = {
  brandName: "Fyralis",
  eyebrow: "Organizational intelligence runtime",
  headline: "The operating system for organizational thought.",
  subhead:
    "Fyralis ingests the signals your company already emits — Slack, Discord, GitHub, meetings, decisions — and turns them into a single, prioritized feed your leadership can actually act on.",
  primaryCta: { label: "Try the demo", to: "/demo" },
  secondaryCta: { label: "How it works", href: "#how-it-works" },
  surfaces: [
    {
      id: "today",
      title: "Today",
      description:
        "A prioritized cockpit of recommendations grounded in the day's signals. Triage with the keyboard — act, hold, route, snooze, dismiss — without leaving your seat.",
    },
    {
      id: "structure",
      title: "Structure",
      description:
        "The living map of actors, commitments, goals, decisions, and resources that your organization is actually made of — kept honest by the substrate, not by hand.",
    },
    {
      id: "history",
      title: "History",
      description:
        "Every observation, every model revision, every act. Auditable, queryable, and replayable so you can ask why a decision was made and get a real answer.",
    },
  ],
  features: [
    {
      title: "Prioritized recommendation feed",
      description:
        "Reasoning over your signals produces ranked, evidence-grounded recommendations — not a dashboard of metrics that asks you to figure it out.",
    },
    {
      title: "Multi-tenant gateway",
      description:
        "A FastAPI gateway with row-level tenant isolation enforced in Postgres. Designed to host many companies on one runtime without bleed-through.",
    },
    {
      title: "Native integrations",
      description:
        "Slack, Discord, and GitHub ingest channels turn day-to-day activity into observations the substrate can reason over — no manual exports.",
    },
    {
      title: "Asynchronous reasoning workers",
      description:
        "A Think worker and a post-commit worker handle expensive reasoning out-of-band, so the cockpit stays responsive while the substrate keeps thinking.",
    },
    {
      title: "Pluggable LLM stack",
      description:
        "DeepSeek, Anthropic, OpenAI, and local Ollama backends behind a single provider interface. Swap models without rewiring the runtime.",
    },
    {
      title: "Vector-aware substrate",
      description:
        "Postgres + pgvector keeps embeddings beside the durable facts that produced them, so retrieval and provenance never drift apart.",
    },
  ],
  integrations: [
    { name: "Slack", monogram: "S", tone: "slack" },
    { name: "Discord", monogram: "D", tone: "discord" },
    { name: "GitHub", monogram: "G", tone: "github" },
  ],
  closingCta: {
    headline: "Ready to see it on your own data?",
    body: "The demo runs against a seeded company so you can feel the loop in under five minutes.",
    label: "Try the demo",
    to: "/demo",
  },
  footer: {
    groups: [
      {
        heading: "Product",
        links: [
          { label: "Try the demo", href: "/demo" },
          { label: "How it works", href: "#how-it-works" },
          { label: "Structure", href: "/structure" },
          { label: "History", href: "/history" },
        ],
      },
      {
        heading: "Resources",
        links: [
          { label: "Documentation", href: DOCS_URL, external: true },
          { label: "Architecture", href: ARCHITECTURE_URL, external: true },
          { label: "GitHub", href: REPO_URL, external: true },
        ],
      },
      {
        heading: "Company",
        links: [
          { label: "About", href: "#how-it-works" },
          {
            label: "Contact",
            href: "mailto:hello@fyralis.example",
            external: true,
          },
        ],
      },
    ],
    copyrightYear: 2026,
  },
};

const INTEGRATION_TONE_CLASSES: Record<Integration["tone"], string> = {
  slack: "bg-strategic-bg text-strategic-text",
  discord: "bg-accent-faint text-accent-deep",
  github: "bg-base-deep text-ink-2",
};

function useRevealOnScroll() {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    if (typeof IntersectionObserver === "undefined") return;
    const targets = root.querySelectorAll<HTMLElement>("[data-reveal]");
    targets.forEach((el) => el.classList.add("reveal-init"));
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.1 }
    );
    targets.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return ref;
}

function HeroPreviewCard() {
  return (
    <div
      aria-hidden="true"
      className="hidden lg:block lg:flex-1 lg:max-w-md"
    >
      <div className="rounded-2xl border border-rule-faint bg-surface shadow-[0_24px_48px_-24px_rgba(15,23,42,0.18)] p-5">
        <div className="flex items-center justify-between text-xs text-ink-4 mb-4">
          <span className="font-mono uppercase tracking-wide">Today</span>
          <span className="font-mono">Saturday · April 25</span>
        </div>
        <div className="space-y-3">
          <div className="rounded-lg border border-rule-faint bg-paper p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 text-[10px] uppercase tracking-wide rounded bg-critical-bg text-critical-text font-mono">
                Critical
              </span>
              <span className="text-xs text-ink-4">runway</span>
            </div>
            <p className="text-sm text-ink font-serif leading-snug">
              Q3 forecast is drifting 14% below plan — three commitments tied
              to it are still open.
            </p>
          </div>
          <div className="rounded-lg border border-rule-faint bg-paper p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 text-[10px] uppercase tracking-wide rounded bg-strategic-bg text-strategic-text font-mono">
                Strategic
              </span>
              <span className="text-xs text-ink-4">hiring</span>
            </div>
            <p className="text-sm text-ink font-serif leading-snug">
              Three senior eng candidates moved to final-round this week.
            </p>
          </div>
          <div className="rounded-lg border border-rule-faint bg-paper p-4 opacity-70">
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 text-[10px] uppercase tracking-wide rounded bg-high-bg text-high-text font-mono">
                High
              </span>
              <span className="text-xs text-ink-4">customer</span>
            </div>
            <p className="text-sm text-ink font-serif leading-snug">
              Two enterprise accounts flagged churn risk in the last 48h.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function IntegrationChip({ integration }: { integration: Integration }) {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-rule-faint bg-surface px-4 py-3">
      <span
        className={`inline-flex h-9 w-9 items-center justify-center rounded-md font-mono text-sm font-semibold ${INTEGRATION_TONE_CLASSES[integration.tone]}`}
        aria-hidden="true"
      >
        {integration.monogram}
      </span>
      <span className="font-sans text-ink font-medium">{integration.name}</span>
    </li>
  );
}

function PrimaryButton({
  to,
  children,
  className = "",
}: {
  to: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      to={to}
      className={`inline-flex items-center justify-center rounded-lg bg-accent px-5 py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${className}`}
    >
      {children}
    </Link>
  );
}

export default function LandingPage() {
  const rootRef = useRevealOnScroll();
  const c = LANDING_CONTENT;

  return (
    <div className="bg-base text-ink font-sans antialiased min-h-screen">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-ink focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>

      <header className="border-b border-rule-faint bg-base/80 backdrop-blur supports-[backdrop-filter]:bg-base/60 sticky top-0 z-30">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-ink font-serif text-base text-white"
            >
              F
            </span>
            <span className="font-serif text-xl text-ink">{c.brandName}</span>
          </span>
          <nav aria-label="Primary" className="hidden md:block">
            <ul className="flex items-center gap-6 text-sm text-ink-3">
              <li>
                <a
                  className="hover:text-ink focus-visible:outline-2 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-accent rounded"
                  href="#how-it-works"
                >
                  How it works
                </a>
              </li>
              <li>
                <a
                  className="hover:text-ink focus-visible:outline-2 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-accent rounded"
                  href="#features"
                >
                  Features
                </a>
              </li>
              <li>
                <a
                  className="hover:text-ink focus-visible:outline-2 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-accent rounded"
                  href="#integrations"
                >
                  Integrations
                </a>
              </li>
            </ul>
          </nav>
          <PrimaryButton to={c.primaryCta.to} className="text-xs py-2 px-3">
            {c.primaryCta.label}
          </PrimaryButton>
        </div>
      </header>

      <main id="main-content" ref={rootRef as React.RefObject<HTMLElement>}>
        <section
          aria-labelledby="hero-heading"
          className="mx-auto max-w-6xl px-6 pt-16 pb-20 md:pt-24 md:pb-28"
        >
          <div className="flex flex-col lg:flex-row lg:items-center lg:gap-12">
            <div className="flex-1 max-w-2xl">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-accent mb-5">
                {c.eyebrow}
              </p>
              <h1
                id="hero-heading"
                className="font-serif text-4xl md:text-5xl lg:text-6xl leading-[1.05] text-ink"
              >
                {c.headline}
              </h1>
              <p className="mt-6 max-w-xl text-lg text-ink-3 leading-relaxed">
                {c.subhead}
              </p>
              <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
                <PrimaryButton to={c.primaryCta.to}>
                  {c.primaryCta.label}
                </PrimaryButton>
                <a
                  href={c.secondaryCta.href}
                  className="inline-flex items-center justify-center rounded-lg border border-rule-soft bg-surface px-5 py-3 text-sm font-medium text-ink hover:bg-surface-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {c.secondaryCta.label}
                </a>
              </div>
            </div>
            <HeroPreviewCard />
          </div>
        </section>

        <section
          id="how-it-works"
          aria-labelledby="surfaces-heading"
          data-reveal
          className="bg-surface-soft border-y border-rule-faint"
        >
          <div className="mx-auto max-w-6xl px-6 py-20 md:py-24">
            <div className="max-w-2xl mb-12">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-accent mb-3">
                How it works
              </p>
              <h2
                id="surfaces-heading"
                className="font-serif text-3xl md:text-4xl text-ink"
              >
                Three surfaces, one substrate.
              </h2>
              <p className="mt-4 text-ink-3 leading-relaxed">
                Fyralis runs as a multi-tenant FastAPI gateway over a Postgres + pgvector
                substrate, with Ollama-backed embeddings and a Think + post-commit worker
                pair behind it. The Vite/React cockpit gives you three views into the same
                living store.
              </p>
            </div>
            <ul className="grid gap-6 md:grid-cols-3">
              {c.surfaces.map((s) => (
                <li
                  key={s.id}
                  className="rounded-2xl border border-rule-faint bg-surface p-6"
                >
                  <h3 className="font-serif text-xl text-ink">{s.title}</h3>
                  <p className="mt-3 text-sm text-ink-3 leading-relaxed">
                    {s.description}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section
          id="features"
          aria-labelledby="features-heading"
          data-reveal
          className="bg-base"
        >
          <div className="mx-auto max-w-6xl px-6 py-20 md:py-24">
            <div className="max-w-2xl mb-12">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-accent mb-3">
                Features
              </p>
              <h2
                id="features-heading"
                className="font-serif text-3xl md:text-4xl text-ink"
              >
                Built to reason, not just to dashboard.
              </h2>
            </div>
            <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {c.features.map((f) => (
                <li
                  key={f.title}
                  className="rounded-xl border border-rule-faint bg-surface p-6"
                >
                  <h3 className="font-serif text-lg text-ink">{f.title}</h3>
                  <p className="mt-2 text-sm text-ink-3 leading-relaxed">
                    {f.description}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section
          id="integrations"
          aria-labelledby="integrations-heading"
          data-reveal
          className="bg-surface-soft border-y border-rule-faint"
        >
          <div className="mx-auto max-w-6xl px-6 py-20 md:py-24">
            <div className="max-w-2xl mb-10">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-accent mb-3">
                Integrations
              </p>
              <h2
                id="integrations-heading"
                className="font-serif text-3xl md:text-4xl text-ink"
              >
                Listens where your team already works.
              </h2>
              <p className="mt-4 text-ink-3 leading-relaxed">
                Native ingest for the channels your organization already runs on. More
                sources land as the substrate grows.
              </p>
            </div>
            <ul className="flex flex-wrap gap-3">
              {c.integrations.map((integ) => (
                <IntegrationChip key={integ.name} integration={integ} />
              ))}
            </ul>
          </div>
        </section>

        <section
          aria-labelledby="closing-cta-heading"
          data-reveal
          className="bg-ink text-white"
        >
          <div className="mx-auto max-w-4xl px-6 py-20 md:py-24 text-center">
            <h2
              id="closing-cta-heading"
              className="font-serif text-3xl md:text-4xl"
            >
              {c.closingCta.headline}
            </h2>
            <p className="mt-4 text-ink-5 leading-relaxed">
              {c.closingCta.body}
            </p>
            <div className="mt-8 flex justify-center">
              <Link
                to={c.closingCta.to}
                className="inline-flex items-center justify-center rounded-lg bg-white px-6 py-3 text-sm font-medium text-ink transition-colors hover:bg-ink-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                {c.closingCta.label}
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer
        aria-labelledby="footer-heading"
        className="border-t border-rule-faint bg-base"
      >
        <h2 id="footer-heading" className="sr-only">
          Footer
        </h2>
        <div className="mx-auto max-w-6xl px-6 py-14">
          <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
            <div>
              <span className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-ink font-serif text-base text-white"
                >
                  F
                </span>
                <span className="font-serif text-xl text-ink">
                  {c.brandName}
                </span>
              </span>
              <p className="mt-4 max-w-xs text-sm text-ink-3 leading-relaxed">
                Organizational intelligence runtime. Open source. Self-hostable. Built on
                Postgres + pgvector.
              </p>
            </div>
            {c.footer.groups.map((group) => (
              <div key={group.heading}>
                <h3 className="font-mono text-xs uppercase tracking-[0.18em] text-ink-4 mb-4">
                  {group.heading}
                </h3>
                <ul className="space-y-2">
                  {group.links.map((link) => (
                    <li key={`${group.heading}-${link.label}`}>
                      {link.external ? (
                        <a
                          href={link.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-ink-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent rounded"
                        >
                          {link.label}
                        </a>
                      ) : link.href.startsWith("#") ? (
                        <a
                          href={link.href}
                          className="text-sm text-ink-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent rounded"
                        >
                          {link.label}
                        </a>
                      ) : (
                        <Link
                          to={link.href}
                          className="text-sm text-ink-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent rounded"
                        >
                          {link.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-12 border-t border-rule-faint pt-6 text-xs text-ink-4">
            © {c.footer.copyrightYear} {c.brandName}. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
