"use client";

import { motion } from "framer-motion";
import Image from "next/image";

interface HeaderProps {
  onRequestCharge: () => void;
  requestLabel: string;
  requestDisabled: boolean;
  autoDispatch: boolean;
  onToggleDispatchMode: () => void;
}

export function Header({
  onRequestCharge,
  requestLabel,
  requestDisabled,
  autoDispatch,
  onToggleDispatchMode,
}: HeaderProps) {
  return (
    <header className="shrink-0 border-b border-border bg-white">
      <div className="mx-auto grid h-[72px] w-full max-w-[1440px] grid-cols-[1fr_auto_1fr] items-center px-5 xl:px-6">
        <div className="flex items-center gap-3">
          <Image
            src="/kiwi-charge-logo.png"
            alt="Kiwi Charge"
            width={46}
            height={46}
            priority
            className="h-[46px] w-[46px] shrink-0 object-contain"
          />
          <div className="leading-tight">
            <h1 className="text-[18px] font-bold tracking-[-0.03em]">Kiwi Command</h1>
            <p className="mt-0.5 text-[11px] font-medium text-muted">Mobile EV Charging Operations</p>
          </div>
        </div>

        <div className="hidden items-center gap-5 justify-self-center text-[10px] md:flex">
          <span className="flex items-center gap-1.5 font-semibold text-kiwi-dark">
            <span className="h-1.5 w-1.5 rounded-full bg-kiwi-dark" />
            LIVE
          </span>
          <span className="text-muted">Lakeshore West · P2</span>
          <span className="text-muted">Telemetry 1s ago</span>
          <button
            type="button"
            onClick={onToggleDispatchMode}
            className="font-mono font-bold text-foreground hover:text-kiwi-dark"
            aria-label={`Switch to ${autoDispatch ? "manual" : "automatic"} dispatch`}
          >
            MODE {autoDispatch ? "AUTO" : "MANUAL"}
          </button>
        </div>

        <motion.button
          type="button"
          onClick={onRequestCharge}
          disabled={requestDisabled}
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.98 }}
          className="justify-self-end rounded-lg bg-kiwi px-4 py-2 text-xs font-bold text-foreground transition-colors hover:bg-[#b2dc31] disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-muted"
        >
          {requestLabel}
        </motion.button>
      </div>
    </header>
  );
}
