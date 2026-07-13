import type { ApiSystemState } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const REQUEST_TIMEOUT_MS = 8000;

async function readError(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as { detail?: unknown };
    if (typeof parsed.detail === "string") return parsed.detail;
    if (Array.isArray(parsed.detail)) {
      return parsed.detail.map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "msg" in item) {
          return String((item as { msg: unknown }).msg);
        }
        return JSON.stringify(item);
      }).join("; ");
    }
  } catch {
    // fall through
  }
  return text || `Request failed: ${response.status}`;
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Backend request timed out. Is the API running on port 8000?");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function post(path: string, body?: unknown): Promise<ApiSystemState> {
  const response = await fetchWithTimeout(`${API_URL}${path}`, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return response.json();
}

export async function fetchState(): Promise<ApiSystemState> {
  const response = await fetchWithTimeout(`${API_URL}/api/state`);
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

export const api = {
  startDemo: () => post("/api/demo/start"),
  pauseDemo: () => post("/api/demo/pause"),
  resumeDemo: () => post("/api/demo/resume"),
  endDemo: () => post("/api/demo/end"),
  resetDemo: () => post("/api/demo/reset"),
  createJob: (vehicleId: string, requestedEnergyKwh?: number) =>
    post("/api/jobs", {
      vehicle_id: vehicleId,
      ...(requestedEnergyKwh != null ? { requested_energy_kwh: requestedEnergyKwh } : {}),
    }),
  dispatchVehicle: (vehicleId: string) => post(`/api/dispatch/${vehicleId}`),
  faultRobot: (robotId: string, faultType = "connector_timeout") =>
    post(`/api/robots/${robotId}/fault`, { fault_type: faultType }),
  clearFault: (robotId: string) => post(`/api/robots/${robotId}/clear-fault`),
  toggleDispatch: () => post("/api/dispatch/toggle"),
};

export function getWsUrl(): string {
  return process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000/ws/telemetry";
}

export function isBackendEnabled(): boolean {
  return process.env.NEXT_PUBLIC_USE_BACKEND === "true";
}
