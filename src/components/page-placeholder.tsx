interface PagePlaceholderProps {
  title: string;
  description?: string;
}

export function PagePlaceholder({ title, description }: PagePlaceholderProps) {
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 items-center border-b border-border px-6">
        <h1 className="text-sm font-semibold text-foreground">{title}</h1>
      </header>
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <p className="text-sm font-medium text-foreground-muted">
            Coming soon
          </p>
          {description ? (
            <p className="mt-1 max-w-sm text-xs text-foreground-subtle">
              {description}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
