"use client";

import Image from "next/image";

interface HeaderProps {
  autoDispatch: boolean;
  onToggleDispatchMode: () => void;
  demoRunning: boolean;
  laneBlocked: boolean;
  canSimulateFault: boolean;
  primaryDisabled: boolean;
  primaryLabel: string;
  activeJobCount: number;
  onRunDemo: () => void;
  onResetScenario: () => void;
  onPrimaryAction: () => void;
  onSimulateFault: () => void;
  onToggleLaneBlock: () => void;
}

export function Header({
  autoDispatch,
  onToggleDispatchMode,
  demoRunning,
  laneBlocked,
  canSimulateFault,
  primaryDisabled,
  primaryLabel,
  activeJobCount,
  onRunDemo,
  onResetScenario,
  onPrimaryAction,
  onSimulateFault,
  onToggleLaneBlock,
}: HeaderProps) {
  const ctrl =
    "rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.04em] text-muted transition-colors hover:bg-surface hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40";

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

        <div className="hidden items-center gap-2 justify-self-center md:flex">
          <span className="mr-1 flex items-center gap-1.5 text-[10px] font-semibold text-kiwi-dark">
            <span className="h-1.5 w-1.5 rounded-full bg-kiwi-dark" />
            LIVE
          </span>
          <button
            type="button"
            onClick={onToggleDispatchMode}
            className={ctrl}
            aria-label={`Switch to ${autoDispatch ? "manual" : "automatic"} dispatch`}
          >
            {autoDispatch ? "AUTO" : "MANUAL"}
          </button>
          <span className="text-border">|</span>
          <button type="button" onClick={onRunDemo} disabled={demoRunning} className={`${ctrl} text-kiwi-dark`}>
            {demoRunning ? "Running…" : "Run Demo"}
          </button>
          <button
            type="button"
            onClick={onPrimaryAction}
            disabled={primaryDisabled || demoRunning}
            className={ctrl}
            title={primaryLabel}
          >
            {primaryLabel === "Request New Charge" ? "New Charge" : primaryLabel === "Send Backup Robot" ? "Backup" : primaryLabel === "Dispatch Robot" ? "Dispatch" : primaryLabel === "Simulate Robot Fault" ? "Fault Job" : "Request"}
          </button>
          <button type="button" onClick={onSimulateFault} disabled={!canSimulateFault || demoRunning} className={ctrl}>
            Fault
          </button>
          <button
            type="button"
            onClick={onToggleLaneBlock}
            disabled={demoRunning}
            className={`${ctrl} ${laneBlocked ? "bg-red-50 text-error" : ""}`}
          >
            {laneBlocked ? "Unblock" : "Block Lane"}
          </button>
          <button type="button" onClick={onResetScenario} className={ctrl}>
            Reset
          </button>
        </div>

        <div className="justify-self-end text-right">
          <p className="font-mono text-[10px] font-bold text-foreground">
            {activeJobCount} active job{activeJobCount === 1 ? "" : "s"}
          </p>
          <p className="text-[9px] text-muted">Selected action in job panel</p>
        </div>
      </div>
    </header>
  );
}
