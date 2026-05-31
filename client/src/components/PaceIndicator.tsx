import type { TripPace } from "@shared/types";

interface PaceIndicatorProps {
  pace: TripPace;
  averageItemsPerDay: number;
}

const paceTargets: Record<TripPace, number> = {
  relaxed: 2,
  balanced: 3,
  packed: 4,
};

export function PaceIndicator({ pace, averageItemsPerDay }: PaceIndicatorProps) {
  const target = paceTargets[pace];
  const delta = averageItemsPerDay - target;
  const status = delta > 0.5 ? "Ahead" : delta < -0.5 ? "Underbooked" : "On target";

  return (
    <section aria-labelledby="pace-indicator-heading" className="stat-card">
      <div className="stat-header">
        <h2 id="pace-indicator-heading">Pace Indicator</h2>
        <span className="badge">{status}</span>
      </div>

      <p className="stat-value">
        {averageItemsPerDay.toFixed(1)} / {target}
      </p>
      <p className="subtle-text">
        Planned for a <strong>{pace}</strong> travel pace.
      </p>

      <div aria-hidden="true" className="pace-bars">
        {Array.from({ length: 4 }, (_, index) => (
          <span className={index < Math.round(averageItemsPerDay) ? "filled" : ""} key={index} />
        ))}
      </div>
    </section>
  );
}
