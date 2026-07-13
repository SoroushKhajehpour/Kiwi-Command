"use client";

import type { Robot } from "@/lib/types";
import { KiwiRobotTopView } from "./KiwiRobotTopView";

export function RobotMarker({ robot }: { robot: Robot }) {
  const moving = robot.status === "en-route" || robot.status === "returning";
  const dockCharging = (robot.status === "docked" || robot.status === "idle") && robot.battery < 99.5;

  return (
    <div
      className="absolute z-30 w-[3.6%] -translate-x-1/2 -translate-y-1/2 will-change-[left,top]"
      style={{
        left: `${robot.position.x}%`,
        top: `${robot.position.y}%`,
        // No tween when snapping onto a dock / service point — avoids the size/jump pop.
        transition: moving ? "left 120ms linear, top 120ms linear" : "none",
      }}
    >
      <div
        className="origin-center will-change-transform"
        style={{
          transform: `rotate(${robot.heading}deg)`,
          transition: moving ? "transform 160ms ease-out" : "none",
        }}
      >
        <KiwiRobotTopView charging={robot.status === "charging" || dockCharging} className="w-full" />
      </div>
      <span className="absolute left-1/2 top-full mt-0.5 -translate-x-1/2 whitespace-nowrap bg-white/90 px-1 font-mono text-[8px] font-bold leading-3 text-foreground">
        {robot.name}
        {robot.status === "faulted" ? " · FLT" : dockCharging ? " · DOCK" : ""}
      </span>
    </div>
  );
}
