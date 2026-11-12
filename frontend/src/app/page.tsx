"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import TopNav from "@/components/TopNav";
import { api } from "@/lib/api";

export default function HomePage() {
  const [brands, setBrands] = useState<any[]>([]);
  const [providers, setProviders] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      const [statusData, brandList] = await Promise.all([
        api.getSystemStatus().catch(() => null),
        api.listBrands().catch(() => []),
      ]);
      if (statusData?.providers) setProviders(statusData.providers);
      setBrands(Array.isArray(brandList) ? brandList : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100">
      <TopNav active="home" onAuthChange={refresh} />

      <main className="mx-auto max-w-6xl px-5 py-10">
        <section className="rounded-3xl border border-slate-800/80 bg-slate-900/50 p-8 md:p-10">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 font-mono text-[11px] font-semibold tracking-wider text-indigo-300">
              3-STEP BRAND GOVERNANCE
            </span>
            <div className="flex flex-wrap gap-2">
              {[
                { label: "Gemini", ok: Boolean(providers.gemini?.configured ?? providers.gemini_configured) },
                { label: "Groq", ok: Boolean(providers.groq?.configured ?? providers.groq_configured) },
                { label: "Supabase", ok: Boolean(providers.supabase?.configured ?? providers.supabase_configured) },
              ].map((s) => (
                <span
                  key={s.label}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[11px] ${
                    s.ok
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                      : "border-slate-700 bg-slate-800 text-slate-400"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${s.ok ? "bg-emerald-400" : "bg-slate-500"}`} />
                  {s.label}
                </span>
              ))}
            </div>
          </div>

          <h1 className="text-3xl font-bold tracking-tight text-white md:text-5xl">
            Put your company&rsquo;s <span className="text-indigo-400">vibes</span> in.
            <br />
            Check if your build matches.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-400 md:text-base">
            Companies lock their visual palette, tone, and brand rules in one studio. Developers test designs, posters, PDFs, or copy directly against them.
          </p>

          {/* Quick Demo Credentials Banner */}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-indigo-500/30 bg-indigo-950/40 p-4">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5 font-semibold text-indigo-200">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                Demo Credentials:
              </span>
              <span className="font-mono text-slate-300">
                Email: <strong className="text-white select-all">demo@sanket.ai</strong>
              </span>
              <span className="text-slate-500">&bull;</span>
              <span className="font-mono text-slate-300">
                Password: <strong className="text-white select-all">DemoJudge2026!</strong>
              </span>
              <span className="text-slate-500">&bull;</span>
              <span className="font-mono text-slate-400">Role: Administrator (apex-cloud)</span>
            </div>
            <button
              type="button"
              onClick={async () => {
                try {
                  const res = await api.login("demo@sanket.ai", "DemoJudge2026!");
                  localStorage.setItem("sanket_session_token", res.session_token);
                  localStorage.setItem("sanket_org_id", res.org_id);
                  refresh();
                  window.location.href = "/company";
                } catch (e) {
                  console.error(e);
                }
              }}
              className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 transition shadow-sm"
            >
              ⚡ 1-Click Demo Login &rarr;
            </button>
          </div>

          <div className="mt-8 grid gap-5 md:grid-cols-2">
            <article className="flex flex-col justify-between rounded-2xl border border-indigo-500/30 bg-slate-950/70 p-6">
              <div>
                <div className="mb-3 flex items-center justify-between text-xs">
                  <span className="font-mono text-indigo-300">PAGE 02 &middot; FOR COMPANIES</span>
                  <span className="rounded-full bg-indigo-500/15 px-2.5 py-0.5 text-indigo-300">Set &amp; Lock Vibes</span>
                </div>
                <h2 className="text-xl font-bold text-white">Put Your Company Vibes</h2>
                <p className="mt-2 text-sm text-slate-400">
                  Define personality, mood, tone, approved HEX palette, logo, and words to avoid. Let Gemini AI synthesize complete vibes and publish them.
                </p>
              </div>
              <Link
                href="/company"
                className="mt-6 inline-flex items-center justify-center rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500"
              >
                Open Company Vibes Studio &rarr;
              </Link>
            </article>

            <article className="flex flex-col justify-between rounded-2xl border border-emerald-500/30 bg-slate-950/70 p-6">
              <div>
                <div className="mb-3 flex items-center justify-between text-xs">
                  <span className="font-mono text-emerald-300">PAGE 03 &middot; FOR DEVELOPERS</span>
                  <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-emerald-300">Verify Match</span>
                </div>
                <h2 className="text-xl font-bold text-white">Check Whether It Matches</h2>
                <p className="mt-2 text-sm text-slate-400">
                  Pick a company vibe profile, drop a poster, UI screenshot, PDF, or copy snippet, and get instant match scores plus Auto-Fix.
                </p>
              </div>
              <Link
                href="/check"
                className="mt-6 inline-flex items-center justify-center rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500"
              >
                Open Developer Match Check &rarr;
              </Link>
            </article>
          </div>
        </section>

        <section className="mt-10">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-white">Active Company Vibe Profiles</h3>
              <p className="text-xs text-slate-400">Select any company profile to edit its vibes or test your work against it.</p>
            </div>
            <button
              type="button"
              onClick={refresh}
              className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-slate-700"
            >
              Refresh List
            </button>
          </div>

          {loading ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 text-sm text-slate-400">Loading company vibe profiles...</div>
          ) : !brands.length ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 text-sm text-slate-400">
              No company vibe profiles exist yet. Open <strong>Company Vibes Studio</strong> to publish one.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {brands.map((b) => {
                const locked = b.is_human_confirmed || b.status === "CONFIRMED";
                return (
                  <article key={b.brand_id} className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="font-bold text-white">{b.brand_name}</h4>
                          <p className="font-mono text-[11px] text-slate-400">{b.target_audience || "General Audience"}</p>
                        </div>
                        <span
                          className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold ${
                            locked ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          {locked ? "LOCKED" : "DRAFT"}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {(b.approved_palette || []).slice(0, 6).map((hex: string) => (
                          <span key={hex} title={hex} className="h-5 w-5 rounded-md border border-white/15" style={{ backgroundColor: hex }} />
                        ))}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {[...(b.personality || []), ...(b.mood || [])].slice(0, 4).map((t: string) => (
                          <span key={t} className="rounded-md bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="mt-5 flex gap-2">
                      <Link
                        href={`/company?brand=${encodeURIComponent(b.brand_id)}`}
                        className="flex-1 rounded-lg border border-slate-700 py-1.5 text-center text-xs font-medium text-slate-300 hover:bg-slate-800"
                      >
                        Edit Vibes
                      </Link>
                      <Link
                        href={`/check?brand=${encodeURIComponent(b.brand_id)}`}
                        className="flex-1 rounded-lg bg-emerald-600/90 py-1.5 text-center text-xs font-semibold text-white hover:bg-emerald-500"
                      >
                        Check Work &rarr;
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
