import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Search,
  ArrowDownUp,
  ChevronLeft,
  ChevronRight,
  Users,
} from "lucide-react";
import { useLive } from "../../app/LiveProvider";
import { dataMode, raceService } from "../../services";
import type {
  PaginatedResponse,
  RunSession,
  RunStatus,
  RunnerFilters,
} from "../../types/domain";
import { Badge, Empty } from "../../components/ui";
import { distance, duration } from "../../utils/format";
export function RunnerTable({
  compact = false,
  onSelect,
}: {
  compact?: boolean;
  onSelect?: (id: string) => void;
}) {
  const { snapshot, raceId, retry, mergeRunners } = useLive();
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (dataMode !== "api") return;
    const timer = setInterval(() => setRefresh((n) => n + 1), 5000);
    return () => clearInterval(timer);
  }, []);
  const hasSnapshot = !!snapshot;
  const mockSnapshot = dataMode === "mock" ? snapshot : null;
  const loadedQuery = useRef("");
  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "",
    status = (params.get("status") ?? "") as RunStatus | "";
  const [sort, setSort] = useState<RunnerFilters["sort"]>(),
    [direction, setDirection] = useState<"asc" | "desc">("desc"),
    [page, setPage] = useState(1),
    [result, setResult] = useState<PaginatedResponse<RunSession> | null>(null),
    [error, setError] = useState("");
  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
    setPage(1);
  };
  useEffect(() => {
    setPage(1);
  }, [query, status, raceId]);
  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    if (!raceId || !snapshot) return;
    const queryKey = JSON.stringify([
      raceId,
      query,
      status,
      sort,
      direction,
      page,
      compact,
    ]);
    if (loadedQuery.current !== queryKey) setResult(null);
    const timer = setTimeout(() => {
      raceService
        .listRunners(
          raceId,
          {
            search: query,
            status,
            sort,
            direction,
            page,
            page_size: compact ? 6 : 10,
          },
          controller.signal,
        )
        .then((r) => {
          if (!disposed) {
            loadedQuery.current = queryKey;
            setResult(r);
            if (dataMode === "api") mergeRunners(r.items);
            setError("");
          }
        })
        .catch((e: Error) => {
          if (!disposed) setError(e.message);
        });
    }, 300);
    return () => {
      disposed = true;
      controller.abort();
      clearTimeout(timer);
    };
    // Live positions are merged below; server filters refresh at most once per 5 seconds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mockSnapshot,
    hasSnapshot,
    raceId,
    refresh,
    query,
    status,
    sort,
    direction,
    page,
    compact,
  ]);
  function sorting(field: RunnerFilters["sort"]) {
    setDirection(sort === field && direction === "desc" ? "asc" : "desc");
    setSort(field);
    setPage(1);
  }
  return (
    <section className="panel runners-panel">
      <div className="panel-heading">
        <div>
          <h2>
            Theo dõi sinh viên{" "}
            <span className="count-chip">{snapshot?.runners.length ?? 0}</span>
          </h2>
          <p>Thông tin và tiến độ tham gia giải chạy</p>
        </div>
        <div className="table-filters">
          <div className="table-search">
            <Search size={16} />
            <input
              aria-label="Tìm theo họ tên hoặc mã sinh viên"
              placeholder="Tìm tên hoặc mã sinh viên…"
              value={query}
              onChange={(e) => setFilter("q", e.target.value)}
            />
          </div>
          <select
            aria-label="Lọc trạng thái"
            value={status}
            onChange={(e) => setFilter("status", e.target.value)}
          >
            <option value="">Tất cả trạng thái</option>
            <option value="ACTIVE">Đang chạy</option>
            <option value="COMPLETED">Hoàn thành</option>
            <option value="PENDING">Chưa bắt đầu</option>
            <option value="ABANDONED">Đã dừng</option>
          </select>
        </div>
      </div>
      {error ? (
        <>
          <Empty title="Dữ liệu không khả dụng" description={error} />
          <button
            className="button"
            onClick={() => {
              setRefresh((n) => n + 1);
              retry();
            }}
          >
            Thử lại
          </button>
        </>
      ) : !result ? (
        <div className="empty" role="status">
          Đang tải sinh viên…
        </div>
      ) : (
        <>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>BIB</th>
                  <th>SINH VIÊN</th>
                  <th>KHOA / VIỆN</th>
                  <th
                    aria-sort={
                      sort === "lap_count"
                        ? direction === "desc"
                          ? "descending"
                          : "ascending"
                        : "none"
                    }
                  >
                    <button onClick={() => sorting("lap_count")}>
                      SỐ VÒNG <ArrowDownUp size={12} />
                    </button>
                  </th>
                  <th
                    aria-sort={
                      sort === "distance_total_m"
                        ? direction === "desc"
                          ? "descending"
                          : "ascending"
                        : "none"
                    }
                  >
                    <button onClick={() => sorting("distance_total_m")}>
                      QUÃNG ĐƯỜNG <ArrowDownUp size={12} />
                    </button>
                  </th>
                  <th
                    aria-sort={
                      sort === "duration_total_s"
                        ? direction === "desc"
                          ? "descending"
                          : "ascending"
                        : "none"
                    }
                  >
                    <button
                      disabled={dataMode === "api"}
                      title={
                        dataMode === "api"
                          ? "Backend chưa hỗ trợ sắp xếp thời gian"
                          : undefined
                      }
                      onClick={() => sorting("duration_total_s")}
                    >
                      THỜI GIAN <ArrowDownUp size={12} />
                    </button>
                  </th>
                  <th>VÒNG GẦN NHẤT</th>
                  <th>BƯỚC CHÂN</th>
                  <th>TRẠNG THÁI</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {result.items.map((item) => {
                  const live = snapshot?.runners.find(
                    (r) =>
                      r.run_id === item.run_id &&
                      r.student_id === item.student_id,
                  );
                  const r =
                    live &&
                    live.last_seen_at &&
                    (!item.last_seen_at ||
                      live.last_seen_at >= item.last_seen_at) &&
                    item.status !== "COMPLETED"
                      ? { ...item, ...live }
                      : item;
                  return (
                    <tr
                      key={r.run_id || r.student_id}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest("a,button"))
                          return;
                        const link =
                          e.currentTarget.querySelector<HTMLAnchorElement>("a");
                        link?.click();
                      }}
                    >
                      <td>
                        <span
                          className="table-bib"
                          style={{ color: r.color, background: r.color + "12" }}
                        >
                          #{r.bib}
                        </span>
                      </td>
                      <td>
                        <Link
                          className="student-link"
                          to={
                            r.run_id
                              ? `/runners/${r.student_id}/runs/${r.run_id}`
                              : "#"
                          }
                          onClick={(e) => {
                            if (!r.run_id) e.preventDefault();
                          }}
                        >
                          <strong>{r.full_name}</strong>
                          <small>{r.student_code}</small>
                        </Link>
                      </td>
                      <td className="faculty-cell">{r.faculty}</td>
                      <td>
                        <strong>{r.lap_count}</strong>
                        <span className="muted"> / {r.total_laps || "—"}</span>
                        <div className="mini-progress">
                          <i
                            style={{
                              width: `${(r.lap_count / (r.total_laps || 1)) * 100}%`,
                              background: r.color,
                            }}
                          />
                        </div>
                      </td>
                      <td className="number-cell">
                        {distance(r.distance_total_m)}
                      </td>
                      <td className="number-cell">
                        {duration(r.duration_total_s)}
                      </td>
                      <td className="number-cell">
                        {duration(r.last_lap_duration_s)}
                      </td>
                      <td>{r.total_steps?.toLocaleString("vi-VN") ?? "—"}</td>
                      <td>
                        <Badge status={r.status} />
                        {r.connection === "STALE" && (
                          <small className="stale">Mất cập nhật</small>
                        )}
                      </td>
                      <td>
                        {onSelect && r.last_latitude != null ? (
                          <button
                            className="icon-button"
                            title={`Theo dõi ${r.full_name} trên bản đồ`}
                            aria-label={`Theo dõi bib ${r.bib}`}
                            onClick={() => onSelect(r.student_id)}
                          >
                            <Users size={16} />
                          </button>
                        ) : (
                          <ChevronRight size={16} className="muted" />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {result.total === 0 && <Empty />}
          <div className="pagination">
            <span>
              Hiển thị{" "}
              <strong>
                {result.total ? (page - 1) * result.page_size + 1 : 0}–
                {Math.min(page * result.page_size, result.total)}
              </strong>{" "}
              trên {result.total} sinh viên
            </span>
            <div>
              <button
                className="icon-button"
                aria-label="Trang trước"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft size={16} />
              </button>
              <span className="page-number">{page}</span>
              <span>
                / {Math.max(1, Math.ceil(result.total / result.page_size))}
              </span>
              <button
                className="icon-button"
                aria-label="Trang sau"
                disabled={page * result.page_size >= result.total}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
