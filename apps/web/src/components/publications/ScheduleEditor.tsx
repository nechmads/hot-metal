import { FloppyDiskIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { Loader } from "@/components/loader/Loader";
import type { AutoPublishMode, ScheduleType } from "@/lib/types";
import {
  MODE_OPTIONS,
  SCHEDULE_TYPE_OPTIONS,
  CURATED_TIMEZONES,
  formatHour,
  formatNextRun,
} from "./schedule-utils";

export interface ScheduleEditorState {
  autoPublishMode: AutoPublishMode;
  cadencePostsPerWeek: number;
  timezone: string;
  scheduleType: ScheduleType;
  scheduleHour: number;
  scheduleCount: number;
  scheduleDays: number;
  nextScoutAt: number | null;
}

interface ScheduleEditorProps {
  state: ScheduleEditorState;
  onChange: (updates: Partial<ScheduleEditorState>) => void;
  onRunScout: () => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  scouting: boolean;
  topicsExist: boolean;
  onAutoPublishModeChange: (mode: AutoPublishMode) => void;
}

export function ScheduleEditor({
  state,
  onChange,
  onRunScout,
  onSave,
  onCancel,
  saving,
  scouting,
  topicsExist,
  onAutoPublishModeChange,
}: ScheduleEditorProps) {
  return (
    <div className="space-y-6">
      {/* Scout Schedule */}
      <section className="space-y-4 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] p-5">
        <h3 className="font-semibold">Schedule</h3>

        <div>
          <label className="mb-1 block text-sm font-medium">Timezone</label>
          <select
            value={state.timezone}
            onChange={(e) => onChange({ timezone: e.target.value })}
            className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
          >
            {CURATED_TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          {SCHEDULE_TYPE_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                state.scheduleType === opt.value
                  ? "border-[var(--color-accent)] bg-[var(--color-accent-light)]"
                  : "border-[var(--color-border-default)] hover:bg-[var(--color-bg-card)]"
              }`}
            >
              <input
                type="radio"
                name="scheduleType"
                value={opt.value}
                checked={state.scheduleType === opt.value}
                onChange={() => onChange({ scheduleType: opt.value })}
                className="mt-0.5 accent-[var(--color-accent)]"
              />
              <div>
                <span className="text-sm font-medium">{opt.label}</span>
                <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                  {opt.description}
                </p>
              </div>
            </label>
          ))}
        </div>

        {state.scheduleType === "daily" && (
          <div>
            <label className="mb-1 block text-sm font-medium">Time</label>
            <select
              value={state.scheduleHour}
              onChange={(e) =>
                onChange({ scheduleHour: parseInt(e.target.value, 10) })
              }
              className="w-40 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            >
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>
                  {formatHour(i)}
                </option>
              ))}
            </select>
          </div>
        )}

        {state.scheduleType === "times_per_day" && (
          <div>
            <label className="mb-1 block text-sm font-medium">
              Times per day
            </label>
            <select
              value={state.scheduleCount}
              onChange={(e) =>
                onChange({ scheduleCount: parseInt(e.target.value, 10) })
              }
              className="w-40 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            >
              {[2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n} times
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              Runs at:{" "}
              {Array.from({ length: state.scheduleCount }, (_, i) =>
                formatHour(Math.round((24 / state.scheduleCount) * i) % 24),
              ).join(", ")}
            </p>
          </div>
        )}

        {state.scheduleType === "every_n_days" && (
          <div className="flex gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Every</label>
              <select
                value={state.scheduleDays}
                onChange={(e) =>
                  onChange({ scheduleDays: parseInt(e.target.value, 10) })
                }
                className="w-28 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              >
                {[2, 3, 4, 5, 6, 7].map((n) => (
                  <option key={n} value={n}>
                    {n} days
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">At</label>
              <select
                value={state.scheduleHour}
                onChange={(e) =>
                  onChange({ scheduleHour: parseInt(e.target.value, 10) })
                }
                className="w-40 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>
                    {formatHour(i)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Next run display */}
        <div className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-card)] px-3 py-2">
          <span className="text-xs font-medium text-[var(--color-text-muted)]">
            Next scout:{" "}
          </span>
          <span className="text-sm">
            {formatNextRun(state.nextScoutAt, state.timezone)}
          </span>
        </div>

        {/* Save / Cancel buttons */}
        <div className="flex items-center gap-2 border-t border-[var(--color-border-default)] pt-4">
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
          >
            {saving ? <Loader size={14} /> : <FloppyDiskIcon size={14} />}
            {saving ? 'Saving...' : 'Save Schedule'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-lg border border-[var(--color-border-default)] px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--color-bg-card)] disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </section>

      {/* Publish Mode */}
      <section className="space-y-4 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] p-5">
        <h3 className="font-semibold">Publish Mode</h3>

        <div className="space-y-2">
          {MODE_OPTIONS.map((mode) => (
            <label
              key={mode.value}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                state.autoPublishMode === mode.value
                  ? "border-[var(--color-accent)] bg-[var(--color-accent-light)]"
                  : "border-[var(--color-border-default)] hover:bg-[var(--color-bg-card)]"
              }`}
            >
              <input
                type="radio"
                name="autoPublishMode"
                value={mode.value}
                checked={state.autoPublishMode === mode.value}
                onChange={() => onAutoPublishModeChange(mode.value)}
                className="mt-0.5 accent-[var(--color-accent)]"
              />
              <div>
                <span className="text-sm font-medium">{mode.label}</span>
                <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                  {mode.description}
                </p>
              </div>
            </label>
          ))}
        </div>

        {state.autoPublishMode === "full-auto" && (
          <div>
            <label className="mb-1 block text-sm font-medium">
              Posts per week
            </label>
            <input
              type="number"
              min={1}
              max={14}
              value={state.cadencePostsPerWeek}
              onChange={(e) => {
                const parsed = parseInt(e.target.value, 10);
                if (!Number.isNaN(parsed))
                  onChange({
                    cadencePostsPerWeek: Math.max(1, Math.min(14, parsed)),
                  });
              }}
              className="w-24 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            />
          </div>
        )}

        <div className="border-t border-[var(--color-border-default)] pt-4">
          <p className="mb-2 text-sm text-[var(--color-text-muted)]">
            Manually trigger the content scout to search for ideas now.
          </p>
          <button
            type="button"
            onClick={onRunScout}
            disabled={scouting || !topicsExist}
            className="flex items-center gap-2 rounded-lg border border-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-light)] disabled:opacity-50"
          >
            <MagnifyingGlassIcon
              size={16}
              className={scouting ? "animate-spin" : ""}
            />
            {scouting ? "Running Scout..." : "Run Scout Now"}
          </button>
          {!topicsExist && (
            <p className="mt-1.5 text-xs text-[var(--color-text-muted)]">
              Add at least one topic before running the scout.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
