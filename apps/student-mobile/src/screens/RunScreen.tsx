import { config } from "../config";
import { gpsRejectionMessage } from "../services/gpsMessages";
import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import {
  Badge,
  Button,
  Dialog,
  Empty,
  Header,
  Notice,
  Segments,
  date,
  duration,
  pace,
} from "../components/ui";
import { c, s } from "../components/theme";
import Icon from "../components/Icon";
import { elapsed, meters, terminal } from "../domain/model";
import { useApp } from "../state/context";
import RouteMap from "../map/RouteMap";
export default function RunScreen() {
  const { view, engine, route, go, back } = useApp();
  const [now, setNow] = useState(Date.now()),
    [panel, setPanel] = useState("Bản đồ"),
    [finish, setFinish] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const run = view.snapshot?.runs.find((r) => r.id === route.runId),
    tracking = view.tracking;
  const race = view.snapshot?.races.find((r) => r.id === run?.raceId),
    enrollment = view.snapshot?.enrollments.find(
      (e) => e.raceId === run?.raceId,
    );
  if (!run || !race)
    return (
      <Empty
        title="Chưa có phiên chạy"
        text="Check-in rồi bắt đầu tại chi tiết giải."
      />
    );
  const paused = tracking?.capture === "PAUSED" || run.status === "PAUSED";
  const isTerminal = terminal(run),
    verifying = run.status === "VERIFYING";
  const samples = [
    ...run.samples,
    ...(tracking?.runId === run.id
      ? tracking.queue.filter((p) => !run.samples.some((s) => s.id === p.id))
      : []),
  ];
  const last = tracking?.last,
    previous = samples.length > 1 ? samples.at(-2) : undefined;
  const livePace =
    !paused &&
    tracking?.capture === "RECORDING" &&
    last &&
    previous?.segment === last.segment &&
    now - last.timestamp < 15000
      ? pace(last.timestamp - previous.timestamp, meters(previous, last))
      : "—";
  return (
    <View style={[s.page, { backgroundColor: paused ? "#fbf7f2" : c.white }]}>
      {run.boundToInstallation === false && (
        <Notice error>
          Phiên chạy thuộc thiết bị khác. Tiếp tục ghi GPS trên thiết bị đã bắt
          đầu phiên.
        </Notice>
      )}
      <Header
        title={race.name}
        subtitle={`Số báo danh ${enrollment?.bib}`}
        back={back}
        action={
          <Badge
            tone={
              paused
                ? "orange"
                : tracking?.capture === "ERROR"
                  ? "red"
                  : tracking?.capture === "RECORDING"
                    ? "green"
                    : "blue"
            }
          >
            {isTerminal
              ? "Đã kết thúc"
              : verifying
                ? "Đang xác nhận"
                : paused
                  ? "Đang tạm dừng"
                  : tracking?.capture === "ERROR" ||
                      tracking?.capture === "STOPPED"
                    ? "GPS đã ngừng"
                    : tracking?.capture === "RECORDING" &&
                        now - (tracking.lastFix?.timestamp ?? 0) < 15000
                      ? "Đang ghi GPS"
                      : tracking?.capture === "RECORDING"
                        ? "Chờ tín hiệu GPS"
                        : "Đang lấy vị trí"}
          </Badge>
        }
      />
      <ScrollView contentContainerStyle={[s.body, { padding: 16, gap: 12 }]}>
        <Text style={s.small}>
          {view.syncing
            ? "Đang đồng bộ"
            : tracking?.queue.length || tracking?.operations.length
              ? `${tracking?.queue.length ?? 0} mẫu · ${tracking?.operations.length ?? 0} thao tác chờ đồng bộ`
              : "Dữ liệu đã đồng bộ"}{" "}
          · {view.online ? "Có kết nối" : "Mất mạng"}
        </Text>
        <View style={[s.center, { gap: 6, paddingVertical: 10 }]}>
          <Text style={s.text}>Quãng đường GPS tạm tính tại thiết bị</Text>
          <Text
            style={{
              fontFamily: "Inter-Bold",
              fontSize: 70,
              color: c.navy950,
              letterSpacing: -2,
            }}
          >
            {(
              (tracking?.runId === run.id ? tracking.distance : run.distance) /
              1000
            ).toFixed(2)}
            <Text style={{ fontSize: 20, color: c.muted }}> km</Text>
          </Text>
          <Text style={s.small}>Thời gian toàn phiên</Text>
          <Text
            testID="elapsed"
            style={{ fontFamily: "Inter-Bold", fontSize: 32, color: c.blue }}
          >
            {duration(elapsed(run, now))}
          </Text>
        </View>
        <View style={s.row}>
          <View
            style={[
              s.card,
              s.center,
              s.grow,
              { backgroundColor: c.bg, boxShadow: undefined, gap: 6 },
            ]}
          >
            <Text style={s.small}>Nhịp chạy hiện tại</Text>
            <Text style={[s.title, { fontSize: 26 }]}>
              {paused ? "—" : livePace}
            </Text>
            <Text style={s.small}>phút/km</Text>
          </View>
          <View
            style={[
              s.card,
              s.center,
              s.grow,
              { backgroundColor: c.bg, boxShadow: undefined, gap: 6 },
            ]}
          >
            <Text style={s.small}>Vòng được công nhận</Text>
            <Text style={[s.title, { fontSize: 26 }]}>
              {run.laps.length}
              <Text style={{ fontSize: 16, color: c.muted }}>
                /{race.targetLaps}
              </Text>
            </Text>
            <Text style={s.small}>do hệ thống xác nhận</Text>
          </View>
        </View>
        {paused && (
          <View
            style={{
              flexDirection: "row",
              gap: 10,
              backgroundColor: c.orange100,
              padding: 14,
              borderRadius: 16,
            }}
          >
            <Icon name="clock" color={c.orange} />
            <View style={s.grow}>
              <Text style={[s.strong, { color: c.orange }]}>
                GPS đang tạm dừng
              </Text>
              <Text style={[s.small, { color: c.orange }]}>
                Thời gian toàn phiên vẫn tiếp tục. Quãng đường mới sẽ không được
                ghi cho đến khi bạn tiếp tục.
              </Text>
            </View>
          </View>
        )}
        {!!tracking?.error && <Notice error>{tracking.error}</Notice>}
        {config.mode === "api" && !view.online && !isTerminal && (
          <Notice>
            GPS được lưu chờ trên thiết bị. Máy chủ mặc định nhận mẫu trễ tối đa
            5 phút khi phiên còn hoạt động; mẫu vượt giới hạn có thể bị từ chối.
            Tạm dừng, tiếp tục và kết thúc cần kết nối mạng.
          </Notice>
        )}
        {!!tracking?.rejected.length && (
          <Notice error>
            {tracking.rejected.length} mẫu bị từ chối vĩnh viễn; không gửi lại.
            Lý do mới nhất:{" "}
            {gpsRejectionMessage(tracking.rejected.at(-1)?.reason)}
          </Notice>
        )}
        {isTerminal || verifying ? (
          <Button
            variant={run.status === "COMPLETED" ? "success" : "primary"}
            onPress={() =>
              go({ screen: "result", runId: run.id, raceId: race.id })
            }
          >
            {run.status === "COMPLETED"
              ? "Hoàn thành giải chạy · Xem kết quả"
              : verifying
                ? "Đang xác nhận kết quả"
                : "Phiên chạy đã kết thúc · Xem kết quả"}
          </Button>
        ) : null}
        <Segments
          underline
          values={["Bản đồ", "Trạm & vòng"]}
          value={panel}
          onChange={setPanel}
        />
        {panel === "Bản đồ" ? (
          <RouteMap
            race={race}
            samples={samples}
            location={tracking?.lastFix}
          />
        ) : (
          <View style={s.card}>
            <Text style={s.h2}>Trạm kiểm soát</Text>
            {race.checkpoints.map((cp) => (
              <View key={cp.id} style={s.dataRow}>
                <Badge>{cp.id}</Badge>
                <Text style={[s.text, s.grow]}>{cp.name}</Text>
              </View>
            ))}
            <Text style={s.h2}>Lịch sử vòng</Text>
            {run.laps.length ? (
              run.laps.map((lap) => (
                <View style={s.dataRow} key={lap.number}>
                  <Text style={s.strong}>Vòng {lap.number}</Text>
                  <Text style={s.small}>{date(lap.at)} · Đã xác nhận</Text>
                </View>
              ))
            ) : (
              <Text style={s.text}>Chưa có vòng được hệ thống xác nhận.</Text>
            )}
            <Button
              variant="secondary"
              loading={view.syncing}
              onPress={() => void engine.sync()}
            >
              Kiểm tra cập nhật từ hệ thống
            </Button>
          </View>
        )}
      </ScrollView>
      {!isTerminal && !verifying && (
        <View
          style={{
            padding: 16,
            gap: 10,
            backgroundColor: c.white,
            borderTopWidth: 1,
            borderTopColor: c.line,
          }}
        >
          {paused ? (
            <Button
              variant="success"
              icon="gps"
              disabled={!!tracking?.operations.length}
              loading={view.busy}
              onPress={() =>
                run.status === "PAUSED"
                  ? void engine.action("resume", race.id, run.id)
                  : void engine.startCapture(run.id)
              }
            >
              Tiếp tục
            </Button>
          ) : (
            <Button
              variant="secondary"
              icon="clock"
              loading={view.busy}
              onPress={() => void engine.action("pause", race.id, run.id)}
            >
              Tạm dừng
            </Button>
          )}
          {!paused && tracking?.capture !== "RECORDING" && (
            <Button
              variant="secondary"
              onPress={() => void engine.startCapture(run.id)}
            >
              Lấy lại GPS
            </Button>
          )}
          <Button
            variant="danger"
            disabled={view.busy}
            onPress={() => setFinish(true)}
          >
            Kết thúc sớm
          </Button>
        </View>
      )}
      {finish && (
        <Dialog
          title="Kết thúc phiên chạy?"
          close={() => {
            if (!view.busy) setFinish(false);
          }}
        >
          <Text style={s.h2}>
            {run.laps.length} / {race.targetLaps} vòng đã xác nhận
          </Text>
          <Text style={s.text}>
            Kết thúc sớm không đồng nghĩa hoàn thành. Kết quả được xác định theo
            dữ liệu hệ thống đã ghi nhận.
          </Text>
          {view.error && <Notice error>{view.error}</Notice>}
          <Button
            variant="danger"
            loading={view.busy}
            onPress={() =>
              void engine.action("finish", race.id, run.id).then((ok) => {
                if (ok) {
                  setFinish(false);
                  go({ screen: "result", runId: run.id, raceId: race.id });
                }
              })
            }
          >
            Xác nhận kết thúc
          </Button>
          <Button variant="secondary" onPress={() => setFinish(false)}>
            Quay lại phiên chạy
          </Button>
        </Dialog>
      )}
    </View>
  );
}
