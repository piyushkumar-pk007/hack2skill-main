import type { ItineraryDay, ItineraryItem } from "@shared/types";

interface TripMapProps {
  days: ItineraryDay[];
  activeDayNumber: number;
  highlightedItemId?: string | null;
}

function flattenItems(days: ItineraryDay[]) {
  return days.flatMap((day) => day.items.map((item) => ({ ...item, date: day.date })));
}

function normalizeCoordinate(value: number, min: number, max: number) {
  if (max === min) {
    return 50;
  }

  return 10 + ((value - min) / (max - min)) * 80;
}

export function TripMap({ days, activeDayNumber, highlightedItemId }: TripMapProps) {
  const items = flattenItems(days);
  const lngs = items.map((item) => item.location.coordinates[0]);
  const lats = items.map((item) => item.location.coordinates[1]);
  const minLng = Math.min(...lngs, 0);
  const maxLng = Math.max(...lngs, 1);
  const minLat = Math.min(...lats, 0);
  const maxLat = Math.max(...lats, 1);

  return (
    <figure className="map-card">
      <figcaption>
        <h2>Route Map</h2>
        <p className="subtle-text">Visual route preview with a text-list fallback directly below the map.</p>
      </figcaption>

      <svg aria-hidden="true" className="trip-map" viewBox="0 0 100 100">
        <defs>
          <linearGradient id="route-gradient" x1="0%" x2="100%" y1="0%" y2="100%">
            <stop offset="0%" stopColor="#117864" />
            <stop offset="100%" stopColor="#d97706" />
          </linearGradient>
        </defs>

        <rect fill="rgba(255,255,255,0.78)" height="100" rx="10" width="100" x="0" y="0" />

        {items.slice(1).map((item, index) => {
          const previous = items[index];
          return (
            <line
              key={`${previous.id}-${item.id}`}
              stroke="url(#route-gradient)"
              strokeLinecap="round"
              strokeWidth={item.dayNumber === activeDayNumber ? 1.8 : 1.2}
              x1={normalizeCoordinate(previous.location.coordinates[0], minLng, maxLng)}
              x2={normalizeCoordinate(item.location.coordinates[0], minLng, maxLng)}
              y1={100 - normalizeCoordinate(previous.location.coordinates[1], minLat, maxLat)}
              y2={100 - normalizeCoordinate(item.location.coordinates[1], minLat, maxLat)}
            />
          );
        })}

        {items.map((item) => {
          const isActiveDay = item.dayNumber === activeDayNumber;
          const isHighlighted = item.id === highlightedItemId;

          return (
            <circle
              cx={normalizeCoordinate(item.location.coordinates[0], minLng, maxLng)}
              cy={100 - normalizeCoordinate(item.location.coordinates[1], minLat, maxLat)}
              fill={isHighlighted ? "#b91c1c" : isActiveDay ? "#0f766e" : "#475569"}
              key={item.id}
              r={isHighlighted ? 2.6 : isActiveDay ? 2.2 : 1.6}
            />
          );
        })}
      </svg>

      <ol className="map-fallback-list">
        {days.map((day) => (
          <li key={day.dayNumber}>
            <strong>{day.city}</strong> on {day.date}: {day.items.map((item) => item.title).join(", ") || "No scheduled items"}
          </li>
        ))}
      </ol>
    </figure>
  );
}

export function isAccessibilityMatch(
  item: ItineraryItem,
  filters: string[],
  experienceLookup: Map<string, { wheelchairAccessible: boolean; stepFree: boolean; lowVisionSupport: boolean; hearingSupport: boolean }>
) {
  if (filters.length === 0) {
    return true;
  }

  const experience = item.experienceId ? experienceLookup.get(item.experienceId) : undefined;
  if (!experience) {
    return true;
  }

  return filters.every((filter) => {
    switch (filter) {
      case "wheelchair":
        return experience.wheelchairAccessible;
      case "step-free":
        return experience.stepFree;
      case "low-vision":
        return experience.lowVisionSupport;
      case "hearing-support":
        return experience.hearingSupport;
      case "sensory-friendly":
        return true;
      default:
        return true;
    }
  });
}
