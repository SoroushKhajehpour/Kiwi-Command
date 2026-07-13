"""Simulation and garage configuration."""

SIMULATION_TIME_SCALE = 20
TICK_INTERVAL_SECONDS = 0.1

GARAGE_ENTRANCE = {"x": 2.0, "y": 50.0}
GARAGE_EXIT = {"x": 98.0, "y": 50.0}
LANE_CENTER_Y = 50.0
# Aisle Y toward main lane — outside painted stall depth (~27% tall bays at y=16/84).
TOP_ROW_LANE_Y = 36.0
BOTTOM_ROW_LANE_Y = 64.0
# Robot stands just outside the stall (not out on the main aisle) for short cables.
TOP_ROW_SERVICE_Y = 27.0
BOTTOM_ROW_SERVICE_Y = 73.0

METERS_PER_MAP_UNIT = 1.8
ROBOT_METERS_PER_SECOND = 1.4
# Faster motion with short CSS tweens (~160ms) for smooth telemetry
VEHICLE_MAP_UNITS_PER_SECOND = 7.5
ROBOT_MAP_UNITS_PER_SECOND = 11.0
BROADCAST_INTERVAL_SECONDS = 0.1

BATTERY_CAPACITY_KWH = 75.0
CHARGE_RATE_KW = 7.0
CHARGING_KWH_PER_SECOND = 0.7

ROBOT_COLLISION_RADIUS = 2.0
VEHICLE_COLLISION_RADIUS = 3.8
ARRIVAL_DISTANCE_THRESHOLD = 1.2
MAX_YIELD_TICKS = 6  # brief pause, then force progress — never freeze forever
MAX_VEHICLE_YIELD_TICKS = 8  # cars yield to robots briefly, then ease through
ROBOT_AVOID_DISTANCE = 7.0
ROBOT_SLOW_DISTANCE = 10.0

# ~30–75 real seconds between arrivals at 20x (tick += 2 / 0.1s)
SPAWN_INTERVAL_MIN_TICKS = 600
SPAWN_INTERVAL_MAX_TICKS = 1500
SPAWN_RETRY_COOLDOWN_TICKS = 40
MAX_ACTIVE_VEHICLES = 10
TARGET_OCCUPANCY_MAX = 0.8
COMPLETED_DWELL_TICKS = 40
LOW_ROBOT_BATTERY_THRESHOLD = 25
YIELD_EVENT_COOLDOWN_TICKS = 80
DEMO_FAULT_AFTER_CHARGE_TICKS = 8
INVARIANT_CHECK_INTERVAL_TICKS = 40

LANE_BLOCK_ZONE = {
    "label": "P2-18",
    "x_min": 45,
    "x_max": 59,
}

# Three dock bays — Dock C fully on-map, clear of A-row (y=84) and A9 (x=90).
DOCK_BAYS = [
    {"id": "dock-A", "label": "A", "position": {"x": 7.0, "y": 16}, "orientation": "horizontal"},
    {"id": "dock-B", "label": "B", "position": {"x": 6.0, "y": 76}, "orientation": "horizontal"},
    {"id": "dock-C", "label": "C", "position": {"x": 96.0, "y": 72}, "orientation": "vertical"},
]

# Prefer home bay on return so robots don't stack.
ROBOT_HOME_DOCK = {
    "R-01": "dock-A",
    "R-02": "dock-B",
    "R-03": "dock-C",
}

TOP_ROW_X = [18, 27, 36, 45, 54, 63, 72, 81, 90]

CORS_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
]

MAX_EVENTS = 100
