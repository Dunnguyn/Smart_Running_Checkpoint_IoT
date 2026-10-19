import { useState } from "react";
import { Link } from "react-router-dom";
import { useLive } from "../../app/LiveProvider";
import { Panel } from "../../components/ui";
import { ReferenceIcon as Icon } from "../../components/ReferenceIcon";
import { statusLabels, distance, datetime } from "../../utils/format";
import { paceLabel, chartMaximum, lapProgress } from "./analyticsMetrics";
import { StudentAnalytics } from "./StudentAnalytics";
import "./analytics.css";
export function Analytics() {
  const { snapshot, error, retry, refreshData } = useLive();
  const [view, setView] = useState("race"),
    [runId, setRunId] = useState("");
  const [refreshing, setRefreshing] = useState(false),
    [refreshError, setRefreshError] = useState("");
  const d = snapshot?.dashboard;
  if (!snapshot || !d)
    return (
      <Panel title="Phân tích giải chạy">
        <p role="status">{error || "Đang tải dữ liệu…"}</p>
        {error && (
          <button className="button" onClick={retry}>
            Thử lại
          </button>
        )}
      </Panel>
    );
  const s = d.summary,
    rows = snapshot.runners;
  const measured = rows.filter(
    (r) => r.distance_total_m > 0 && r.duration_total_s != null,
  );
  const pace = paceLabel(
    measured.reduce((v, r) => v + r.duration_total_s!, 0),
    measured.reduce((v, r) => v + r.distance_total_m, 0),
  );
  const target =
    snapshot.routeDistance_m && d.race.total_laps
      ? snapshot.routeDistance_m * d.race.total_laps
      : null;
  const max = chartMaximum(
    rows.map((r) => r.distance_total_m),
    target,
  );
  const states = [
    ["Hoàn thành", s.completed_runners, "#059669"],
    ["Đang chạy", s.active_runners, "#2563eb"],
    ["Chưa bắt đầu", s.not_started_runners, "#cbd5e1"],
  ] as const;
  const total = states.reduce((v, item) => v + item[1], 0),
    complete = total ? (s.completed_runners / total) * 100 : 0,
    active = total ? (s.active_runners / total) * 100 : 0;
  const selected = rows.find((r) => r.run_id === runId);
  const metrics = [
    {
      label: "Tỷ lệ hoàn thành",
      value: s.participants
        ? `${Math.round((s.completed_runners / s.participants) * 100)}%`
        : "—",
      unit: "",
      note: `${s.completed_runners}/${s.participants} người có phiên hoàn thành`,
      icon: "target",
      tone: "green",
    },
    {
      label: "Pace tổng hợp",
      value: pace,
      unit: pace === "—" ? "" : "phút/km",
      note: `Ước tính từ ${measured.length} phiên có dữ liệu`,
      icon: "clock",
      tone: "blue",
    },
    {
      label: "Vòng nhanh nhất",
      value: "—",
      unit: "",
      note: "Chưa có tổng hợp toàn giải",
      icon: "zap",
      tone: "blue",
    },
    {
      label: "Tổng quãng đường",
      value: (s.distance_total_m / 1000).toLocaleString("vi-VN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      unit: "km",
      note: `${s.laps_recorded} vòng đã được ghi nhận`,
      icon: "distance",
      tone: "blue",
    },
  ] as const;
  return (
    <div className="analytics-page analytics-ref">
      <div className="page-title">
        <div>
          <h1>Phân tích giải chạy</h1>
          <p>
            Đánh giá hiệu suất toàn giải và theo dõi thành tích chi tiết của
            từng sinh viên.
          </p>
        </div>
        <div className="analysis-actions">
          <span className="badge" title={datetime(snapshot.updated_at)}>
            Cập nhật{" "}
            {new Date(snapshot.updated_at).toLocaleTimeString("vi-VN", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          <button
            className="button"
            disabled={refreshing}
            onClick={async () => {
              setRefreshing(true);
              setRefreshError("");
              try {
                await refreshData();
              } catch (e) {
                setRefreshError((e as Error).message);
              } finally {
                setRefreshing(false);
              }
            }}
          >
            <Icon name="refresh" size={14} />
            {refreshing ? "Đang tải…" : "Làm mới"}
          </button>
        </div>
      </div>
      {(error || refreshError) && <p role="alert">{refreshError || error}</p>}
      <nav className="analytics-switch" aria-label="Phạm vi phân tích">
        {[
          ["race", "Toàn giải", "chart"],
          ["student", "Theo sinh viên", "users"],
        ].map(([id, label, icon]) => (
          <button
            key={id}
            className={view === id ? "active" : ""}
            aria-pressed={view === id}
            onClick={() => setView(id)}
          >
            <Icon name={icon as "chart" | "users"} size={16} />
            {label}
          </button>
        ))}
      </nav>
      {view === "race" ? (
        <>
          <div className="analytics-summary">
            {metrics.map((m) => (
              <section className="panel metric-card" key={m.label}>
                <div className="metric-label">
                  <span>{m.label}</span>
                  <span className={`metric-icon ${m.tone}`}>
                    <Icon name={m.icon} />
                  </span>
                </div>
                <strong>
                  {m.value} <small>{m.unit}</small>
                </strong>
                <div
                  className={`metric-foot ${m.tone === "green" ? "positive" : ""}`}
                >
                  {m.note}
                </div>
              </section>
            ))}
          </div>
          <div className="analytics-grid">
            <Panel
              className="performance-card"
              title="Quãng đường theo sinh viên"
              subtitle="So sánh tiến độ của các phiên đã tải"
              action={<span className="badge">Đơn vị: km</span>}
            >
              <div className="horizontal-chart">
                <div className="chart-scale">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <span key={i}>
                      {((max * i) / 4000).toLocaleString("vi-VN", {
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  ))}
                </div>
                {rows
                  .filter((r) => r.run_id)
                  .map((r) => (
                    <div className="chart-row" key={r.run_id}>
                      <div className="chart-person">
                        <span className="bib">{r.bib}</span>
                        <span>
                          <strong title={r.full_name}>{r.full_name}</strong>
                          <small>
                            {r.lap_count}/{r.total_laps} vòng
                          </small>
                        </span>
                      </div>
                      <div className="bar-track">
                        <span
                          className={`distance-bar ${r.status === "COMPLETED" ? "bar-completed" : ""}`}
                          style={{
                            width: `${(Math.max(0, r.distance_total_m) / max) * 100}%`,
                          }}
                        />
                        {target != null && (
                          <i
                            className="target-marker"
                            style={{ left: `${(target / max) * 100}%` }}
                            title={`Mục tiêu ${distance(target)}`}
                          />
                        )}
                      </div>
                      <strong className="bar-value">
                        {distance(r.distance_total_m)}
                      </strong>
                    </div>
                  ))}
                {!rows.length && (
                  <p className="empty">Chưa có dữ liệu quãng đường.</p>
                )}
              </div>
              <div className="chart-note">
                <span>
                  <i />
                  Quãng đường đã ghi nhận
                </span>
                <span>
                  <i />
                  {target != null
                    ? `Mục tiêu ${d.race.total_laps} vòng · ${distance(target)}`
                    : "Chưa có chiều dài tuyến mục tiêu"}
                </span>
              </div>
            </Panel>
            <Panel
              className="distribution-card"
              title="Phân bố trạng thái"
              subtitle={`${s.participants} sinh viên đã đăng ký`}
            >
              <div className="donut-wrap">
                <div
                  className="donut-chart"
                  aria-hidden="true"
                  style={{
                    background: `conic-gradient(#059669 0 ${complete}%,#2563eb ${complete}% ${complete + active}%,#dce3eb ${complete + active}% 100%)`,
                  }}
                >
                  <div>
                    <strong>{total}</strong>
                    <small>Trong 3 trạng thái</small>
                  </div>
                </div>
                <div className="donut-legend">
                  {states.map(([label, count, color]) => (
                    <div key={label}>
                      <span>
                        <i style={{ background: color }} />
                        {label}
                      </span>
                      <strong>
                        {count}{" "}
                        <small>
                          {total
                            ? `${Math.round((count / total) * 100)}%`
                            : "—"}
                        </small>
                      </strong>
                    </div>
                  ))}
                </div>
              </div>
              <div className="insight-box">
                <span>
                  <Icon name="info" />
                </span>
                <div>
                  <strong>Ghi nhận từ hệ thống</strong>
                  <p>
                    Hoàn thành theo trạng thái phiên đã chốt. Chưa có dữ liệu để
                    kết luận xu hướng cải thiện.
                  </p>
                </div>
              </div>
            </Panel>
          </div>
          <Panel
            className="ranking-card"
            title="Bảng tiến độ"
            subtitle="Thứ tự backend cung cấp; không phải kết quả thi đấu chính thức"
          >
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Thứ tự</th>
                    <th>Sinh viên</th>
                    <th>Tiến độ</th>
                    <th>Quãng đường</th>
                    <th>Pace ước tính</th>
                    <th>Vòng nhanh nhất</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {d.top_runners.map((r, index) => (
                    <tr key={r.run_id ?? r.student_id}>
                      <td>
                        <span className="rank-number">{index + 1}</span>
                      </td>
                      <td>
                        <div className="student-cell">
                          <span className="bib">
                            {r.bib_number ?? r.display_id ?? "—"}
                          </span>
                          <span>
                            {r.run_id ? (
                              <Link
                                to={`/runners/${r.student_id}/runs/${r.run_id}`}
                              >
                                {r.full_name}
                              </Link>
                            ) : (
                              <strong>{r.full_name}</strong>
                            )}
                            <small>
                              {rows.find(
                                (item) => item.student_id === r.student_id,
                              )?.student_code ?? "Chưa có mã sinh viên"}
                            </small>
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="table-progress">
                          <span>
                            {r.lap_count}/{r.total_laps ?? "—"} vòng
                          </span>
                          <progress
                            value={lapProgress(r.lap_count, r.total_laps)}
                            max="100"
                            aria-label={`Tiến độ ${r.full_name}`}
                          />
                        </div>
                      </td>
                      <td>
                        <strong>{distance(r.distance_total_m)}</strong>
                      </td>
                      <td>
                        {paceLabel(r.duration_total_s, r.distance_total_m)}
                      </td>
                      <td title="Chưa có dữ liệu tổng hợp">—</td>
                      <td>
                        <span
                          className={`badge badge-${r.status.toLowerCase()}`}
                        >
                          {statusLabels[
                            r.status as keyof typeof statusLabels
                          ] ?? `Trạng thái khác (${r.status})`}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!d.top_runners.length && (
                <p className="empty">Chưa có dữ liệu tiến độ.</p>
              )}
            </div>
          </Panel>
        </>
      ) : (
        <>
          <section className="panel student-picker">
            <div>
              <label className="picker-label" htmlFor="analytics-run">
                CHỌN SINH VIÊN ĐỂ PHÂN TÍCH
              </label>
              <select
                id="analytics-run"
                aria-label="Chọn phiên chạy"
                value={selected?.run_id ?? ""}
                onChange={(e) => setRunId(e.target.value)}
              >
                <option value="">Chọn người chạy</option>
                {rows
                  .filter((r) => r.run_id)
                  .map((r) => (
                    <option key={r.run_id} value={r.run_id}>
                      #{r.bib} · {r.full_name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="student-pills">
              {rows
                .filter((r) => r.run_id)
                .map((r) => (
                  <button
                    key={r.run_id}
                    aria-pressed={selected?.run_id === r.run_id}
                    className={selected?.run_id === r.run_id ? "active" : ""}
                    onClick={() => setRunId(r.run_id)}
                    title={r.full_name}
                  >
                    <span>{r.bib}</span>
                    <span>{r.full_name.split(" ").slice(-2).join(" ")}</span>
                  </button>
                ))}
            </div>
          </section>
          {selected ? (
            <StudentAnalytics
              key={`${selected.race_id}:${selected.run_id}`}
              runner={selected}
              target={target}
            />
          ) : (
            <Panel title="Chọn sinh viên để xem phân tích">
              <p className="empty">Dữ liệu lấy từ phiên chạy đã chọn.</p>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
