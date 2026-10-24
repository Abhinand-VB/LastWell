"use client";
// Live list of alerts for the stroke-team board: `board` scope on /ws/ui, polling
// GET /api/alerts?sinceHours=24 every 1.5 s while the socket is down.
import { useEffect, useState } from "react";
import type { AlertSummary } from "@lastwell/core";
import { applyBoardMessage, sortAlerts } from "@/lib/callState";
import { gateway } from "@/lib/gateway";
import { UiSocket, type SocketStatus } from "@/lib/ws";
import { wsUrl } from "@/lib/config";
import { connectionFrom, POLL_EVERY_MS, type ConnectionStatus } from "./useCall";

export function useBoard(): {
  alerts: AlertSummary[];
  connection: ConnectionStatus;
  setAlert: (a: AlertSummary) => void;
} {
  const [alerts, setAlerts] = useState<AlertSummary[]>([]);
  const [socket, setSocket] = useState<SocketStatus>("connecting");

  useEffect(() => {
    const s = new UiSocket({
      url: wsUrl(),
      getToken: async () => (await gateway.wsToken()).token,
      subscriptions: [{ type: "subscribe", scope: "board" }],
      onMessage: (msg) => setAlerts((prev) => applyBoardMessage(prev, msg)),
      onStatus: setSocket,
    });
    s.start();
    return () => s.stop();
  }, []);

  useEffect(() => {
    if (socket !== "down") return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await gateway.listAlerts(24);
        if (!cancelled) setAlerts(sortAlerts(res.alerts));
      } catch {
        // keep the last list; the badge already says "polling"
      }
    };
    void poll();
    const timer = setInterval(poll, POLL_EVERY_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [socket]);

  const setAlert = (a: AlertSummary) => setAlerts((prev) => applyBoardMessage(prev, { type: "alert.updated", alert: a }));
  return { alerts, connection: connectionFrom(socket), setAlert };
}
