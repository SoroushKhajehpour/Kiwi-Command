"use client";

import Image from "next/image";
import type { DemoMode } from "@/lib/types";
import { SIMULATION_TIME_SCALE } from "@/lib/ops/constants";

interface HeaderProps {
  autoDispatch: boolean;
  demoMode: DemoMode;
  canSimulateFault: boolean;
  primaryDisabled: boolean;
  primaryLabel: string;
  activeJobCount: number;
  onRunDemo: () => void;
  onPauseDemo: () => void;
  onResumeDemo: () => void;
  onEndDemo: () => void;
  onResetScenario: () => void;
  onToggleDispatchMode: () => void;
  onPrimaryAction: () => void;
  onSimulateFault: () => void;
}

function abbreviatePrimary(label: string): string {
  switch (label) {
    case "Request New Charge":
      return "New Charge";
    case "Send Backup Robot":
      return "Backup";
    case "Dispatch Robot":
      return "Dispatch";
    case "Simulate Robot Fault":
      return "Fault Job";
    case "Job In Progress":
      return "In Progress";
    case "Waiting for dispatch":
      return "Queued";
    case "Select Vehicle":
      return "Select vehicle";
    case "Unavailable":
      return "Unavailable";
    case "Request Charge":
      return "Request";
    default:
      return label.length > 14 ? `${label.slice(0, 12)}…` : label;
  }
}

export function Header({
  autoDispatch,
  demoMode,
  canSimulateFault,
  primaryDisabled,
  primaryLabel,
  activeJobCount,
  onRunDemo,
  onPauseDemo,
  onResumeDemo,
  onEndDemo,
  onResetScenario,
  onToggleDispatchMode,
  onPrimaryAction,
  onSimulateFault,
}: HeaderProps) {
  const ctrl =
    "rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.04em] text-muted transition-colors hover:bg-surface hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40";

  const isDemoActive = demoMode !== "idle";
  const isRunning = demoMode === "running";
  const isPaused = demoMode === "paused";

  const statusLabel = isRunning
    ? "DEMO RUNNING"
    : isPaused
      ? "PAUSED"
      : demoMode === "ended"
        ? "ENDED"
        : "LIVE";

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
            <p className="mt-0.5 text-[11px] font-medium text-muted">
              Mobile EV Charging Operations
              {isDemoActive && (
                <span className="ml-2 font-mono text-[9px] text-kiwi-dark">Demo {SIMULATION_TIME_SCALE}x</span>
              )}
            </p>
          </div>
        </div>

        <div className="hidden items-center gap-2 justify-self-center md:flex">
          <span className="mr-1 flex items-center gap-1.5 text-[10px] font-semibold text-kiwi-dark">
            <span className={`h-1.5 w-1.5 rounded-full ${isRunning ? "animate-pulse bg-kiwi-dark" : "bg-kiwi-dark"}`} />
            {statusLabel}
          </span>
          {!isDemoActive && (
            <>
              <button
                type="button"
                onClick={onToggleDispatchMode}
                className={ctrl}
                aria-label={`Switch to ${autoDispatch ? "manual" : "automatic"} dispatch`}
              >
                {autoDispatch ? "AUTO" : "MANUAL"}
              </button>
              <span className="text-border">|</span>
            </>
          )}
          {!isDemoActive && (
            <button type="button" onClick={onRunDemo} className={`${ctrl} text-kiwi-dark`}>
              Run Demo
            </button>
          )}
          {isRunning && (
            <button type="button" onClick={onPauseDemo} className={ctrl}>
              Pause
            </button>
          )}
          {isPaused && (
            <button type="button" onClick={onResumeDemo} className={`${ctrl} text-kiwi-dark`}>
              Resume
            </button>
          )}
          {(isRunning || isPaused) && (
            <button type="button" onClick={onEndDemo} className={ctrl}>
              End Demo
            </button>
          )}
          <button
            type="button"
            onClick={onPrimaryAction}
            disabled={primaryDisabled}
            className={ctrl}
            title={primaryLabel}
          >
            {abbreviatePrimary(primaryLabel)}
          </button>
          {(isRunning || isPaused || !isDemoActive) && (
            <button type="button" onClick={onSimulateFault} disabled={!canSimulateFault} className={ctrl}>
              Fault
            </button>
          )}
          <button type="button" onClick={onResetScenario} className={ctrl}>
            Reset
          </button>
        </div>

        <div className="justify-self-end text-right">
          <p className="font-mono text-[10px] font-bold text-foreground">
            {activeJobCount} active job{activeJobCount === 1 ? "" : "s"}
          </p>
          <p className="text-[9px] text-muted">
            {isDemoActive ? "Autonomous simulation" : "Selected action in job panel"}
          </p>
        </div>
      </div>
    </header>
  );
}
