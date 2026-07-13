import type { GaragePosition } from "../types";

export const SIMULATION_TIME_SCALE = 20;
export const TICKS_PER_SIM_SECOND = 1;

export const GARAGE_ENTRANCE: GaragePosition = { x: 2, y: 50 };
export const GARAGE_EXIT: GaragePosition = { x: 98, y: 50 };

export const VEHICLE_MAP_UNITS_PER_SECOND = 7.5;
export const ROBOT_MAP_UNITS_PER_SECOND = 11;
export const VEHICLE_BATTERY_CAPACITY_KWH = 75;
export const DEMO_CHARGING_KWH_PER_SECOND = 0.7;
export const CHARGE_RATE_KW = 7;

export const ROBOT_COLLISION_RADIUS = 2;
export const VEHICLE_COLLISION_RADIUS = 3.8;
export const MIN_ROBOT_SEPARATION = 5.5;
export const ARRIVAL_DISTANCE_THRESHOLD = 1.2;
export const MAX_YIELD_TICKS = 6;
export const MAX_VEHICLE_YIELD_TICKS = 8;

export const TOP_ROW_LANE_Y = 36;
export const BOTTOM_ROW_LANE_Y = 64;
export const TOP_ROW_SERVICE_Y = 27;
export const BOTTOM_ROW_SERVICE_Y = 73;
export const LANE_CENTER_Y = 50;

export const SPAWN_INTERVAL_MIN_TICKS = 600;
export const SPAWN_INTERVAL_MAX_TICKS = 1500;
export const SPAWN_RETRY_COOLDOWN_TICKS = 40;
export const MAX_ACTIVE_VEHICLES = 10;

export const YIELD_EVENT_COOLDOWN_TICKS = 50;
export const COMPLETED_DWELL_TICKS = 40;
export const LOW_ROBOT_BATTERY_THRESHOLD = 25;

/** Scripted demo fault fires this many sim-ticks after first charge starts. */
export const DEMO_FAULT_AFTER_CHARGE_TICKS = 8;

/** First spawn is deterministic for interview demo. */
export const DEMO_FIRST_SPAWN_TICK = 10;
