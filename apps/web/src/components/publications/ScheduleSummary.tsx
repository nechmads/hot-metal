import { CalendarDotsIcon, PencilSimpleIcon } from "@phosphor-icons/react";
import type { PublicationConfig } from "@/lib/types";
import { Toggle } from "@/components/toggle/Toggle";
import { MODE_LABELS, describeSchedule, formatNextRun } from "./schedule-utils";

interface ScheduleSummaryProps {
  publication: PublicationConfig;
  onEdit: () => void;
  onToggleScoutEnabled: (enabled: boolean) => void;
  togglingScout: boolean;
}

export function ScheduleSummary({ publication, onEdit, onToggleScoutEnabled, togglingScout }: ScheduleSummaryProps) {
  const scheduleDescription = publication.scoutSchedule
    ? describeSchedule(publication.scoutSchedule)
    : "Not configured";

  return (
    <section className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDotsIcon
            size={20}
            className="text-[var(--color-text-muted)]"
          />
          <h3 className="font-semibold">Publication Schedule</h3>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-light)]"
        >
          <PencilSimpleIcon size={14} />
          Edit
        </button>
      </div>

      {/* Automation on/off — primary control, always visible */}
      <div className="mt-4 flex items-center justify-between gap-4 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-card)] px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Automatic scouting</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                publication.scoutEnabled
                  ? "bg-[var(--color-accent-light)] text-[var(--color-accent)]"
                  : "bg-[var(--color-bg-primary)] text-[var(--color-text-muted)]"
              }`}
            >
              {publication.scoutEnabled ? "Active" : "Paused"}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
            {publication.scoutEnabled
              ? "Running on the schedule below."
              : "Nothing runs automatically for this publication."}
          </p>
        </div>
        <Toggle
          toggled={publication.scoutEnabled}
          disabled={togglingScout}
          onClick={() => onToggleScoutEnabled(!publication.scoutEnabled)}
        />
      </div>

      <div
        className={`mt-4 grid gap-3 sm:grid-cols-2 ${publication.scoutEnabled ? '' : 'opacity-60'}`}
      >
        <SummaryItem label="Publish mode">
          <span className="rounded-full bg-[var(--color-accent-light)] px-2 py-0.5 text-xs font-medium text-[var(--color-accent)]">
            {MODE_LABELS[publication.autoPublishMode] ??
              publication.autoPublishMode}
          </span>
          {publication.autoPublishMode !== "ideas-only" && (
            <span className="ml-2 text-xs text-[var(--color-text-muted)]">
              {publication.cadencePostsPerWeek}/week
            </span>
          )}
        </SummaryItem>
        <SummaryItem label="Schedule">{scheduleDescription}</SummaryItem>
        <SummaryItem label="Timezone">
          {publication.timezone?.replace(/_/g, " ") || "Not set"}
        </SummaryItem>
        <SummaryItem label="Next scout run">
          {formatNextRun(
            publication.nextScoutAt,
            publication.timezone || "UTC",
          )}
        </SummaryItem>
      </div>
    </section>
  );
}

function SummaryItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <span className="text-xs font-medium text-[var(--color-text-muted)]">
        {label}
      </span>
      <div className="mt-0.5 text-sm">{children}</div>
    </div>
  );
}
