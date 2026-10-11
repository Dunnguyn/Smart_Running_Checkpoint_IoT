import React from "react";
import ReactDOM from "react-dom/client";
import {
  createBrowserRouter,
  createRoutesFromElements,
  RouterProvider,
  Route,
  Link,
} from "react-router-dom";
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
          <p>Theo dõi tiến độ và chi tiết phiên chạy của giải đang chọn</p>
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
const router = createBrowserRouter(
  createRoutesFromElements(
    <Route
      element={
        <LiveProvider>
          <Shell />
        </LiveProvider>
      }
    >
      <Route index element={<Dashboard />} />
      <Route path="live" element={<Dashboard mapOnly />} />
      <Route path="runners" element={<RunnersPage />} />
      <Route path="runners/:studentId/runs/:runId" element={<RunDetail />} />
      <Route path="races" element={<Races />} />
      <Route path="races/:raceId" element={<Races />} />
      <Route path="checkpoints" element={<Checkpoints />} />
      <Route path="checkpoints/:checkpointId" element={<Checkpoints />} />
      <Route path="*" element={<Placeholder title="Không tìm thấy trang" />} />
    </Route>,
  ),
);
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
