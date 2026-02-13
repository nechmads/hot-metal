import { CalendarDotsIcon, PencilSimpleIcon } from "@phosphor-icons/react";
import type { PublicationConfig } from "@/lib/types";
import { MODE_LABELS, describeSchedule, formatNextRun } from "./schedule-utils";

interface ScheduleSummaryProps {
  publication: PublicationConfig;
  onEdit: () => void;
}

export function ScheduleSummary({ publication, onEdit }: ScheduleSummaryProps) {
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

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
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
        <SummaryItem label="Publish mode">
          <span className="rounded-full bg-[var(--color-accent-light)] px-2 py-0.5 text-xs font-medium text-[var(--color-accent)]">
            {MODE_LABELS[publication.autoPublishMode] ??
              publication.autoPublishMode}
          </span>
          {publication.autoPublishMode === "full-auto" && (
            <span className="ml-2 text-xs text-[var(--color-text-muted)]">
              {publication.cadencePostsPerWeek}/week
            </span>
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
