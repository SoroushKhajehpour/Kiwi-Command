"use client";

import { motion } from "framer-motion";
import type { Robot } from "@/lib/types";
import { KiwiRobotTopView } from "./KiwiRobotTopView";

export function RobotMarker({ robot }: { robot: Robot }) {
  return (
    <motion.div
      className="absolute z-30 w-[3.6%]"
      initial={false}
      animate={{ left: `${robot.position.x}%`, top: `${robot.position.y}%` }}
      transition={{ duration: 0.08, ease: "linear" }}
      style={{ x: "-50%", y: "-50%" }}
    >
      <motion.div
        animate={{ rotate: robot.heading }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        className="origin-center"
      >
        <KiwiRobotTopView charging={robot.status === "charging"} className="w-full" />
      </motion.div>
      <span className="absolute left-1/2 top-full mt-0.5 -translate-x-1/2 whitespace-nowrap bg-white/90 px-1 font-mono text-[8px] font-bold leading-3 text-foreground">
        {robot.name}
      </span>
    </motion.div>
  );
}
