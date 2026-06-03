import type { ApplicationStage } from "./types";
import { APPLICATION_STAGES } from "./types";

interface StageConfig {
  id: ApplicationStage;
  label: string;
  /** Tailwind class for the small dot/accent on the column header. */
  accentClass: string;
}

export const STAGE_CONFIG: Record<ApplicationStage, StageConfig> = {
  lead: { id: "lead", label: "Lead", accentClass: "bg-zinc-400" },
  applied: { id: "applied", label: "Applied", accentClass: "bg-sky-400" },
  screen: { id: "screen", label: "Screen", accentClass: "bg-indigo-400" },
  interview: { id: "interview", label: "Interview", accentClass: "bg-violet-400" },
  offer: { id: "offer", label: "Offer", accentClass: "bg-amber-400" },
  closed_won: { id: "closed_won", label: "Closed - Won", accentClass: "bg-emerald-400" },
  closed_lost: { id: "closed_lost", label: "Closed - Lost", accentClass: "bg-rose-400" },
};

export const ORDERED_STAGES: readonly ApplicationStage[] = APPLICATION_STAGES;
