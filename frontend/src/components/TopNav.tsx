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
  const [tab, setTab] = useState<"login" | "register_company" | "register_dev">("login");
  const [sessionOrg, setSessionOrg] = useState<string>("Default Workspace");
  const [sessionEmail, setSessionEmail] = useState<string>("");
  const [sessionRole, setSessionRole] = useState<string>("");
  const [signedIn, setSignedIn] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [switchMode, setSwitchMode] = useState(false);

  useEffect(() => {
    try {
      const token = window.localStorage.getItem("sanket_session_token");
      const org = window.localStorage.getItem("sanket_company_name") || window.localStorage.getItem("sanket_org_id");
      const userEmail = window.localStorage.getItem("sanket_user_email");
      const userRole = window.localStorage.getItem("sanket_user_role");
      if (token && org) {
        setSessionOrg(org);
        setSessionEmail(userEmail || "");
        setSessionRole(userRole || "User");
        setSignedIn(true);
      }
    } catch {
      // ignore storage failure
    }
  }, []);

  function saveAuthSession(res: any) {
    const orgDisplay = res.company_name || res.org_id || "default-org";
    window.localStorage.setItem("sanket_session_token", res.session_token);
    window.localStorage.setItem("sanket_org_id", res.org_id || "default-org");
    window.localStorage.setItem("sanket_company_name", orgDisplay);
    window.localStorage.setItem("sanket_user_email", res.email || "");
    window.localStorage.setItem("sanket_user_role", res.role_label || res.role || "User");
    setSessionOrg(orgDisplay);
    setSessionEmail(res.email || "");
    setSessionRole(res.role_label || res.role || "User");
    setSignedIn(true);
    setSwitchMode(false);
    setModalOpen(false);
    onAuthChange?.();
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");
    setLoading(true);
    try {
      const res = await api.login(email.trim(), password);
      saveAuthSession(res);
    } catch (err: any) {
      setErrorMsg(err?.message || "Sign in failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleQuickDemoLogin() {
    setErrorMsg("");
    setLoading(true);
    try {
      const res = await api.login("demo@sanket.ai", "DemoJudge2026!");
      saveAuthSession(res);
    } catch (err: any) {
      setErrorMsg(err?.message || "Demo login failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegisterCompany(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");
    setLoading(true);
    try {
      const res = await api.registerCompany({
        company_name: companyName.trim(),
        industry: "Technology",
        admin_name: fullName.trim() || `${companyName.trim()} Admin`,
        admin_email: email.trim(),
        admin_password: password,
      });
      saveAuthSession(res);
    } catch (err: any) {
      setErrorMsg(err?.message || "Company registration failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegisterDeveloper(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");
    setLoading(true);
    try {
      const res = await api.register({
        email: email.trim(),
        password: password,
        role: "developer",
        full_name: fullName.trim() || undefined,
        org_id: "default-org",
      });
      saveAuthSession(res);
    } catch (err: any) {
      setErrorMsg(err?.message || "Developer registration failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    setLoading(true);
    try {
      await api.logout().catch(() => null);
    } finally {
      window.localStorage.removeItem("sanket_session_token");
      window.localStorage.removeItem("sanket_org_id");
      window.localStorage.removeItem("sanket_company_name");
      window.localStorage.removeItem("sanket_user_email");
      window.localStorage.removeItem("sanket_user_role");
      setSessionOrg("Default Workspace");
      setSessionEmail("");
      setSessionRole("");
      setSignedIn(false);
      setSwitchMode(false);
      setModalOpen(false);
      setLoading(false);
      onAuthChange?.();
    }
  }

  const navItems: Array<{ key: "home" | "company" | "check"; href: string; num: string; label: string }> = [
    { key: "home", href: "/", num: "01", label: "Home" },
    { key: "company", href: "/company", num: "02", label: "Company Vibes" },
    { key: "check", href: "/check", num: "03", label: "Developer Check" },
  ];

  return (
    <>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-[#0f172a] p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-100">Workspace Account</h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                &times;
              </button>
            </div>

            {/* Signed-in View */}
            {signedIn && !switchMode ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600 font-bold text-white shadow-sm">
                      {(sessionEmail || "User").slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-white">{sessionEmail}</div>
                      <div className="truncate text-xs text-slate-400">
                        {sessionOrg} &middot; <span className="text-indigo-400 font-medium">{sessionRole}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setSwitchMode(true)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 py-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                  >
                    Switch Account / Sign In with Another Profile
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={loading}
                    className="w-full rounded-xl bg-red-950/80 border border-red-800/60 py-2.5 text-xs font-semibold text-red-200 hover:bg-red-900"
                  >
                    {loading ? "Signing Out..." : "Sign Out"}
                  </button>
                </div>
              </div>
            ) : (
              /* Unauthenticated / Switch Account View */
              <div>
                {/* 1-Click Demo Login Bar & Credentials Display */}
                <div className="mb-4 rounded-xl border border-indigo-500/40 bg-indigo-950/50 p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold text-indigo-200">Demo Account Credentials</div>
                      <div className="text-[11px] text-indigo-400/80 font-mono">apex-cloud &middot; Administrator</div>
                    </div>
                    <button
                      type="button"
                      onClick={handleQuickDemoLogin}
                      disabled={loading}
                      className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 transition shadow-sm"
                    >
                      {loading ? "Signing in..." : "⚡ 1-Click Demo Sign In →"}
                    </button>
                  </div>
                  <div className="rounded-lg bg-slate-950/70 p-2.5 font-mono text-xs text-slate-300 space-y-1.5 border border-slate-800/60">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 text-[11px]">Email:</span>
                      <code className="text-indigo-300 font-semibold select-all">demo@sanket.ai</code>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 text-[11px]">Password:</span>
                      <code className="text-indigo-300 font-semibold select-all">DemoJudge2026!</code>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEmail("demo@sanket.ai");
                      setPassword("DemoJudge2026!");
                      setTab("login");
                    }}
                    className="w-full text-center text-xs text-indigo-300 hover:text-indigo-200 font-medium underline py-0.5"
                  >
                    Auto-fill credentials into form &darr;
                  </button>
                </div>

                {/* Tabs */}
                <div className="mb-4 flex gap-1 rounded-xl bg-slate-950 p-1">
                  <button
                    type="button"
                    onClick={() => { setTab("login"); setErrorMsg(""); }}
                    className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition ${
                      tab === "login" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => { setTab("register_company"); setErrorMsg(""); }}
                    className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition ${
                      tab === "register_company" ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Register Company
                  </button>
                  <button
                    type="button"
                    onClick={() => { setTab("register_dev"); setErrorMsg(""); }}
                    className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition ${
                      tab === "register_dev" ? "bg-cyan-600 text-white" : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Join Dev
                  </button>
                </div>

                {errorMsg && (
                  <div className="mb-3 rounded-lg border border-red-800/60 bg-red-950/60 px-3 py-2 text-xs text-red-300">
                    {errorMsg}
                  </div>
                )}

                {/* Tab: Sign In */}
                {tab === "login" && (
                  <form onSubmit={handleLogin} className="space-y-3">
                    <input
                      type="email"
                      required
                      placeholder="Email address"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
                    />
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-white"
                      >
                        {showPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 transition disabled:opacity-50"
                    >
                      {loading ? "Signing In..." : "Sign In"}
                    </button>
                  </form>
                )}

                {/* Tab: Register Company */}
                {tab === "register_company" && (
                  <form onSubmit={handleRegisterCompany} className="space-y-3">
                    <input
                      type="text"
                      required
                      placeholder="Company Name (e.g. Apex Cloud Systems)"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
                    />
                    <input
                      type="text"
                      placeholder="Admin Full Name (optional)"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
                    />
                    <input
                      type="email"
                      required
                      placeholder="Admin Work Email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
                    />
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        minLength={8}
                        placeholder="Password (8+ chars)"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-white"
                      >
                        {showPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 transition disabled:opacity-50"
                    >
                      {loading ? "Creating..." : "Create Isolated Company Workspace"}
                    </button>
                  </form>
                )}

                {/* Tab: Register Developer */}
                {tab === "register_dev" && (
                  <form onSubmit={handleRegisterDeveloper} className="space-y-3">
                    <input
                      type="text"
                      placeholder="Your Full Name (optional)"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
                    />
                    <input
                      type="email"
                      required
                      placeholder="Developer Email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
                    />
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        minLength={8}
                        placeholder="Password (8+ chars)"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-white"
                      >
                        {showPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full rounded-xl bg-cyan-600 py-2.5 text-sm font-semibold text-white hover:bg-cyan-500 transition disabled:opacity-50"
                    >
                      {loading ? "Registering..." : "Register Developer Account"}
                    </button>
                  </form>
                )}

                {signedIn && switchMode && (
                  <button
                    type="button"
                    onClick={() => setSwitchMode(false)}
                    className="mt-4 w-full text-center text-xs text-slate-400 hover:text-slate-200"
                  >
                    ← Back to active account ({sessionOrg})
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
