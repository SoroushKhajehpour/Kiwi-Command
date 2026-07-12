"use client";

import { motion } from "framer-motion";
import { Radio, Zap } from "lucide-react";

interface HeaderProps {
  onRequestCharge: () => void;
}

export function Header({ onRequestCharge }: HeaderProps) {
  return (
    <header className="shrink-0 border-b border-border bg-white">
      <div className="mx-auto grid h-[84px] w-full max-w-[1440px] grid-cols-3 items-center px-5 xl:px-7">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-kiwi">
            <Zap className="h-6 w-6 text-foreground" fill="currentColor" strokeWidth={2.5} />
          </div>
          <div className="leading-tight">
            <h1 className="text-[18px] font-bold tracking-[-0.03em]">Kiwi Command</h1>
            <p className="mt-0.5 text-[11px] font-medium text-muted">Mobile EV Charging Operations</p>
          </div>
        </div>

        <div className="hidden justify-self-center md:flex">
          <div className="flex items-center gap-2.5 rounded-full border border-kiwi/30 bg-kiwi-soft px-3.5 py-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-kiwi-dark opacity-30" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-kiwi-dark" />
            </span>
            <div className="leading-none">
              <p className="text-xs font-semibold text-kiwi-dark">System Online</p>
              <p className="mt-1 flex items-center gap-1 text-[9px] text-muted">
                <Radio className="h-2.5 w-2.5" /> Live telemetry
              </p>
            </div>
          </div>
        </div>

        <motion.button
          type="button"
          onClick={onRequestCharge}
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.98 }}
          className="justify-self-end rounded-full bg-kiwi px-5 py-2.5 text-sm font-bold text-foreground transition-colors hover:bg-[#b2dc31]"
        >
          Request Charge
        </motion.button>
      </div>
    </header>
  );
}
