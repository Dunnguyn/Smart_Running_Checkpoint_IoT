import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useLive } from "../../app/LiveProvider";
import { raceService } from "../../services";
import { reconcileRunner } from "../../services/reconcile";
import type {
  PaginatedResponse,
  RunSession,
  RunStatus,
  RunnerFilters,
} from "../../types/domain";
import { Badge, Empty } from "../../components/ui";
import { IconAction } from "../../components/IconAction";
import { Eye } from "lucide-react";
import { Modal } from "../../components/Modal";
import { RunDetail } from "./RunDetail";
import { distance, duration } from "../../utils/format";
export function RunnerTable() {
  const { snapshot, raceId, mergeRunners } = useLive();
  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "",
    status = (params.get("status") ?? "") as RunStatus | "";
  const [page, setPage] = useState(1),
    [size, setSize] = useState(10),
    [sort, setSort] = useState<RunnerFilters["sort"]>(),
    [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [result, setResult] = useState<PaginatedResponse<RunSession> | null>(
      null,
    ),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0),
    [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<RunSession | null>(null);
  const loaded = useRef("");
  const hasSnapshot = !!snapshot;
  useEffect(() => {
    setPage(1);
  }, [raceId, query, status, size]);
  useEffect(() => {
    const timer = setInterval(() => setRefresh((n) => n + 1), 5000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!raceId || !hasSnapshot) return;
    const c = new AbortController();
    const key = JSON.stringify([
      raceId,
      query,
      status,
      page,
      size,
      sort,
      direction,
    ]);
    if (loaded.current !== key) setResult(null);
    setLoading(true);
    const timer = setTimeout(() => {
      raceService
        .listRunners(
          raceId,
          { search: query, status, page, page_size: size, sort, direction },
          c.signal,
        )
        .then((data) => {
          if (!c.signal.aborted) {
            loaded.current = key;
            setResult(data);
            mergeRunners(data.items);
            setError("");
          }
        })
        .catch((e) => {
          if (!c.signal.aborted) setError(e.message);
        })
        .finally(() => {
          if (!c.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      c.abort();
      clearTimeout(timer);
    };
  }, [
    raceId,
    hasSnapshot,
    query,
    status,
    page,
    size,
    sort,
    direction,
    refresh,
    mergeRunners,
  ]);
  function filter(k: string, v: string) {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  }
  function order(k: RunnerFilters["sort"]) {
    setSort(k);
    setDirection(sort === k && direction === "desc" ? "asc" : "desc");
    setPage(1);
  }
  return (
    <section className="panel runners-panel">
      <div className="panel-heading">
        <div>
          <h2>Danh sách sinh viên</h2>
          <p>
            {result
              ? `${result.total} kết quả trong giải`
              : "Đang tải danh sách"}
            {loading && result ? " · Đang cập nhật…" : ""}
          </p>
        </div>
      </div>
      <div className="filter-bar">
        <label>
          Tìm tên, mã sinh viên, số báo danh
          <input
            value={query}
            onChange={(e) => filter("q", e.target.value)}
            placeholder="Ví dụ: 01 hoặc tên sinh viên"
          />
        </label>
        <label>
          Trạng thái chạy
          <select
            value={status}
            onChange={(e) => filter("status", e.target.value)}
          >
            <option value="">Tất cả trạng thái</option>
            <option value="ACTIVE">Đang chạy</option>
            <option value="COMPLETED">Hoàn thành</option>
            <option value="PENDING">Chưa bắt đầu</option>
            <option value="ABANDONED">Đã dừng</option>
          </select>
        </label>
        <label>
          Số dòng
          <select
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
          >
            {[10, 20, 50].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>

      </div>
      {query && (
        <p className="map-note">
          Tìm tên, mã và bib trên toàn bộ các trang dữ liệu của bộ lọc hiện tại.
        </p>
      )}
      {error && (
        <p role="alert" className="editor-alert">
          {error}{" "}
          <button className="button" onClick={() => setRefresh((n) => n + 1)}>
            Thử lại
          </button>
        </p>
      )}
      {!result ? (
        <div className="skeleton" role="status">
          Đang tải sinh viên…
        </div>
      ) : (
        <>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Số báo danh</th>
                  <th>Sinh viên</th>
                  <th
                    aria-sort={
                      sort === "lap_count"
                        ? direction === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                  >
                    <button onClick={() => order("lap_count")}>
                      Số vòng ↕
                    </button>
                  </th>
                  <th>Thời gian</th>
                  <th
                    aria-sort={
                      sort === "distance_total_m"
                        ? direction === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                  >
                    <button onClick={() => order("distance_total_m")}>
                      Quãng đường ↕
                    </button>
                  </th>
                  <th>Trạng thái chạy</th>
                  <th>Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((item) => {
                  const live = snapshot?.runners.find(
                    (r) =>
                      r.student_id === item.student_id &&
                      r.run_id === item.run_id,
                  );
                  const r = live ? reconcileRunner(live, item) : item;
                  return (
                    <tr
                      key={r.student_id}
                      onClick={(e) => {
                        if (!(e.target as HTMLElement).closest("button"))
                          setDetail(r);
                      }}
                    >
                      <td>
                        <span className="table-bib">{r.bib}</span>
                      </td>
                      <td>
                        <button
                          className="student-link"
                          onClick={() => setDetail(r)}
                        >
                          <strong>{r.full_name}</strong>
                          <small>{r.student_code}</small>
                        </button>
                      </td>
                      <td>
                        {r.lap_count} / {r.total_laps || "—"}
                      </td>
                      <td className="number-cell">
                        {duration(r.duration_total_s)}
                      </td>
                      <td>{distance(r.distance_total_m)}</td>
                      <td>
                        <Badge status={r.status} />
                      </td>
                      <td>
                        <IconAction
                          label={`Xem chi tiết ${r.full_name}`}
                          onClick={() => setDetail(r)}
                        >
                          <Eye size={18} />
                        </IconAction>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!result.items.length && (
            <Empty
              title={
                query || status
                  ? "Không có kết quả phù hợp"
                  : "Chưa có người tham gia"
              }
              description={
                query || status
                  ? "Thử đổi từ khóa hoặc bộ lọc."
                  : "Danh sách sẽ xuất hiện khi người tham gia được đăng ký."
              }
            />
          )}
          <div className="pagination">
            <span>
              {result.total ? (page - 1) * size + 1 : 0}–
              {Math.min(page * size, result.total)} / {result.total}
            </span>
            <div>
              <button
                className="button"
                disabled={page === 1}
                onClick={() => setPage((n) => n - 1)}
              >
                Trang trước
              </button>
              <span>Trang {page}</span>
              <button
                className="button"
                disabled={page * size >= result.total}
                onClick={() => setPage((n) => n + 1)}
              >
                Trang sau
              </button>
            </div>
          </div>
        </>
      )}
      {detail && detail.race_id === raceId && (
        <Modal
          variant="drawer"
          title="Chi tiết sinh viên"
          onClose={() => setDetail(null)}
        >
          {detail.run_id ? (
            <RunDetail
              key={detail.run_id}
              studentId={detail.student_id}
              runId={detail.run_id}
              embedded
            />
          ) : (
            <div className="empty">
              <h2>{detail.full_name}</h2>
              <p>
                Bib {detail.bib} · {detail.student_code}
              </p>
              <Badge status={detail.status} />
              <p>Chưa có phiên chạy.</p>
            </div>
          )}
        </Modal>
      )}
    </section>
  );
}
