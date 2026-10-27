import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { raceService } from "../../services";
import type { RunSession, RunDetail } from "../../types/domain";
import { Badge, Panel } from "../../components/ui";
import { duration, distance } from "../../utils/format";
import { sourceLabel } from "../../utils/labels";
import { paceLabel, lapProgress } from "./analyticsMetrics";
export function StudentAnalytics({
  runner,
  target,
}: {
  runner: RunSession;
  target: number | null;
}) {
  const [detail, setDetail] = useState<RunDetail | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController;
    const load = async () => {
      controller = new AbortController();
      try {
        const value = await raceService.getRunDetail(
          runner.student_id,
          runner.run_id,
          controller.signal,
        );
        if (!disposed) {
          setDetail(value);
          setError("");
        }
      } catch (e) {
        if (!disposed) setError((e as Error).message);
      } finally {
        if (!disposed) timer = setTimeout(load, 5000);
      }
    };
    void load();
    return () => {
      disposed = true;
      controller?.abort();
      clearTimeout(timer);
    };
  }, [runner.student_id, runner.run_id]);
  const r = detail?.run.status === "COMPLETED" ? detail.run : runner;
  const laps = (detail?.laps ?? []).filter(
    (l) => Number.isFinite(l.duration_s) && l.duration_s >= 0,
  );
  const min = laps.length ? Math.min(...laps.map((l) => l.duration_s)) : null,
    max = laps.length ? Math.max(...laps.map((l) => l.duration_s)) : null;
  return (
    <>
      {error && <p role="alert">{error}{detail ? " Dữ liệu đã tải được giữ lại." : " Chưa tải được lịch sử vòng."}</p>}
      <div className="student-overview">
        <section className="panel student-profile-card">
          <div className="profile-top">
            <div className="profile-avatar">
              {r.full_name
                .split(" ")
                .map((w) => w[0])
                .slice(-2)
                .join("").toLocaleUpperCase("vi-VN")}
            </div>
            <div>
              <Badge status={r.status} />
              <h2>{r.full_name}</h2>
              <p>
                Số báo danh {r.bib} · {r.faculty && r.faculty !== "—" ? r.faculty : "Chưa có khoa/viện"}
              </p>
            </div>
          </div>
          <div className="profile-progress">
            <div>
              <span>Tiến độ mục tiêu</span>
              <strong>
                {r.lap_count}/{r.total_laps} vòng
              </strong>
            </div>
            <progress
              value={lapProgress(r.lap_count, r.total_laps)}
              max="100"
              aria-label="Tiến độ mục tiêu"
            />
            <small>
              {distance(r.distance_total_m)}
              {target
                ? ` trên mục tiêu ${distance(target)}`
                : " · Chưa có chiều dài tuyến mục tiêu"}
            </small>
          </div>
        </section>
        <div className="student-metrics">
          {[
            [
              "Pace ước tính",
              paceLabel(r.duration_total_s, r.distance_total_m),
              "phút/km",
            ],
            [
              "Vòng nhanh nhất",
              min == null ? "—" : duration(min),
              "Trong các vòng đã tải",
            ],
            [
              "Tổng số bước",
              r.total_steps == null
                ? "—"
                : r.total_steps.toLocaleString("vi-VN"),
              sourceLabel(r.source),
            ],
            [
              "Thời gian",
              duration(r.duration_total_s),
              r.status === "COMPLETED"
                ? "Thời gian đã chốt"
                : "Thời lượng backend ghi nhận",
            ],
          ].map(([title, value, note]) => (
            <section className="panel" key={title}>
              <span>{title}</span>
              <strong>{value}</strong>
              <small>{note}</small>
            </section>
          ))}
        </div>
      </div>
      <div className="student-analysis-grid">
        <Panel
          className="lap-chart-card"
          title="Phân tích từng vòng"
          subtitle="Thời gian hoàn thành của các vòng backend đã trả"
        >
          <div className="lap-bars">
            {laps.map((lap, index) => {
              const previous = laps[index - 1];
              const delta = previous
                ? lap.duration_s - previous.duration_s
                : null;
              return (
                <div className="lap-bar-column" key={lap.event_id}>
                  <div className="lap-value">
                    {duration(lap.duration_s)}
                    {delta != null && (
                      <small>
                        {delta > 0 ? "+" : ""}
                        {delta.toLocaleString("vi-VN", {
                          maximumFractionDigits: 1,
                        })}{" "}
                        s
                      </small>
                    )}
                  </div>
                  <div
                    className={`lap-bar ${lap.duration_s === min ? "fastest" : ""}`}
                    style={{
                      height: `${max && max > 0 ? (lap.duration_s / max) * 150 : 0}px`,
                    }}
                  >
                    <span>{lap.lap}</span>
                  </div>
                  <strong>Vòng {lap.lap}</strong>
                </div>
              );
            })}
            {!laps.length && (
              <p className="empty">
                {!detail && !error
                  ? "Đang tải lịch sử vòng…"
                  : "Chưa có vòng để phân tích."}
              </p>
            )}
          </div>
          <div className="lap-chart-footer">
            <span>
              <i className="fastest-dot" />
              Vòng nhanh nhất đã tải
            </span>
            <span>Thấp hơn là nhanh hơn</span>
          </div>
        </Panel>
        <Panel
          className="consistency-card"
          title="Độ ổn định"
          subtitle="Chênh lệch thời gian giữa các vòng"
        >
          <div className="consistency-unavailable">
            <strong>—</strong>
            <span>Chưa có thang điểm xác minh</span>
          </div>
          <p>Chưa có dữ liệu điểm ổn định từ hệ thống.</p>
          <div className="consistency-stat">
            <span>Chênh lệch lớn nhất</span>
            <strong>
              {min != null && max != null && laps.length > 1
                ? `${(max - min).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} giây`
                : "—"}
            </strong>
          </div>
        </Panel>
      </div>
      <Link
        className="text-link"
        to={`/runners/${r.student_id}/runs/${r.run_id}`}
      >
        Xem chi tiết phiên và lịch sử GPS →
      </Link>
    </>
  );
}
