import { Board } from "@/components/kanban/Board";
import { mockApplications } from "@/lib/mock-data";

export default function ApplicationsPage() {
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 items-center justify-between border-b border-border px-6">
        <div>
          <h1 className="text-sm font-semibold text-foreground">Applications</h1>
          <p className="text-[11px] text-foreground-subtle">
            {mockApplications.length} active across all stages
          </p>
        </div>
      </header>
      <div className="flex-1 overflow-hidden">
        <Board initialApplications={mockApplications} />
      </div>
    </div>
  );
}
