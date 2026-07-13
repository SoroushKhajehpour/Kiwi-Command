/** Backend API response types (snake_case). */

export interface ApiPosition {
  x: number;
  y: number;
}

export interface ApiVehicle {
  id: string;
  model: string;
  paint: string;
  spot_id: string | null;
  position: ApiPosition;
  status: string;
  battery: number;
  requested_energy_kwh: number;
  target_battery: number;
  priority: string;
  arrival_tick: number;
  expected_departure_tick: number;
  assigned_robot_id: string | null;
  route: ApiPosition[];
  route_index: number;
  heading: number;
  completed_at_tick?: number | null;
}

export interface ApiRobot {
  id: string;
  name: string;
  status: string;
  battery: number;
  position: ApiPosition;
  heading: number;
  assigned_vehicle_id: string | null;
  assigned_session_id: string | null;
  route: ApiPosition[];
  route_index: number;
  dock_bay_id: string | null;
  fault_type: string | null;
  last_yield_tick: number;
}

export interface ApiParkingSpot {
  id: string;
  row: string;
  position: ApiPosition;
  service_point: ApiPosition;
  occupied_vehicle_id: string | null;
  reserved_vehicle_id?: string | null;
}

export interface ApiDockBay {
  id: string;
  position: ApiPosition;
}

export interface ApiSession {
  id: string;
  vehicle_id: string;
  spot_id: string;
  robot_id: string | null;
  status: string;
  requested_energy_kwh: number;
  delivered_energy_kwh: number;
  charge_rate_kw: number;
  priority_score: number;
  created_tick: number;
  started_tick?: number | null;
  completed_tick?: number | null;
}

export interface ApiEvent {
  id: string;
  tick: number;
  timestamp: string;
  type: string;
  severity: string;
  message: string;
}

export interface ApiDispatchDecision {
  vehicle_id: string | null;
  session_id: string | null;
  selected_robot_id: string | null;
  selected_score: number | null;
  distance_meters: number | null;
  eta_seconds: number | null;
  reasons: string[];
  rejected_robots: Array<{ robot_id: string; reason: string }>;
  job_priority_reasons: string[];
  route: ApiPosition[];
}

export interface ApiMetrics {
  fleet_online: number;
  robots_available: number;
  jobs_active: number;
  queue_depth: number;
  cars_in_garage: number;
  energy_today_kwh: number;
  average_eta_seconds: number | null;
  dock_occupancy: string;
  faults_today: number;
  missed_requests: number;
}

export interface ApiSystemState {
  demo_mode: string;
  tick: number;
  vehicles: ApiVehicle[];
  robots: ApiRobot[];
  parking_spots: ApiParkingSpot[];
  dock_bays: ApiDockBay[];
  sessions: ApiSession[];
  events: ApiEvent[];
  metrics: ApiMetrics;
  last_decision: ApiDispatchDecision | null;
  blocked_lane_active: boolean;
  auto_dispatch: boolean;
}

export interface ApiWebSocketMessage {
  type: string;
  state: ApiSystemState;
}
