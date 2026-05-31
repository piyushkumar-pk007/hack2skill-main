import { startTransition, useEffect, useEffectEvent, useRef, useState } from "react";
import type { UpdateEvent } from "@shared/types";
import { useAuth } from "./useAuth";

interface UseRealtimeTripEventsOptions {
  tripId: string;
  enabled: boolean;
  onEvent: (event: UpdateEvent) => void;
}

export function useRealtimeTripEvents({ tripId, enabled, onEvent }: UseRealtimeTripEventsOptions) {
  const { accessToken, refreshAccessToken, apiClient } = useAuth();
  const [connectionState, setConnectionState] = useState<"idle" | "connecting" | "open" | "error">("idle");
  const lastEventIdRef = useRef<string | null>(null);

  const handleEvent = useEffectEvent((event: UpdateEvent) => {
    lastEventIdRef.current = event.id;
    startTransition(() => onEvent(event));
  });

  useEffect(() => {
    if (!enabled || !tripId || !accessToken) {
      setConnectionState("idle");
      return undefined;
    }

    let isClosed = false;
    let eventSource: EventSource | null = null;

    const connect = async () => {
      setConnectionState("connecting");
      const token = accessToken ?? (await refreshAccessToken());
      if (!token || isClosed) {
        setConnectionState("error");
        return;
      }

      const url = apiClient.getTripEventsUrl(tripId, token);
      eventSource = new EventSource(url, { withCredentials: true });

      eventSource.addEventListener("open", () => {
        setConnectionState("open");
      });

      eventSource.addEventListener("update", (message) => {
        const payload = JSON.parse((message as MessageEvent<string>).data) as UpdateEvent;
        handleEvent(payload);
      });

      eventSource.addEventListener("error", async () => {
        if (isClosed) {
          return;
        }

        setConnectionState("error");
        eventSource?.close();
        const refreshedToken = await refreshAccessToken();
        if (!refreshedToken || isClosed) {
          return;
        }

        window.setTimeout(() => {
          if (!isClosed) {
            void connect();
          }
        }, 1_500);
      });
    };

    void connect();

    return () => {
      isClosed = true;
      eventSource?.close();
    };
  }, [accessToken, apiClient, enabled, handleEvent, refreshAccessToken, tripId]);

  return {
    connectionState,
    lastEventId: lastEventIdRef.current,
  };
}
