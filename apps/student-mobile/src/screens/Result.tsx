import { useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import {
  Badge,
  Button,
  Dialog,
  Empty,
  Header,
  Notice,
  date,
  duration,
  pace,
} from "../components/ui";
import Icon from "../components/Icon";
import { c, s } from "../components/theme";
import { activeTime, elapsed } from "../domain/model";
import { useApp } from "../state/context";
import RouteMap from "../map/RouteMap";
export default function Result() {
  const { route, view, engine, go, back } = useApp(),
    [checkout, setCheckout] = useState(false);
  const run = view.snapshot?.runs.find((r) => r.id === route.runId),
    race = view.snapshot?.races.find((r) => r.id === run?.raceId),
    enrollment = view.snapshot?.enrollments.find(
      (e) => e.raceId === run?.raceId,
    );
  if (!run || !race)
    return (
      <Empty title="Chưa có kết quả" text="Đang chờ dữ liệu phiên chạy." />
    );
  const pending = run.status === "VERIFYING",
    complete = run.status === "COMPLETED";
  return (
    <View style={s.page}>
      <Header
        title={
          route.screen === "history-detail"
            ? "Chi tiết phiên chạy"
            : "Kết quả phiên chạy"
        }
        back={back}
      />
      <ScrollView contentContainerStyle={s.body}>
        <View style={[s.center, { paddingVertical: 12, gap: 12 }]}>
          <View
            style={{
              width: 76,
              height: 76,
              backgroundColor: complete ? c.green100 : c.orange100,
              borderRadius: 38,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {pending ? (
              <ActivityIndicator color={c.navy} />
            ) : (
              <Icon
                name={complete ? "check" : "flag"}
                size={36}
                color={complete ? c.green : c.orange}
              />
            )}
          </View>
          <Text style={[s.title, { textAlign: "center", fontSize: 27 }]}>
            {pending
              ? "Đang xác nhận kết quả"
              : complete
                ? "Hoàn thành giải chạy"
                : "Phiên chạy đã kết thúc"}
          </Text>
          <Text style={[s.text, { textAlign: "center" }]}>{race.name}</Text>
          <Badge tone={pending ? "blue" : complete ? "green" : "orange"}>
            {pending
              ? "Chờ hệ thống xác nhận"
              : complete
                ? "Đạt mục tiêu"
                : "Chưa đạt mục tiêu"}
          </Badge>
        </View>
        {pending ? (
          <View style={s.card}>
            <Text style={s.text}>
              Phiên đã dừng thu GPS. Kết quả chính thức sẽ hiển thị sau khi hệ
              thống xử lý xong.
            </Text>
            <Button loading={view.syncing} onPress={() => void engine.sync()}>
              Cập nhật kết quả
            </Button>
          </View>
        ) : (
          <>
            <View style={s.card}>
              <View style={s.between}>
                <Text style={s.h2}>Kết quả đã xác nhận</Text>
                <Badge>{enrollment?.bib}</Badge>
              </View>
              {[
                ["Số vòng", `${run.laps.length} / ${race.targetLaps}`],
                ["Quãng đường", `${(run.distance / 1000).toFixed(2)} km`],
                ["Thời gian toàn phiên", duration(elapsed(run))],
                ["Thời gian hoạt động", duration(activeTime(run))],
                [
                  "Nhịp trung bình",
                  `${pace(activeTime(run), run.distance)} phút/km`,
                ],
              ].map(([label, value]) => (
                <View style={s.dataRow} key={label}>
                  <Text style={s.text}>{label}</Text>
                  <Text style={s.strong}>{value}</Text>
                </View>
              ))}
            </View>
            <View style={s.card}>
              <Text style={s.h2}>Đường GPS theo đoạn</Text>
              <RouteMap race={race} samples={run.samples} compact />
              <Text style={s.small}>
                Các đoạn sau tạm dừng được vẽ riêng; không nối qua khoảng nghỉ.
              </Text>
            </View>
            <View style={s.card}>
              <Text style={s.h2}>Lịch sử vòng</Text>
              {run.laps.length ? (
                run.laps.map((lap) => (
                  <View key={lap.number} style={s.dataRow}>
                    <Text style={s.strong}>Vòng {lap.number}</Text>
                    <Text style={s.small}>{date(lap.at)} · Đã xác nhận</Text>
                  </View>
                ))
              ) : (
                <Text style={s.text}>
                  Không có vòng được công nhận trong phiên này.
                </Text>
              )}
            </View>
            <View style={s.card}>
              <Text style={s.h2}>Điểm danh</Text>
              <Text style={s.text}>
                Check-in:{" "}
                {enrollment?.checkedInAt
                  ? date(enrollment.checkedInAt)
                  : "Chưa check-in"}
              </Text>
              <Text style={s.text}>
                Check-out:{" "}
                {enrollment?.checkedOutAt
                  ? date(enrollment.checkedOutAt)
                  : "Chưa check-out"}
              </Text>
              <Text style={s.small}>
                Check-out chỉ ghi nhận điểm danh, không thay đổi kết quả chạy.
              </Text>
              {enrollment?.checkedInAt && !enrollment.checkedOutAt && (
                <Button
                  icon="gps"
                  disabled={race.actions?.can_check_out === false}
                  onPress={() => setCheckout(true)}
                >
                  Check-out bằng GPS
                </Button>
              )}
            </View>
          </>
        )}
        <Button variant="secondary" onPress={() => go({ screen: "history" })}>
          Xem lịch sử các giải
        </Button>
        <Button variant="ghost" onPress={() => go({ screen: "races" })}>
          Về Giải chạy
        </Button>
      </ScrollView>
      {checkout && (
        <Dialog
          title="Check-out bằng GPS"
          close={() => {
            if (!view.busy) setCheckout(false);
          }}
        >
          <Text style={s.text}>
            App sẽ xin một vị trí mới để hệ thống xác nhận điểm danh ra về.
          </Text>
          {view.error && <Notice error>{view.error}</Notice>}
          <Button
            loading={view.busy}
            onPress={() =>
              void engine.action("checkout", race.id).then((ok) => {
                if (ok) setCheckout(false);
              })
            }
          >
            Lấy vị trí và check-out
          </Button>
        </Dialog>
      )}
    </View>
  );
}
