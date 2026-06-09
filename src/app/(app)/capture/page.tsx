import { CaptureForm } from "./capture-form";

export const dynamic = "force-dynamic";

export default function CapturePage() {
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 items-center border-b border-border px-6">
        <div>
          <h1 className="text-sm font-semibold text-foreground">Capture</h1>
          <p className="text-[11px] text-foreground-subtle">
            Type a note about a person, company, or conversation. We extract
            entities and link them into the graph.
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-3xl">
          <CaptureForm />
        </div>
      </div>
    </div>
  );
}
