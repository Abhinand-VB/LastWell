"use client";
// Live view of one call (docs/01 §7, docs/03 §5): WebSocket first; while it is down, poll
// GET /api/calls/:id every 1.5 s (degraded mode, status "polling").
import { useEffect, useReducer, useState } from "react";
import type { UiServerMessage } from "@lastwell/core";
import { applyMessage, emptyCallView, type CallView } from "@/lib/callState";
import { gateway } from "@/lib/gateway";
import { UiSocket, type SocketStatus } from "@/lib/ws";
import { wsUrl } from "@/lib/config";

export type ConnectionStatus = "connecting" | "live" | "polling";
export const POLL_EVERY_MS = 1500;

type Action = { kind: "msg"; msg: UiServerMessage } | { kind: "reset"; callId: string };

function reducer(view: CallView, action: Action): CallView {
  if (action.kind === "reset") return emptyCallView(action.callId);
  return applyMessage(view, action.msg);
}

export function connectionFrom(socket: SocketStatus): ConnectionStatus {
  return socket === "down" ? "polling" : socket;
}

export function useCall(callId: string): CallView & { connection: ConnectionStatus; notFound: boolean } {
  const [view, dispatch] = useReducer(reducer, callId, emptyCallView);
  const [socket, setSocket] = useState<SocketStatus>("connecting");
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    dispatch({ kind: "reset", callId });
    setNotFound(false);
    const s = new UiSocket({
      url: wsUrl(),
      getToken: async () => (await gateway.wsToken()).token,
      subscriptions: [{ type: "subscribe", scope: "call", callId }],
      onMessage: (msg) => {
        if (msg.type === "error" && msg.code === "unknown_call") setNotFound(true);
        dispatch({ kind: "msg", msg });
      },
      onStatus: setSocket,
    });
    s.start();
    return () => s.stop();
  }, [callId]);

  useEffect(() => {
    if (socket !== "down") return;
    let cancelled = false;
    const poll = async () => {
      try {
        const snap = await gateway.getCall(callId);
        if (!cancelled) dispatch({ kind: "msg", msg: { type: "snapshot", ...snap } });
      } catch (err) {
        if (!cancelled && (err as { status?: number }).status === 404) setNotFound(true);
      }
    };
    void poll();
    const timer = setInterval(poll, POLL_EVERY_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [socket, callId]);

  return { ...view, connection: connectionFrom(socket), notFound };
}
