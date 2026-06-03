interface AllowlistAddFormProps {
  action: (formData: FormData) => Promise<void>;
  error?: string;
}

/**
 * Server-rendered add form. No interactive JS needed; the kind select is a
 * native dropdown and the form posts directly to the server action.
 */
export function AllowlistAddForm({ action, error }: AllowlistAddFormProps) {
  return (
    <form action={action} className="mt-3 space-y-3">
      <div className="grid grid-cols-[120px_1fr] gap-3">
        <select
          name="kind"
          defaultValue="domain"
          className="rounded border border-border bg-surface-elevated px-2 py-1.5 text-xs text-foreground focus:border-accent focus:outline-none"
          aria-label="Entry kind"
        >
          <option value="domain">Domain</option>
          <option value="address">Address</option>
        </select>
        <input
          type="text"
          name="value"
          required
          placeholder="example.com or recruiter@example.com"
          className="rounded border border-border bg-surface-elevated px-2 py-1.5 text-xs text-foreground placeholder:text-foreground-subtle focus:border-accent focus:outline-none"
          aria-label="Value"
        />
      </div>
      <input
        type="text"
        name="notes"
        placeholder="Notes (optional)"
        className="w-full rounded border border-border bg-surface-elevated px-2 py-1.5 text-xs text-foreground placeholder:text-foreground-subtle focus:border-accent focus:outline-none"
        aria-label="Notes"
      />
      {error ? (
        <p className="text-[11px] text-red-400" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent/90"
      >
        Add to allowlist
      </button>
    </form>
  );
}
