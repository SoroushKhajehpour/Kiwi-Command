"use client";

import { useEffect, useRef, useState } from "react";
import { getWsUrl } from "./client";
import { mapSystemState, type MappedTelemetry } from "./mappers";
import type { ApiWebSocketMessage } from "./types";

export interface TelemetryState extends MappedTelemetry {
  connected: boolean;
}

const EMPTY: TelemetryState = {
  connected: false,
  demoMode: "idle",
  vehicles: [],
  robots: [],
  sessions: [],
  events: [],
  spots: [],
  dockBays: [],
  energyToday: 0,
  lastDecision: null,
  laneBlocked: false,
  missedCount: 0,
  tick: 0,
  autoDispatch: true,
  jobPriorityReasons: [],
};

const UI_COMMIT_MS = 100;

/** Module singleton — Strict Mode remounts must not open parallel sockets. */
let sharedSocket: WebSocket | null = null;
let sharedListeners = 0;
let sharedReconnectTimer: ReturnType<typeof setTimeout> | null = null;

export function useTelemetry(enabled: boolean): TelemetryState {
  const [state, setState] = useState<TelemetryState>(EMPTY);
  const pendingRef = useRef<TelemetryState | null>(null);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) {
      setState(EMPTY);
      pendingRef.current = null;
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      return;
    }

    let cancelled = false;
    sharedListeners += 1;

    const flushPending = () => {
      flushTimerRef.current = null;
      if (cancelled || !pendingRef.current) return;
      setState(pendingRef.current);
      pendingRef.current = null;
    };

    const queueState = (next: TelemetryState) => {
      pendingRef.current = next;
      if (!flushTimerRef.current) {
        flushTimerRef.current = setTimeout(flushPending, UI_COMMIT_MS);
      }
    };

    const scheduleReconnect = () => {
      if (cancelled || sharedReconnectTimer) return;
      sharedReconnectTimer = setTimeout(() => {
        sharedReconnectTimer = null;
        if (!cancelled) connect();
      }, 2500);
    };

    const connect = () => {
      if (cancelled) return;
      if (sharedSocket && (sharedSocket.readyState === WebSocket.OPEN || sharedSocket.readyState === WebSocket.CONNECTING)) {
        return;
      }

      if (sharedSocket) {
        try {
          sharedSocket.onclose = null;
          sharedSocket.onerror = null;
          sharedSocket.onmessage = null;
          sharedSocket.close();
        } catch {
          // ignore
        }
        sharedSocket = null;
      }

      const socket = new WebSocket(getWsUrl());
      sharedSocket = socket;

      socket.onopen = () => {
        if (!cancelled) setState((prev) => ({ ...prev, connected: true }));
      };

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as ApiWebSocketMessage;
          if (message.type !== "state" || !message.state) return;
          const mapped = mapSystemState(message.state);
          queueState({ ...mapped, connected: true });
        } catch {
          // ignore malformed payloads
        }
      };

      socket.onclose = () => {
        if (sharedSocket === socket) sharedSocket = null;
        if (!cancelled) {
          setState((prev) => ({ ...prev, connected: false }));
          scheduleReconnect();
        }
      };

      socket.onerror = () => {
        try {
          socket.close();
        } catch {
          // ignore
        }
      };
    };

    connect();

    return () => {
      cancelled = true;
      sharedListeners = Math.max(0, sharedListeners - 1);
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      if (sharedReconnectTimer) {
        clearTimeout(sharedReconnectTimer);
        sharedReconnectTimer = null;
      }
      if (sharedListeners === 0 && sharedSocket) {
        const socket = sharedSocket;
        sharedSocket = null;
        socket.onclose = null;
        socket.close();
      }
    };
  }, [enabled]);

  return state;
}
