"""Simulation and garage configuration."""

SIMULATION_TIME_SCALE = 20
TICK_INTERVAL_SECONDS = 0.1

GARAGE_ENTRANCE = {"x": 2.0, "y": 50.0}
GARAGE_EXIT = {"x": 98.0, "y": 50.0}
LANE_CENTER_Y = 50.0

METERS_PER_MAP_UNIT = 1.8
ROBOT_METERS_PER_SECOND = 1.4
# Slightly slower map motion + higher broadcast interval = smoother UI
VEHICLE_MAP_UNITS_PER_SECOND = 6.0
ROBOT_MAP_UNITS_PER_SECOND = 10.0
BROADCAST_INTERVAL_SECONDS = 0.1

BATTERY_CAPACITY_KWH = 75.0
CHARGE_RATE_KW = 7.0
CHARGING_KWH_PER_SECOND = 0.7

ROBOT_COLLISION_RADIUS = 2.0
VEHICLE_COLLISION_RADIUS = 3.5
MIN_ROBOT_SEPARATION = 5.5
ARRIVAL_DISTANCE_THRESHOLD = 1.2
MAX_YIELD_TICKS = 6  # brief pause, then divert — never force through
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
DEMO_FIRST_SPAWN_TICK = 10
DEMO_FIRST_SPAWN_SPOT = "A5"

LANE_BLOCK_ZONE = {
    "label": "P2-18",
    "x_min": 45,
    "x_max": 59,
}

# Three dock bays aligned with parking rows.
# A: top-left of P2 | B: bottom-left | C: far right of A row (clear of A9 right edge ~94)
DOCK_BAYS = [
    {"id": "dock-A", "label": "A", "position": {"x": 7.0, "y": 16}, "orientation": "horizontal"},
    {"id": "dock-B", "label": "B", "position": {"x": 6.0, "y": 76}, "orientation": "horizontal"},
    # Compact pad at the map edge — A9 ends ~94, keep a visible gap.
    {"id": "dock-C", "label": "C", "position": {"x": 99.0, "y": 84}, "orientation": "horizontal"},
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
