import type { ReactNode } from "react";
import type { RunStatus, RaceStatus } from "../types/domain";
import { statusLabels } from "../utils/format";
export function Badge({ status }: { status: RunStatus | RaceStatus }) {
  return (
    <span className={`badge badge-${status.toLowerCase()}`}>
      <span className="status-dot" />
      {statusLabels[status]}
    </span>
  );
}
export function Panel({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
export function Empty({
  title = "Không tìm thấy kết quả",
  description = "Thử thay đổi từ khóa hoặc bộ lọc.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}
export function DataGate({ children }: { children: ReactNode }) {
  return children;
}
