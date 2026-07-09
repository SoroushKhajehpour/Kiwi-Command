"use client";

import { motion } from "framer-motion";
import { Zap } from "lucide-react";
import { StatusPill } from "./StatusPill";

interface DashboardHeaderProps {
  onRequestCharge: () => void;
}

const NAV_ITEMS = ["Dashboard", "Fleet", "Sessions"] as const;

/** Top navigation bar: brand, nav links, system status and primary CTA. */
export function DashboardHeader({ onRequestCharge }: DashboardHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-white">
      <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center gap-8 px-6">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-kiwi">
            <Zap className="h-5 w-5 text-foreground" strokeWidth={2.5} fill="currentColor" />
          </div>
          <div className="leading-tight">
            <p className="text-[15px] font-semibold tracking-tight">Kiwi Command</p>
            <p className="text-[11px] text-muted">Mobile EV Charging Operations</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map((item, i) => (
            <a
              key={item}
              href="#"
              className={`rounded-full px-3.5 py-1.5 text-sm transition-colors ${
                i === 0
                  ? "bg-surface font-medium text-foreground"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {item}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <StatusPill label="System Online" tone="kiwi" pulse />
          <motion.button
            type="button"
            onClick={onRequestCharge}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            className="rounded-full bg-kiwi px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-[#b4d93c]"
          >
            Request Charge
          </motion.button>
        </div>
      </div>
    </header>
  );
}
