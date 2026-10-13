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
import { People } from "../features/runners/People";
import { RunDetail } from "../features/runners/RunDetail";
import { SimulationPanel } from "../features/races/SimulationPanel";
import { Races } from "../features/races/Races";
import { Checkpoints } from "../features/checkpoints/Checkpoints";
import { Empty } from "../components/ui";
import "leaflet/dist/leaflet.css";
import "../styles.css";
import "../design.css";
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
      <People />
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
          title="Đường dẫn không tồn tại"
          description="Kiểm tra lại địa chỉ hoặc trở về tổng quan để tiếp tục."
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
      <Route
        path="simulation"
        element={
          <>
            <div className="page-title">
              <div>
                <h1>Mô phỏng giải chạy</h1>
                <p>
                  Quản lý phiên mô phỏng và theo dõi kết quả backend ghi nhận.
                </p>
              </div>
            </div>
            <SimulationPanel />
          </>
        }
      />
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
