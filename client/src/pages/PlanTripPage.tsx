import type { AccessibilityNeed, ExperienceCategory, GeoPoint, Preferences, PreferredTransport } from "@shared/types";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiClientError } from "../lib/api";
import { STORAGE_KEYS } from "../lib/config";
import { useAuth } from "../hooks/useAuth";
import { useToasts } from "../components/ToastProvider";
import type { PlannerDraft, PlannerLocationDraft } from "../types/api";

const interestOptions: Array<{ value: ExperienceCategory; label: string }> = [
  { value: "culture", label: "Culture" },
  { value: "food", label: "Food" },
  { value: "nature", label: "Nature" },
  { value: "nightlife", label: "Nightlife" },
  { value: "wellness", label: "Wellness" },
  { value: "adventure", label: "Adventure" },
  { value: "family", label: "Family" },
  { value: "shopping", label: "Shopping" },
  { value: "history", label: "History" },
];

const accessibilityOptions: Array<{ value: AccessibilityNeed; label: string }> = [
  { value: "wheelchair", label: "Wheelchair access" },
  { value: "step-free", label: "Step-free routes" },
  { value: "low-vision", label: "Low-vision support" },
  { value: "hearing-support", label: "Hearing support" },
  { value: "sensory-friendly", label: "Sensory-friendly pacing" },
];

const transportOptions: Array<{ value: PreferredTransport; label: string }> = [
  { value: "walk", label: "Walk" },
  { value: "tram", label: "Tram" },
  { value: "metro", label: "Metro" },
  { value: "bus", label: "Bus" },
  { value: "train", label: "Train" },
  { value: "taxi", label: "Taxi" },
  { value: "ferry", label: "Ferry" },
  { value: "rideshare", label: "Rideshare" },
  { value: "bike", label: "Bike" },
];

const wizardSteps = ["Who", "When & Budget", "Interests", "Accessibility"] as const;

function createLocationDraft(overrides: Partial<PlannerLocationDraft> = {}): PlannerLocationDraft {
  return {
    id: Math.random().toString(16).slice(2, 10),
    label: overrides.label ?? "Lisbon Center",
    city: overrides.city ?? "Lisbon",
    country: overrides.country ?? "Portugal",
    countryCode: overrides.countryCode ?? "PT",
    lng: overrides.lng ?? "-9.1393",
    lat: overrides.lat ?? "38.7223",
  };
}

function defaultPlannerDraft(): PlannerDraft {
  return {
    title: "Lisbon Long Weekend",
    summary: "A balanced city break with culture, food, and accessible routing in mind.",
    preferences: {
      interests: ["culture", "food", "history"],
      pace: "balanced",
      travelStyle: "comfort",
      dietary: ["vegetarian"],
      accessibilityNeeds: ["step-free"],
      preferredTransport: ["walk", "metro"],
    },
    constraints: {
      startDate: "2026-07-10",
      endDate: "2026-07-13",
      budgetAmount: "1400",
      currency: "EUR",
      partySize: "2",
      origin: createLocationDraft({
        label: "Lisbon Airport",
        city: "Lisbon",
        country: "Portugal",
        countryCode: "PT",
        lng: "-9.1359",
        lat: "38.7742",
      }),
      destinations: [createLocationDraft()],
      maxDailyTravelMinutes: "120",
      mustInclude: "museum,tram",
      mustAvoidTags: "stairs-only",
      mobilityLimit: "limited-walking",
    },
  };
}

function readStoredDraft() {
  const raw = localStorage.getItem(STORAGE_KEYS.plannerDraft);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as PlannerDraft;
  } catch {
    localStorage.removeItem(STORAGE_KEYS.plannerDraft);
    return null;
  }
}

function toGeoPoint(location: PlannerLocationDraft): GeoPoint {
  return {
    type: "Point",
    label: location.label,
    city: location.city,
    country: location.country,
    countryCode: location.countryCode,
    coordinates: [Number(location.lng), Number(location.lat)],
  };
}

function parseList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function PlanTripPage() {
  const navigate = useNavigate();
  const { apiClient, rememberTrip, user } = useAuth();
  const { pushToast } = useToasts();
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<PlannerDraft>(() => readStoredDraft() ?? defaultPlannerDraft());
  const liveRegionId = useId();

  const preferencesQuery = useQuery({
    queryKey: ["preferences"],
    queryFn: () => apiClient.getPreferences(),
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.plannerDraft, JSON.stringify(draft));
  }, [draft]);

  useEffect(() => {
    if (preferencesQuery.data?.preferences) {
      setDraft((current) => ({
        ...current,
        preferences: preferencesQuery.data.preferences,
      }));
    }
  }, [preferencesQuery.data?.preferences]);

  const createTripMutation = useMutation({
    mutationFn: async () => {
      const validation = validateDraft(draft, currentStep);
      setErrors(validation);

      if (Object.keys(validation).length > 0) {
        throw new Error("Validation failed.");
      }

      await apiClient.updatePreferences({
        preferences: draft.preferences,
      });

      return apiClient.createTrip({
        title: draft.title,
        summary: draft.summary,
        constraints: {
          startDate: draft.constraints.startDate,
          endDate: draft.constraints.endDate,
          budgetCap: {
            amount: Number(draft.constraints.budgetAmount),
            currency: draft.constraints.currency,
          },
          partySize: Number(draft.constraints.partySize),
          origin: toGeoPoint(draft.constraints.origin),
          destinations: draft.constraints.destinations.map(toGeoPoint),
          maxDailyTravelMinutes: Number(draft.constraints.maxDailyTravelMinutes),
          mustInclude: parseList(draft.constraints.mustInclude),
          mustAvoidTags: parseList(draft.constraints.mustAvoidTags),
          mobilityLimit: draft.constraints.mobilityLimit,
        },
      });
    },
    onSuccess: (response) => {
      rememberTrip(response.trip.id);
      pushToast({
        title: "Trip generated",
        description: "Your itinerary is ready to review.",
        severity: "success",
      });
      navigate(`/trips/${response.trip.id}`);
    },
  });

  const goNext = () => {
    const validation = validateDraft(draft, currentStep);
    setErrors(validation);

    if (Object.keys(validation).length === 0) {
      setCurrentStep((current) => Math.min(current + 1, wizardSteps.length - 1));
    }
  };

  const accessibilityAnnouncement = `Step ${currentStep + 1} of ${wizardSteps.length}: ${wizardSteps[currentStep]}`;

  return (
    <div className="page-shell wizard-layout">
      <section className="panel wizard-panel">
        <header className="panel-header">
          <div>
            <p className="eyebrow">Trip Setup</p>
            <h2>Preferences &amp; Constraints Wizard</h2>
          </div>
          <p aria-live="polite" className="sr-only" id={liveRegionId}>
            {accessibilityAnnouncement}
          </p>
        </header>

        <ol className="stepper" role="list">
          {wizardSteps.map((label, index) => (
            <li key={label}>
              <button
                aria-current={index === currentStep ? "step" : undefined}
                className={index === currentStep ? "step-button is-active" : "step-button"}
                onClick={() => setCurrentStep(index)}
                type="button"
              >
                <span>{index + 1}</span>
                {label}
              </button>
            </li>
          ))}
        </ol>

        <form
          className="stacked-form"
          onSubmit={(event) => {
            event.preventDefault();

            if (currentStep < wizardSteps.length - 1) {
              goNext();
              return;
            }

            createTripMutation.mutate();
          }}
        >
          {currentStep === 0 ? (
            <>
              <div className="field-group">
                <label htmlFor="title">Trip title</label>
                <input
                  aria-describedby={errors.title ? "title-error" : undefined}
                  aria-invalid={Boolean(errors.title)}
                  id="title"
                  onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                  value={draft.title}
                />
                {errors.title ? (
                  <p className="field-error" id="title-error">
                    {errors.title}
                  </p>
                ) : null}
              </div>

              <div className="field-group">
                <label htmlFor="summary">Trip summary</label>
                <textarea
                  id="summary"
                  onChange={(event) => setDraft((current) => ({ ...current, summary: event.target.value }))}
                  rows={3}
                  value={draft.summary}
                />
              </div>

              <div className="field-group">
                <label htmlFor="partySize">Party size</label>
                <input
                  aria-describedby={errors.partySize ? "partySize-error" : undefined}
                  aria-invalid={Boolean(errors.partySize)}
                  id="partySize"
                  inputMode="numeric"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      constraints: { ...current.constraints, partySize: event.target.value },
                    }))
                  }
                  value={draft.constraints.partySize}
                />
                {errors.partySize ? (
                  <p className="field-error" id="partySize-error">
                    {errors.partySize}
                  </p>
                ) : null}
              </div>

              <LocationFields
                errorPrefix="origin"
                errors={errors}
                label="Origin"
                location={draft.constraints.origin}
                onChange={(nextLocation) =>
                  setDraft((current) => ({
                    ...current,
                    constraints: { ...current.constraints, origin: nextLocation },
                  }))
                }
              />

              <fieldset className="fieldset-block">
                <legend>Destinations</legend>
                {draft.constraints.destinations.map((destination, index) => (
                  <LocationFields
                    errorPrefix={`destination-${index}`}
                    errors={errors}
                    key={destination.id}
                    label={`Destination ${index + 1}`}
                    location={destination}
                    onChange={(nextLocation) =>
                      setDraft((current) => ({
                        ...current,
                        constraints: {
                          ...current.constraints,
                          destinations: current.constraints.destinations.map((item) =>
                            item.id === destination.id ? nextLocation : item
                          ),
                        },
                      }))
                    }
                  />
                ))}

                <div className="button-row">
                  <button
                    className="ghost-button"
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        constraints: {
                          ...current.constraints,
                          destinations: [...current.constraints.destinations, createLocationDraft()],
                        },
                      }))
                    }
                    type="button"
                  >
                    Add destination
                  </button>
                  {draft.constraints.destinations.length > 1 ? (
                    <button
                      className="ghost-button"
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          constraints: {
                            ...current.constraints,
                            destinations: current.constraints.destinations.slice(0, -1),
                          },
                        }))
                      }
                      type="button"
                    >
                      Remove last
                    </button>
                  ) : null}
                </div>
              </fieldset>
            </>
          ) : null}

          {currentStep === 1 ? (
            <>
              <div className="grid-two">
                <div className="field-group">
                  <label htmlFor="startDate">Start date</label>
                  <input
                    aria-describedby={errors.startDate ? "startDate-error" : undefined}
                    aria-invalid={Boolean(errors.startDate)}
                    id="startDate"
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        constraints: { ...current.constraints, startDate: event.target.value },
                      }))
                    }
                    type="date"
                    value={draft.constraints.startDate}
                  />
                  {errors.startDate ? (
                    <p className="field-error" id="startDate-error">
                      {errors.startDate}
                    </p>
                  ) : null}
                </div>

                <div className="field-group">
                  <label htmlFor="endDate">End date</label>
                  <input
                    aria-describedby={errors.endDate ? "endDate-error" : undefined}
                    aria-invalid={Boolean(errors.endDate)}
                    id="endDate"
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        constraints: { ...current.constraints, endDate: event.target.value },
                      }))
                    }
                    type="date"
                    value={draft.constraints.endDate}
                  />
                  {errors.endDate ? (
                    <p className="field-error" id="endDate-error">
                      {errors.endDate}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="grid-two">
                <div className="field-group">
                  <label htmlFor="budgetAmount">Budget cap</label>
                  <input
                    aria-describedby={errors.budgetAmount ? "budgetAmount-error" : undefined}
                    aria-invalid={Boolean(errors.budgetAmount)}
                    id="budgetAmount"
                    inputMode="decimal"
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        constraints: { ...current.constraints, budgetAmount: event.target.value },
                      }))
                    }
                    value={draft.constraints.budgetAmount}
                  />
                  {errors.budgetAmount ? (
                    <p className="field-error" id="budgetAmount-error">
                      {errors.budgetAmount}
                    </p>
                  ) : null}
                </div>

                <div className="field-group">
                  <label htmlFor="currency">Currency</label>
                  <input
                    id="currency"
                    maxLength={3}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        constraints: { ...current.constraints, currency: event.target.value.toUpperCase() },
                      }))
                    }
                    value={draft.constraints.currency}
                  />
                </div>
              </div>

              <div className="field-group">
                <label htmlFor="maxDailyTravelMinutes">Max daily travel minutes</label>
                <input
                  aria-describedby={errors.maxDailyTravelMinutes ? "maxDailyTravelMinutes-error" : undefined}
                  aria-invalid={Boolean(errors.maxDailyTravelMinutes)}
                  id="maxDailyTravelMinutes"
                  inputMode="numeric"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      constraints: { ...current.constraints, maxDailyTravelMinutes: event.target.value },
                    }))
                  }
                  value={draft.constraints.maxDailyTravelMinutes}
                />
                {errors.maxDailyTravelMinutes ? (
                  <p className="field-error" id="maxDailyTravelMinutes-error">
                    {errors.maxDailyTravelMinutes}
                  </p>
                ) : null}
              </div>
            </>
          ) : null}

          {currentStep === 2 ? (
            <>
              <fieldset className="fieldset-block">
                <legend>Interests</legend>
                <div className="chip-grid">
                  {interestOptions.map((option) => (
                    <label className="chip-option" key={option.value}>
                      <input
                        checked={draft.preferences.interests.includes(option.value)}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            preferences: {
                              ...current.preferences,
                              interests: event.target.checked
                                ? [...current.preferences.interests, option.value]
                                : current.preferences.interests.filter((item) => item !== option.value),
                            },
                          }))
                        }
                        type="checkbox"
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="grid-two">
                <div className="field-group">
                  <label htmlFor="pace">Pace</label>
                  <select
                    id="pace"
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        preferences: { ...current.preferences, pace: event.target.value as Preferences["pace"] },
                      }))
                    }
                    value={draft.preferences.pace}
                  >
                    <option value="relaxed">Relaxed</option>
                    <option value="balanced">Balanced</option>
                    <option value="packed">Packed</option>
                  </select>
                </div>

                <div className="field-group">
                  <label htmlFor="travelStyle">Travel style</label>
                  <select
                    id="travelStyle"
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        preferences: {
                          ...current.preferences,
                          travelStyle: event.target.value as Preferences["travelStyle"],
                        },
                      }))
                    }
                    value={draft.preferences.travelStyle}
                  >
                    <option value="budget">Budget</option>
                    <option value="comfort">Comfort</option>
                    <option value="luxury">Luxury</option>
                  </select>
                </div>
              </div>

              <fieldset className="fieldset-block">
                <legend>Preferred transport</legend>
                <div className="chip-grid">
                  {transportOptions.map((option) => (
                    <label className="chip-option" key={option.value}>
                      <input
                        checked={draft.preferences.preferredTransport.includes(option.value)}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            preferences: {
                              ...current.preferences,
                              preferredTransport: event.target.checked
                                ? [...current.preferences.preferredTransport, option.value]
                                : current.preferences.preferredTransport.filter((item) => item !== option.value),
                            },
                          }))
                        }
                        type="checkbox"
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="field-group">
                <label htmlFor="mustInclude">Must include themes</label>
                <input
                  id="mustInclude"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      constraints: { ...current.constraints, mustInclude: event.target.value },
                    }))
                  }
                  value={draft.constraints.mustInclude}
                />
                <p className="field-help">Comma-separated tags or keywords, like museum, tram, or vegetarian.</p>
              </div>

              <div className="field-group">
                <label htmlFor="mustAvoidTags">Avoided tags</label>
                <input
                  id="mustAvoidTags"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      constraints: { ...current.constraints, mustAvoidTags: event.target.value },
                    }))
                  }
                  value={draft.constraints.mustAvoidTags}
                />
              </div>
            </>
          ) : null}

          {currentStep === 3 ? (
            <>
              <fieldset className="fieldset-block">
                <legend>Accessibility needs</legend>
                <div className="chip-grid">
                  {accessibilityOptions.map((option) => (
                    <label className="chip-option" key={option.value}>
                      <input
                        checked={draft.preferences.accessibilityNeeds.includes(option.value)}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            preferences: {
                              ...current.preferences,
                              accessibilityNeeds: event.target.checked
                                ? [...current.preferences.accessibilityNeeds, option.value]
                                : current.preferences.accessibilityNeeds.filter((item) => item !== option.value),
                            },
                          }))
                        }
                        type="checkbox"
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="field-group">
                <label htmlFor="mobilityLimit">Mobility limit</label>
                <select
                  id="mobilityLimit"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      constraints: {
                        ...current.constraints,
                        mobilityLimit: event.target.value as PlannerDraft["constraints"]["mobilityLimit"],
                      },
                    }))
                  }
                  value={draft.constraints.mobilityLimit}
                >
                  <option value="unrestricted">Unrestricted</option>
                  <option value="limited-walking">Limited walking</option>
                  <option value="wheelchair-dependent">Wheelchair-dependent</option>
                </select>
              </div>

              <p className="panel-callout">
                Accessibility is a planning input here, not just a UI checkbox. Your selected needs will also appear as itinerary filters on the dashboard so you can review the trip through the same lens you planned it with.
              </p>
            </>
          ) : null}

          {createTripMutation.isError && createTripMutation.error instanceof ApiClientError ? (
            <p className="field-error" role="alert">
              {createTripMutation.error.message}
            </p>
          ) : null}

          <div className="button-row">
            <button
              className="ghost-button"
              disabled={currentStep === 0}
              onClick={() => setCurrentStep((current) => Math.max(current - 1, 0))}
              type="button"
            >
              Previous
            </button>

            <button className="primary-button" disabled={createTripMutation.isPending} type="submit">
              {currentStep === wizardSteps.length - 1
                ? createTripMutation.isPending
                  ? "Planning..."
                  : "Generate itinerary"
                : "Next step"}
            </button>
          </div>
        </form>
      </section>

      <aside className="panel summary-panel">
        <h2>Trip summary</h2>
        <p>
          Planning for <strong>{user?.displayName ?? "traveler"}</strong>
        </p>
        <dl className="summary-list">
          <div>
            <dt>Dates</dt>
            <dd>
              {draft.constraints.startDate} to {draft.constraints.endDate}
            </dd>
          </div>
          <div>
            <dt>Budget cap</dt>
            <dd>
              {draft.constraints.currency} {draft.constraints.budgetAmount}
            </dd>
          </div>
          <div>
            <dt>Interests</dt>
            <dd>{draft.preferences.interests.join(", ") || "None selected"}</dd>
          </div>
          <div>
            <dt>Accessibility</dt>
            <dd>{draft.preferences.accessibilityNeeds.join(", ") || "No extra needs selected"}</dd>
          </div>
        </dl>

        {preferencesQuery.isLoading ? <div className="skeleton-block" /> : null}
      </aside>
    </div>
  );
}

function LocationFields({
  label,
  location,
  onChange,
  errors,
  errorPrefix,
}: {
  label: string;
  location: PlannerLocationDraft;
  onChange: (nextLocation: PlannerLocationDraft) => void;
  errors: Record<string, string>;
  errorPrefix: string;
}) {
  return (
    <fieldset className="fieldset-block">
      <legend>{label}</legend>
      <div className="grid-two">
        <TextField
          error={errors[`${errorPrefix}.label`]}
          fieldId={`${errorPrefix}-label`}
          label="Label"
          onChange={(value) => onChange({ ...location, label: value })}
          value={location.label}
        />
        <TextField
          error={errors[`${errorPrefix}.city`]}
          fieldId={`${errorPrefix}-city`}
          label="City"
          onChange={(value) => onChange({ ...location, city: value })}
          value={location.city}
        />
      </div>
      <div className="grid-two">
        <TextField
          error={errors[`${errorPrefix}.country`]}
          fieldId={`${errorPrefix}-country`}
          label="Country"
          onChange={(value) => onChange({ ...location, country: value })}
          value={location.country}
        />
        <TextField
          error={errors[`${errorPrefix}.countryCode`]}
          fieldId={`${errorPrefix}-countryCode`}
          label="Country code"
          onChange={(value) => onChange({ ...location, countryCode: value.toUpperCase() })}
          value={location.countryCode}
        />
      </div>
      <div className="grid-two">
        <TextField
          error={errors[`${errorPrefix}.lng`]}
          fieldId={`${errorPrefix}-lng`}
          label="Longitude"
          onChange={(value) => onChange({ ...location, lng: value })}
          value={location.lng}
        />
        <TextField
          error={errors[`${errorPrefix}.lat`]}
          fieldId={`${errorPrefix}-lat`}
          label="Latitude"
          onChange={(value) => onChange({ ...location, lat: value })}
          value={location.lat}
        />
      </div>
    </fieldset>
  );
}

function TextField({
  fieldId,
  label,
  value,
  onChange,
  error,
}: {
  fieldId: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  return (
    <div className="field-group">
      <label htmlFor={fieldId}>{label}</label>
      <input
        aria-describedby={error ? `${fieldId}-error` : undefined}
        aria-invalid={Boolean(error)}
        id={fieldId}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
      {error ? (
        <p className="field-error" id={`${fieldId}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

function validateDraft(draft: PlannerDraft, stepIndex: number) {
  const errors: Record<string, string> = {};

  if (stepIndex === 0 || stepIndex === wizardSteps.length - 1) {
    if (!draft.title.trim()) {
      errors.title = "Trip title is required.";
    }
    if (Number(draft.constraints.partySize) <= 0) {
      errors.partySize = "Party size must be at least 1.";
    }

    validateLocation("origin", draft.constraints.origin, errors);
    draft.constraints.destinations.forEach((destination, index) => validateLocation(`destination-${index}`, destination, errors));
  }

  if (stepIndex === 1 || stepIndex === wizardSteps.length - 1) {
    if (!draft.constraints.startDate) {
      errors.startDate = "Start date is required.";
    }
    if (!draft.constraints.endDate) {
      errors.endDate = "End date is required.";
    }
    if (draft.constraints.startDate && draft.constraints.endDate && draft.constraints.startDate > draft.constraints.endDate) {
      errors.endDate = "End date must be on or after the start date.";
    }
    if (Number(draft.constraints.budgetAmount) <= 0) {
      errors.budgetAmount = "Budget must be greater than zero.";
    }
    if (Number(draft.constraints.maxDailyTravelMinutes) < 0) {
      errors.maxDailyTravelMinutes = "Travel minutes cannot be negative.";
    }
  }

  if (stepIndex === 2 || stepIndex === wizardSteps.length - 1) {
    if (draft.preferences.interests.length === 0) {
      errors.interests = "Choose at least one interest.";
    }
    if (draft.preferences.preferredTransport.length === 0) {
      errors.preferredTransport = "Choose at least one transport option.";
    }
  }

  return errors;
}

function validateLocation(prefix: string, location: PlannerLocationDraft, errors: Record<string, string>) {
  if (!location.label.trim()) {
    errors[`${prefix}.label`] = "Label is required.";
  }
  if (!location.city.trim()) {
    errors[`${prefix}.city`] = "City is required.";
  }
  if (!location.country.trim()) {
    errors[`${prefix}.country`] = "Country is required.";
  }
  if (!location.countryCode.trim()) {
    errors[`${prefix}.countryCode`] = "Country code is required.";
  }
  if (Number.isNaN(Number(location.lng))) {
    errors[`${prefix}.lng`] = "Longitude must be numeric.";
  }
  if (Number.isNaN(Number(location.lat))) {
    errors[`${prefix}.lat`] = "Latitude must be numeric.";
  }
}
