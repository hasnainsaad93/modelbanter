"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, BarChart3, BookOpen, GitCompareArrows, Menu, Radio, Search, X } from "lucide-react";
import { useState } from "react";
import { clsx } from "clsx";

const links = [
  { href: "/", label: "Overview", icon: BarChart3 },
  { href: "/compare", label: "Compare", icon: GitCompareArrows },
  { href: "/posts", label: "Post explorer", icon: Search },
  { href: "/methodology", label: "Methodology", icon: BookOpen },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname(); const [open, setOpen] = useState(false);
  return <div className="app-shell">
    <header className="mobile-header"><Brand /><button className="icon-btn" onClick={() => setOpen(!open)} aria-label="Toggle navigation">{open ? <X /> : <Menu />}</button></header>
    <aside className={clsx("sidebar", open && "sidebar-open")}>
      <Brand />
      <nav aria-label="Primary navigation">
        <span className="nav-label">Workspace</span>
        {links.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setOpen(false)} className={clsx("nav-link", pathname === href && "active")}><Icon size={17} />{label}</Link>)}
        <span className="nav-label models-label">Tracked models</span>
        <Link className={clsx("model-nav", pathname.includes("gpt-5-6-sol") && "active")} href="/models/gpt-5-6-sol"><i className="model-dot sol" />GPT-5.6 Sol</Link>
        <Link className={clsx("model-nav", pathname.includes("claude-opus") && "active")} href="/models/claude-opus"><i className="model-dot opus" />Claude Opus</Link>
        <Link className={clsx("model-nav", pathname.includes("kimi-k3") && "active")} href="/models/kimi-k3"><i className="model-dot kimi" />Kimi K3</Link>
        <Link className={clsx("model-nav", pathname.includes("fable") && "active")} href="/models/fable"><i className="model-dot fable" />Fable</Link>
      </nav>
      <div className="sidebar-footer">
        <div className="live-line"><span className="live-pulse" /><span>Pipeline healthy</span><Activity size={14} /></div>
        <div className="sync-row"><span>Last sync</span><strong>4 min ago</strong></div>
      </div>
    </aside>
    {open && <button className="nav-scrim" onClick={() => setOpen(false)} aria-label="Close navigation" />}
    <main className="main-content">{children}</main>
  </div>;
}

function Brand() { return <Link href="/" className="brand" aria-label="Codex Signalist home"><span className="brand-mark"><Radio size={18} /></span><span>CODEX<span className="brand-light">/SIGNALIST</span></span></Link>; }

