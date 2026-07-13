import type { GaragePosition } from "../types";

export const SIMULATION_TIME_SCALE = 20;
export const TICKS_PER_SIM_SECOND = 1;

export const GARAGE_ENTRANCE: GaragePosition = { x: 2, y: 50 };
export const GARAGE_EXIT: GaragePosition = { x: 98, y: 50 };

export const SPAWN_INTERVAL_MIN_TICKS = 8;
export const SPAWN_INTERVAL_MAX_TICKS = 15;

export const VEHICLE_MAP_UNITS_PER_SECOND = 8;
export const VEHICLE_BATTERY_CAPACITY_KWH = 75;
export const DEMO_CHARGING_KWH_PER_SECOND = 0.7;
export const CHARGE_RATE_KW = 7;

export const ROBOT_COLLISION_RADIUS = 2.5;
export const VEHICLE_COLLISION_RADIUS = 3.5;

export const YIELD_EVENT_COOLDOWN_TICKS = 3;
export const COMPLETED_DWELL_TICKS = 12;
export const LOW_ROBOT_BATTERY_THRESHOLD = 25;

/** Scripted demo fault fires this many sim-ticks after first charge starts. */
export const DEMO_FAULT_AFTER_CHARGE_TICKS = 6;

/** First spawn is deterministic for interview demo. */
export const DEMO_FIRST_SPAWN_TICK = 4;
export const DEMO_FIRST_SPAWN_SPOT = "A5";
