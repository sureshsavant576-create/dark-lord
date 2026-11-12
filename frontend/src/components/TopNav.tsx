"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

interface TopNavProps {
  active: "home" | "company" | "check";
  onAuthChange?: () => void;
}

export default function TopNav({ active, onAuthChange }: TopNavProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [tab, setTab] = useState<"login" | "register">("login");
  const [sessionOrg, setSessionOrg] = useState<string>("Default Workspace");
  const [signedIn, setSignedIn] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    try {
      const org = window.localStorage.getItem("sanket_org_id");
      const token = window.localStorage.getItem("sanket_session_token");
      if (token && org) {
        setSessionOrg(org);
        setSignedIn(true);
      }
    } catch {
      // ignore storage failure
    }
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");
    try {
      const res = await api.login(email.trim(), password);
      window.localStorage.setItem("sanket_session_token", res.session_token);
      window.localStorage.setItem("sanket_org_id", res.org_id || "default-org");
      setSessionOrg(res.org_id || "default-org");
      setSignedIn(true);
      setModalOpen(false);
      onAuthChange?.();
    } catch (err: any) {
      setErrorMsg(err?.message || "Sign in failed");
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");
    try {
      const res = await api.registerCompany({
        company_name: companyName.trim(),
        industry: "Technology",
        admin_name: "Brand Admin",
        admin_email: email.trim(),
        admin_password: password,
      });
      window.localStorage.setItem("sanket_session_token", res.session_token);
      window.localStorage.setItem("sanket_org_id", res.org_id || "default-org");
      setSessionOrg(res.org_id || companyName.trim());
      setSignedIn(true);
      setModalOpen(false);
      onAuthChange?.();
    } catch (err: any) {
      setErrorMsg(err?.message || "Company registration failed");
    }
  }

  function handleLogout() {
    window.localStorage.removeItem("sanket_session_token");
    window.localStorage.removeItem("sanket_org_id");
    setSessionOrg("Default Workspace");
    setSignedIn(false);
    setModalOpen(false);
    onAuthChange?.();
  }

  const navItems: Array<{ key: "home" | "company" | "check"; href: string; num: string; label: string }> = [
    { key: "home", href: "/", num: "01", label: "Home" },
    { key: "company", href: "/company", num: "02", label: "Company Vibes" },
    { key: "check", href: "/check", num: "03", label: "Developer Check" },
  ];

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-[#090d16]/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
          <Link href="/" className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-slate-100">
            <span className="h-2.5 w-2.5 rounded-full bg-indigo-500 shadow-[0_0_14px_rgba(99,102,241,0.9)]" />
            <span>
              Sanket <em className="not-italic text-indigo-400">AI</em>
            </span>
          </Link>

          <nav aria-label="Primary 3-page navigation" className="flex items-center gap-1 rounded-full border border-slate-800 bg-slate-950/80 p-1">
            {navItems.map((item) => {
              const isActive = active === item.key;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                    isActive
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
                  }`}
                >
                  <span className="font-mono text-[10px] opacity-75">{item.num}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/90 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-slate-700"
          >
            <span className={`h-2 w-2 rounded-full ${signedIn ? "bg-emerald-400" : "bg-amber-400"}`} />
            <span>{sessionOrg}</span>
          </button>
        </div>
      </header>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-[#0f172a] p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-100">Workspace Account</h3>
              <button type="button" onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-white">
                &times;
              </button>
            </div>

            <div className="mb-4 flex gap-2 rounded-xl bg-slate-950 p-1">
              <button
                type="button"
                onClick={() => setTab("login")}
                className={`flex-1 rounded-lg py-1.5 text-xs font-semibold ${tab === "login" ? "bg-indigo-600 text-white" : "text-slate-400"}`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => setTab("register")}
                className={`flex-1 rounded-lg py-1.5 text-xs font-semibold ${tab === "register" ? "bg-emerald-600 text-white" : "text-slate-400"}`}
              >
                Register Company
              </button>
            </div>

            {errorMsg && <div className="mb-3 rounded-lg bg-red-950/60 px-3 py-2 text-xs text-red-300">{errorMsg}</div>}

            {tab === "login" ? (
              <form onSubmit={handleLogin} className="space-y-3">
                <input
                  type="email"
                  required
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                />
                <input
                  type="password"
                  required
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                />
                <button type="submit" className="w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500">
                  Sign In
                </button>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="space-y-3">
                <input
                  type="text"
                  required
                  placeholder="Company Name"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                />
                <input
                  type="email"
                  required
                  placeholder="Admin Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                />
                <input
                  type="password"
                  required
                  minLength={8}
                  placeholder="Password (8+ chars)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                />
                <button type="submit" className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500">
                  Create Isolated Company Org
                </button>
              </form>
            )}

            {signedIn && (
              <div className="mt-4 flex items-center justify-between border-t border-slate-800 pt-3 text-xs text-slate-400">
                <span>Active Org: {sessionOrg}</span>
                <button type="button" onClick={handleLogout} className="text-indigo-400 hover:underline">
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
