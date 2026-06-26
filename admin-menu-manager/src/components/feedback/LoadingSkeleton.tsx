type LoadingSkeletonProps = {
  ariaLabel?: string;
  className?: string;
  density?: "compact" | "normal";
  variant?: "page" | "shell" | "inline";
};

export function LoadingSkeleton({
  ariaLabel = "화면 준비 중",
  className = "",
  density = "normal",
  variant = "page"
}: LoadingSkeletonProps) {
  const rootClassName = ["loading-skeleton", `loading-skeleton-${variant}`, `loading-skeleton-${density}`, className]
    .filter(Boolean)
    .join(" ");
  const rowCount = density === "compact" ? 3 : 5;

  return (
    <section className={rootClassName} role="status" aria-live="polite" aria-label={ariaLabel}>
      <div className="skeleton-hero" aria-hidden="true">
        <span className="skeleton-line skeleton-line-kicker" />
        <span className="skeleton-line skeleton-line-title" />
        <span className="skeleton-line skeleton-line-copy" />
      </div>
      {variant === "inline" ? null : (
        <div className="skeleton-grid" aria-hidden="true">
          {Array.from({ length: rowCount }, (_, index) => (
            <span className="skeleton-block" key={index} />
          ))}
        </div>
      )}
    </section>
  );
}
