import type { AccessibilityNeed, Experience, ItineraryDay, ItineraryItem, UpdateEvent } from "@shared/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Modal } from "../components/Modal";
import { PaceIndicator } from "../components/PaceIndicator";
import { TripMap, isAccessibilityMatch } from "../components/TripMap";
import { useAuth } from "../hooks/useAuth";
import { useRealtimeTripEvents } from "../hooks/useRealtimeTripEvents";
import { useToasts } from "../components/ToastProvider";
import { formatCurrency, formatDateLabel, formatMinutes, formatTimeLabel, toDestinationKey } from "../lib/formatters";
import type { SimulatedEventDraft } from "../types/api";

function defaultEventDraft(): SimulatedEventDraft {
  return {
    type: "weather",
    severity: "warning",
    affectedItemId: "",
    payloadJson: JSON.stringify({ closed: true, note: "Storm alert near the waterfront." }, null, 2),
    adminKey: "",
  };
}

export function TripDashboardPage() {
  const { tripId = "" } = useParams();
  const { apiClient, accessToken } = useAuth();
  const { pushToast } = useToasts();
  const queryClient = useQueryClient();
  const [activeDayNumber, setActiveDayNumber] = useState<number>(1);
  const [showEventModal, setShowEventModal] = useState(false);
  const [eventDraft, setEventDraft] = useState<SimulatedEventDraft>(defaultEventDraft);
  const [eventErrors, setEventErrors] = useState<Record<string, string>>({});
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);
  const [events, setEvents] = useState<UpdateEvent[]>([]);
  const [selectedAccessibilityNeeds, setSelectedAccessibilityNeeds] = useState<AccessibilityNeed[]>([]);

  const tripQuery = useQuery({
    queryKey: ["trip", tripId],
    enabled: tripId.length > 0,
    queryFn: async () => {
      const response = await apiClient.getTrip(tripId);
      return response.trip;
    },
  });

  useEffect(() => {
    if (tripQuery.data?.itinerary.days[0]) {
      setActiveDayNumber((current) => current || tripQuery.data.itinerary.days[0].dayNumber);
    }
  }, [tripQuery.data]);

  useEffect(() => {
    if (tripQuery.data) {
      setSelectedAccessibilityNeeds(tripQuery.data.preferences.accessibilityNeeds);
    }
  }, [tripQuery.data]);

  const destinationKey = tripQuery.data
    ? toDestinationKey(tripQuery.data.constraints.destinations[0]?.city ?? "", tripQuery.data.constraints.destinations[0]?.country ?? "")
    : undefined;

  const experiencesQuery = useQuery({
    queryKey: ["experiences", destinationKey],
    enabled: Boolean(destinationKey),
    queryFn: async () => {
      const response = await apiClient.listExperiences({
        destinationKey,
        pageSize: 50,
        accessibleOnly: false,
      });
      return response.items;
    },
  });

  const experienceLookup = useMemo(
    () =>
      new Map(
        (experiencesQuery.data ?? []).map((experience: Experience) => [
          experience.id,
          {
            wheelchairAccessible: experience.accessibility.wheelchairAccessible,
            stepFree: experience.accessibility.stepFree,
            lowVisionSupport: experience.accessibility.lowVisionSupport,
            hearingSupport: experience.accessibility.hearingSupport,
          },
        ])
      ),
    [experiencesQuery.data]
  );

  const deferredAccessibilityNeeds = useDeferredValue(selectedAccessibilityNeeds);
  const filteredDays = useMemo(() => {
    if (!tripQuery.data) {
      return [];
    }

    return tripQuery.data.itinerary.days.map((day) => ({
      ...day,
      items: day.items.filter((item) => isAccessibilityMatch(item, deferredAccessibilityNeeds, experienceLookup)),
    }));
  }, [deferredAccessibilityNeeds, experienceLookup, tripQuery.data]);

  const replanMutation = useMutation({
    mutationFn: async (targetDayNumber?: number) => apiClient.replanTrip(tripId, { targetDayNumber }),
    onSuccess: async (response) => {
      startTransition(() => {
        void queryClient.invalidateQueries({ queryKey: ["trip", tripId] });
      });
      pushToast({
        title: "Trip replanned",
        description:
          response.replannedAt && typeof response.replannedAt === "string"
            ? `Updated itinerary revision ${response.trip.itinerary.revision} is ready.`
            : "The itinerary has been refreshed.",
        severity: "success",
      });
    },
  });

  const injectMutation = useMutation({
    mutationFn: async () => {
      const nextErrors: Record<string, string> = {};
      if (!eventDraft.payloadJson.trim()) {
        nextErrors.payloadJson = "Payload JSON is required.";
      }

      let payload: Record<string, unknown> = {};
      try {
        payload = JSON.parse(eventDraft.payloadJson) as Record<string, unknown>;
      } catch {
        nextErrors.payloadJson = "Payload JSON must be valid.";
      }

      setEventErrors(nextErrors);
      if (Object.keys(nextErrors).length > 0) {
        throw new Error("Validation failed.");
      }

      return apiClient.injectTripEvent(tripId, {
        type: eventDraft.type,
        severity: eventDraft.severity,
        affectedItemId: eventDraft.affectedItemId || undefined,
        payload,
        adminKey: eventDraft.adminKey || undefined,
      });
    },
    onSuccess: () => {
      pushToast({
        title: "Simulated update sent",
        description: "The event was injected into the realtime stream.",
        severity: "success",
      });
      setShowEventModal(false);
      setEventDraft(defaultEventDraft());
    },
  });

  useRealtimeTripEvents({
    tripId,
    enabled: Boolean(tripId && accessToken),
    onEvent: (event) => {
      setEvents((current) => [event, ...current].slice(0, 12));
      setHighlightedItemId(event.affectedItemId ?? null);
      void queryClient.invalidateQueries({ queryKey: ["trip", tripId] });

      const affectedDayNumber = findAffectedDayNumber(tripQuery.data?.itinerary.days ?? [], event.affectedItemId);
      pushToast({
        title: eventTitle(event),
        description: eventDescription(event),
        severity: event.severity,
        action:
          affectedDayNumber !== null
            ? {
                label: "Re-plan affected day",
                onAction: async () => {
                  await replanMutation.mutateAsync(affectedDayNumber);
                },
              }
            : undefined,
      });
    },
  });

  if (tripQuery.isLoading) {
    return (
      <div className="page-shell">
        <div className="skeleton-block tall" />
      </div>
    );
  }

  if (!tripQuery.data) {
    return (
      <div className="page-shell">
        <section className="panel">
          <h2>Trip not found</h2>
          <p>The requested trip could not be loaded.</p>
        </section>
      </div>
    );
  }

  const trip = tripQuery.data;
  const activeDay = filteredDays.find((day) => day.dayNumber === activeDayNumber) ?? filteredDays[0];
  const averageItemsPerDay =
    trip.itinerary.days.reduce((sum, day) => sum + day.items.length, 0) / Math.max(trip.itinerary.days.length, 1);

  return (
    <div className="dashboard-grid">
      <section className="panel timeline-panel">
        <header className="panel-header">
          <div>
            <p className="eyebrow">Trip Dashboard</p>
            <h2>{trip.title}</h2>
            <p className="subtle-text">{trip.summary}</p>
          </div>
          <button className="ghost-button" onClick={() => setShowEventModal(true)} type="button">
            Simulate update
          </button>
        </header>

        <div className="stats-grid">
          <article className="stat-card">
            <h2>Budget Tracking</h2>
            <p className="stat-value">
              {formatCurrency(trip.itinerary.totalEstimatedCost, trip.constraints.budgetCap.currency)}
            </p>
            <p className="subtle-text">
              of {formatCurrency(trip.constraints.budgetCap.amount, trip.constraints.budgetCap.currency)}
            </p>
            <div aria-hidden="true" className="budget-meter">
              <span
                style={{
                  width: `${Math.min((trip.itinerary.totalEstimatedCost / trip.constraints.budgetCap.amount) * 100, 100)}%`,
                }}
              />
            </div>
          </article>

          <article className="stat-card">
            <h2>Transit Budget</h2>
            <p className="stat-value">{formatMinutes(trip.itinerary.totalTransitMinutes)}</p>
            <p className="subtle-text">Max per day: {formatMinutes(trip.constraints.maxDailyTravelMinutes)}</p>
          </article>

          <PaceIndicator averageItemsPerDay={averageItemsPerDay} pace={trip.preferences.pace} />
        </div>

        <div className="day-strip" role="tablist" aria-label="Trip days">
          {trip.itinerary.days.map((day) => (
            <button
              aria-current={day.dayNumber === activeDayNumber ? "date" : undefined}
              className={day.dayNumber === activeDayNumber ? "day-button is-active" : "day-button"}
              key={day.dayNumber}
              onClick={() => setActiveDayNumber(day.dayNumber)}
              type="button"
            >
              <span>{formatDateLabel(day.date)}</span>
              <strong>{day.city}</strong>
            </button>
          ))}
        </div>

        <section aria-labelledby="accessibility-filter-heading" className="filter-panel">
          <h2 id="accessibility-filter-heading">Accessibility filters</h2>
          <p className="subtle-text">
            These come directly from your stored planning preferences so you can inspect the itinerary through the same accessibility lens you planned with.
          </p>
          <div className="chip-grid">
            {trip.preferences.accessibilityNeeds.length === 0 ? (
              <span className="plain-chip">No additional accessibility filters are active.</span>
            ) : (
              trip.preferences.accessibilityNeeds.map((need) => (
                <label className="chip-option" key={need}>
                  <input
                    checked={selectedAccessibilityNeeds.includes(need)}
                    onChange={(event) =>
                      setSelectedAccessibilityNeeds((current) =>
                        event.target.checked ? [...current, need] : current.filter((item) => item !== need)
                      )
                    }
                    type="checkbox"
                  />
                  <span>{need}</span>
                </label>
              ))
            )}
          </div>
        </section>

        <div className="timeline-list" role="list">
          {activeDay ? (
            activeDay.items.map((item) => (
              <article
                className={item.id === highlightedItemId ? "timeline-card is-highlighted" : "timeline-card"}
                key={item.id}
                role="listitem"
              >
                <div className="timeline-time">
                  <strong>{formatTimeLabel(item.startTime)}</strong>
                  <span>{formatTimeLabel(item.endTime)}</span>
                </div>
                <div className="timeline-body">
                  <h3>{item.title}</h3>
                  <p className="subtle-text">
                    {item.location.label} · {formatCurrency(item.estimatedCost, item.currency)} · {formatMinutes(durationForItem(item))}
                  </p>
                  <div className="tag-row">
                    {item.tags.map((tag) => (
                      <span className="tag" key={tag}>
                        {tag}
                      </span>
                    ))}
                    {item.transportMode ? <span className="tag">{item.transportMode}</span> : null}
                  </div>
                  {item.notes ? <p className="subtle-text">{item.notes}</p> : null}
                </div>
              </article>
            ))
          ) : (
            <p>No itinerary items match the current accessibility filter.</p>
          )}
        </div>
      </section>

      <aside className="dashboard-aside">
        <TripMap activeDayNumber={activeDayNumber} days={trip.itinerary.days} highlightedItemId={highlightedItemId} />

        <section className="panel realtime-panel">
          <header className="panel-header compact">
            <div>
              <h2>Realtime panel</h2>
              <p className="subtle-text">SSE subscription for trip update events.</p>
            </div>
            <span className="badge">{events.length > 0 ? "Live" : "Waiting"}</span>
          </header>

          <ul className="event-list">
            {events.length === 0 ? (
              <li className="subtle-text">No events have arrived yet. Use the simulator to drive the demo.</li>
            ) : (
              events.map((event) => {
                const affectedDayNumber = findAffectedDayNumber(trip.itinerary.days, event.affectedItemId);

                return (
                  <li className={`event-card severity-${event.severity}`} key={event.id}>
                    <div className="event-meta">
                      <strong>{event.type}</strong>
                      <span>{event.severity}</span>
                    </div>
                    <p>{eventDescription(event)}</p>
                    <p className="subtle-text">{new Date(event.createdAt).toLocaleString()}</p>
                    {affectedDayNumber !== null ? (
                      <button
                        className="ghost-button"
                        onClick={() => void replanMutation.mutateAsync(affectedDayNumber)}
                        type="button"
                      >
                        Re-plan affected day
                      </button>
                    ) : null}
                  </li>
                );
              })
            )}
          </ul>
        </section>
      </aside>

      {showEventModal ? (
        <Modal
          description="Inject a weather, closure, delay, availability, or price change event into the current trip."
          onClose={() => setShowEventModal(false)}
          title="Simulate realtime update"
        >
          <form
            className="stacked-form"
            onSubmit={(event) => {
              event.preventDefault();
              void injectMutation.mutateAsync();
            }}
          >
            <div className="grid-two">
              <div className="field-group">
                <label htmlFor="event-type">Event type</label>
                <select
                  id="event-type"
                  onChange={(event) => setEventDraft((current) => ({ ...current, type: event.target.value as UpdateEvent["type"] }))}
                  value={eventDraft.type}
                >
                  <option value="weather">Weather</option>
                  <option value="priceChange">Price change</option>
                  <option value="closure">Closure</option>
                  <option value="availability">Availability</option>
                  <option value="delay">Delay</option>
                </select>
              </div>

              <div className="field-group">
                <label htmlFor="event-severity">Severity</label>
                <select
                  id="event-severity"
                  onChange={(event) =>
                    setEventDraft((current) => ({ ...current, severity: event.target.value as UpdateEvent["severity"] }))
                  }
                  value={eventDraft.severity}
                >
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
            </div>

            <div className="field-group">
              <label htmlFor="affected-item">Affected itinerary item</label>
              <select
                id="affected-item"
                onChange={(event) => setEventDraft((current) => ({ ...current, affectedItemId: event.target.value }))}
                value={eventDraft.affectedItemId}
              >
                <option value="">No specific item</option>
                {trip.itinerary.days.flatMap((day) =>
                  day.items.map((item) => (
                    <option key={item.id} value={item.id}>
                      Day {day.dayNumber}: {item.title}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="field-group">
              <label htmlFor="payload-json">Payload JSON</label>
              <textarea
                aria-describedby={eventErrors.payloadJson ? "payload-json-error" : "payload-json-help"}
                aria-invalid={Boolean(eventErrors.payloadJson)}
                id="payload-json"
                onChange={(event) => setEventDraft((current) => ({ ...current, payloadJson: event.target.value }))}
                rows={8}
                value={eventDraft.payloadJson}
              />
              <p className="field-help" id="payload-json-help">
                Example: {"{"}"closed": true, "delayMinutes": 90{"}"}
              </p>
              {eventErrors.payloadJson ? (
                <p className="field-error" id="payload-json-error">
                  {eventErrors.payloadJson}
                </p>
              ) : null}
            </div>

            <div className="field-group">
              <label htmlFor="admin-key">Admin key (optional for local demos)</label>
              <input
                id="admin-key"
                onChange={(event) => setEventDraft((current) => ({ ...current, adminKey: event.target.value }))}
                value={eventDraft.adminKey}
              />
            </div>

            <div className="button-row">
              <button className="ghost-button" onClick={() => setShowEventModal(false)} type="button">
                Cancel
              </button>
              <button className="primary-button" disabled={injectMutation.isPending} type="submit">
                {injectMutation.isPending ? "Sending..." : "Inject event"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

function durationForItem(item: ItineraryItem) {
  return Math.max((new Date(item.endTime).getTime() - new Date(item.startTime).getTime()) / 60000, 0);
}

function findAffectedDayNumber(days: ItineraryDay[], affectedItemId?: string) {
  if (!affectedItemId) {
    return null;
  }

  for (const day of days) {
    if (day.items.some((item) => item.id === affectedItemId)) {
      return day.dayNumber;
    }
  }

  return null;
}

function eventTitle(event: UpdateEvent) {
  return `${event.type} update`;
}

function eventDescription(event: UpdateEvent) {
  if (typeof event.payload.note === "string") {
    return event.payload.note;
  }

  switch (event.type) {
    case "closure":
      return "A planned stop has closed and may require replanning.";
    case "priceChange":
      return "Pricing changed for a scheduled part of the itinerary.";
    case "weather":
      return "Weather conditions changed near one of your planned stops.";
    case "availability":
      return "Availability changed for one of your itinerary items.";
    case "delay":
      return "Transit timing changed and may affect this day.";
    default:
      return "A new trip update arrived.";
  }
}
