import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { Shell } from "../layouts/Shell";
import { LiveProvider } from "./LiveProvider";
import { Dashboard, SimulationControls } from "../features/dashboard/Dashboard";
import { RunnerTable } from "../features/runners/RunnerTable";
import { RunDetail } from "../features/runners/RunDetail";
import { Races } from "../features/races/Races";
import { Checkpoints } from "../features/checkpoints/Checkpoints";
import { Empty } from "../components/ui";
import "leaflet/dist/leaflet.css";
import "../styles.css";
function RunnersPage() {
  return (
    <>
      <div className="page-title">
        <div>
          <div className="eyebrow">QUẢN LÝ SINH VIÊN</div>
          <h1>Sinh viên tham gia</h1>
          <p>NEU RUN 2026 · Theo dõi tiến độ và chi tiết phiên chạy</p>
        </div>
        <SimulationControls />
      </div>
      <RunnerTable />
    </>
  );
}
function Placeholder({ title }: { title: string }) {
  return (
    <>
      <div className="page-title">
        <div>
          <div className="eyebrow">KHÔNG GIAN QUẢN TRỊ</div>
          <h1>{title}</h1>
        </div>
      </div>
      <section className="panel">
        <Empty
          title={`${title} đang được chuẩn bị`}
          description="Chức năng chưa có trong bản demo frontend. Cần xác nhận contract và nghiệp vụ với nhóm backend."
        />
        <Link className="panel-link" to="/">
          Trở về tổng quan →
        </Link>
      </section>
    </>
  );
}
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <LiveProvider>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<Dashboard />} />
            <Route path="live" element={<Dashboard mapOnly />} />
            <Route path="runners" element={<RunnersPage />} />
            <Route
              path="runners/:studentId/runs/:runId"
              element={<RunDetail />}
            />
            <Route path="races" element={<Races />} />
            <Route path="races/:raceId" element={<Races />} />
            <Route path="checkpoints" element={<Checkpoints />} />
            <Route path="checkpoints/:checkpointId" element={<Checkpoints />} />
            <Route path="reports" element={<Placeholder title="Báo cáo" />} />
            <Route path="settings" element={<Placeholder title="Cài đặt" />} />
            <Route
              path="*"
              element={<Placeholder title="Không tìm thấy trang" />}
            />
          </Route>
        </Routes>
      </LiveProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
