const ROW_COUNT = 4;

export function TaskTableSkeleton() {
  return (
    <div className="skeleton-table" role="status" aria-label="Loading tasks">
      {Array.from({ length: ROW_COUNT }, (_, index) => (
        <div key={index} className="skeleton-row" aria-hidden="true">
          <span className="skeleton skeleton-title" />
          <span className="skeleton skeleton-skills" />
          <span className="skeleton skeleton-control" />
          <span className="skeleton skeleton-control" />
        </div>
      ))}
    </div>
  );
}
