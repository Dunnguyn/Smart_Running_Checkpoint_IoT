import { useState } from "react";
import { ImageBackground, ScrollView, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  Badge,
  Button,
  Dialog,
  Empty,
  Header,
  Notice,
  date,
} from "../components/ui";
import { c, s } from "../components/theme";
import Icon from "../components/Icon";
import {
  canRegister,
  canCheckIn,
  checkInLabel,
  canStart,
  registrationLabel,
  terminal,
} from "../domain/model";
import { useApp } from "../state/context";
import RouteMap from "../map/RouteMap";
import { config } from "../config";
export default function RaceDetail() {
  const { route, view, engine, go, back } = useApp();
  const [dialog, setDialog] = useState<
    "register" | "success" | "checkin" | "start" | undefined
  >();
  const race = view.snapshot?.races.find((r) => r.id === route.raceId);
  const enrollment = view.snapshot?.enrollments.find(
    (e) => e.raceId === route.raceId,
  );
  const ongoing = view.snapshot?.runs.find((r) => !terminal(r));
  if (!race)
    return (
      <Empty
        title="Không tìm thấy giải"
        text="Hãy tải lại danh sách giải chạy."
      />
    );
  const execute = async (kind: "register" | "checkin" | "start") => {
    const ok = await engine.action(kind, race.id);
    if (!ok) return;
    if (kind === "register") setDialog("success");
    else if (kind === "start") {
      setDialog(undefined);
      const run = engine
        .get()
        .snapshot?.runs.find((r) => r.raceId === race.id && !terminal(r));
      if (run) go({ screen: "run", runId: run.id, raceId: race.id });
    } else setDialog(undefined);
  };
  return (
    <View style={s.page}>
      <Header title="Chi tiết giải" back={back} />
      <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
        <ImageBackground
          source={require("../../assets/neu-run-brand.jpg")}
          style={{ minHeight: 240, overflow: "hidden" }}
          resizeMode="cover"
        >
          <LinearGradient
            colors={["rgba(8,27,58,.22)", "rgba(8,27,58,.9)"]}
            style={{
              minHeight: 240,
              justifyContent: "flex-end",
              padding: 20,
              gap: 10,
            }}
          >
            <Badge>
              {race.phase === "LIVE" ? "Đang diễn ra" : registrationLabel(race)}
            </Badge>
            <Text
              accessibilityRole="header"
              style={[s.title, { color: c.white, fontSize: 35 }]}
            >
              {race.name.replace(" Run ", "\nRun ")}
            </Text>
            <Text style={[s.text, { color: "#ffffffcc" }]}>
              Run your campus. Own your pace.
            </Text>
          </LinearGradient>
        </ImageBackground>
        <View style={s.body}>
          <View style={s.wrap}>
            <View
              style={[s.card, s.row, { flex: 1, minWidth: 130, padding: 12 }]}
            >
              <Icon name="calendar" />
              <View style={s.grow}>
                <Text style={s.small}>Thời gian</Text>
                <Text style={[s.strong, { fontSize: 12 }]}>
                  {date(race.startsAt)}
                </Text>
              </View>
            </View>
            <View
              style={[s.card, s.row, { flex: 1, minWidth: 130, padding: 12 }]}
            >
              <Icon name="pin" />
              <View style={s.grow}>
                <Text style={s.small}>Địa điểm</Text>
                <Text style={[s.strong, { fontSize: 12 }]}>{race.place}</Text>
              </View>
            </View>
          </View>
          <View style={s.card}>
            <Text style={s.h2}>Thông tin giải</Text>
            <Text style={s.text}>
              {race.description ??
                "Giải chạy dành cho sinh viên NEU, khuyến khích tinh thần vận động và kết nối trong khuôn viên trường."}
            </Text>
            <View style={s.row}>
              <View
                style={{
                  flex: 1,
                  backgroundColor: c.blue50,
                  padding: 12,
                  borderRadius: 16,
                }}
              >
                <Text style={s.small}>Độ dài một vòng</Text>
                <Text style={s.strong}>
                  {race.lapMeters > 0
                    ? `Khoảng ${race.lapMeters} m`
                    : "Chưa có thông tin"}
                </Text>
              </View>
              <View
                style={{
                  flex: 1,
                  backgroundColor: c.blue50,
                  padding: 12,
                  borderRadius: 16,
                }}
              >
                <Text style={s.small}>Mục tiêu</Text>
                <Text style={s.strong}>
                  {race.targetDistanceMeters
                    ? `Tích lũy ${race.targetDistanceMeters / 1000} km`
                    : `${race.targetLaps} vòng được công nhận`}
                </Text>
              </View>
            </View>
          </View>
          <View style={s.card}>
            <Text style={s.h2}>Tuyến chạy</Text>
            <RouteMap race={race} compact />
            <Button
              variant="ghost"
              icon="map"
              onPress={() => go({ screen: "map", raceId: race.id })}
            >
              Xem bản đồ chi tiết
            </Button>
          </View>
          <View style={s.card}>
            <View style={s.between}>
              <Text style={s.h2}>Đăng ký</Text>
              {enrollment && <Badge tone="green">Đã đăng ký</Badge>}
            </View>
            {enrollment ? (
              <View
                style={{
                  borderWidth: 1,
                  borderStyle: "dashed",
                  borderColor: c.blue700,
                  backgroundColor: c.blue50,
                  borderRadius: 12,
                  padding: 14,
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <Text style={s.small}>Số báo danh của bạn</Text>
                <Text style={[s.title, { color: c.navy, letterSpacing: 1 }]}>
                  {enrollment.bib}
                </Text>
                <Text style={s.small}>Cấp riêng cho {race.name}</Text>
              </View>
            ) : (
              <>
                <Text style={s.text}>Hạn đăng ký: {date(race.closesAt)}</Text>
                <Text style={s.text}>{registrationLabel(race)}</Text>
              </>
            )}
          </View>
          {enrollment && (
            <View style={s.card}>
              <View style={s.between}>
                <Text style={s.h2}>Điểm danh</Text>
                <Badge tone={enrollment.checkedInAt ? "green" : "gray"}>
                  {enrollment.checkedOutAt
                    ? "Đã check-out"
                    : enrollment.checkedInAt
                      ? "Đã check-in"
                      : "Chưa check-in"}
                </Badge>
              </View>
              <Text style={s.text}>
                Điểm danh bằng vị trí hiện tại. Check-in không tự bắt đầu chạy.
              </Text>
              {enrollment.checkedInAt && (
                <Text style={s.small}>{date(enrollment.checkedInAt)}</Text>
              )}
              {!enrollment.checkedInAt && (
                <Button
                  icon="gps"
                  disabled={
                    !canCheckIn(race) ||
                    !view.online ||
                    view.busy ||
                    !!enrollment.checkedOutAt
                  }
                  onPress={() => setDialog("checkin")}
                >
                  {checkInLabel(race)}
                </Button>
              )}
              {!enrollment.checkedInAt && (
                <>
                  <Text style={s.small}>
                    Quyền điểm danh được cập nhật từ máy chủ mỗi 5 giây khi ứng
                    dụng đang mở. Nếu chưa khả dụng, kiểm tra lịch với ban tổ
                    chức. LIVE không tự mở check-in.
                  </Text>
                  <Button
                    variant="ghost"
                    loading={view.syncing}
                    disabled={!view.online || view.busy}
                    onPress={() => void engine.sync()}
                  >
                    Làm mới quyền điểm danh
                  </Button>
                </>
              )}
            </View>
          )}
        </View>
      </ScrollView>
      {!enrollment?.checkedOutAt && (
        <View
          style={{
            padding: 16,
            backgroundColor: c.white,
            borderTopWidth: 1,
            borderTopColor: c.line,
          }}
        >
          {!enrollment ? (
            <Button
              disabled={!canRegister(race)}
              onPress={() => setDialog("register")}
            >
              Đăng ký tham gia
            </Button>
          ) : !enrollment.checkedInAt ? (
            <Button disabled>Hãy check-in trước khi bắt đầu</Button>
          ) : ongoing ? (
            <Button
              onPress={() =>
                go({ screen: "run", runId: ongoing.id, raceId: ongoing.raceId })
              }
            >
              Quay lại phiên đang có
            </Button>
          ) : (
            <Button
              icon="flag"
              onPress={() => setDialog("start")}
              disabled={!canStart(race)}
            >
              Bắt đầu chạy
            </Button>
          )}
        </View>
      )}
      {dialog && (
        <Dialog
          title={
            dialog === "register"
              ? "Xác nhận đăng ký"
              : dialog === "success"
                ? "Đăng ký thành công"
                : dialog === "checkin"
                  ? "Check-in bằng GPS"
                  : "Sẵn sàng bắt đầu?"
          }
          close={() => {
            if (!view.busy) setDialog(undefined);
          }}
        >
          <Text style={s.text}>
            {dialog === "register"
              ? `Bạn đăng ký ${race.name}. Số báo danh sẽ được hệ thống cấp ngay khi xác nhận.`
              : dialog === "success"
                ? `${race.name} · Số báo danh ${enrollment?.bib ?? ""}`
                : dialog === "checkin"
                  ? "NEU RUN cần một vị trí GPS mới để kiểm tra bạn trong vùng điểm danh. Cho phép truy cập vị trí khi hệ điều hành yêu cầu."
                  : `Khi bấm bắt đầu, bạn đồng ý cho NEU RUN thu thập vị trí GPS để xác nhận tuyến chạy và kết quả (gps-v1). Chỉ bắt đầu ghi tuyến khi phiên được hệ thống xác nhận. ${config.background ? "Bản build này ghi GPS khi khóa màn hình; hệ điều hành sẽ hỏi quyền vị trí nền. Bạn có thể ngừng bằng Tạm dừng." : "Bản build này thu GPS khi app ở màn hình trước. Ra nền sẽ ngừng thu và cần lấy lại GPS khi quay lại."}`}
          </Text>
          {dialog === "success" && (
            <View
              style={{
                borderWidth: 1,
                borderStyle: "dashed",
                borderColor: c.blue700,
                padding: 18,
                borderRadius: 12,
                backgroundColor: c.blue50,
                alignItems: "center",
                gap: 6,
              }}
            >
              <Text style={s.small}>Số báo danh</Text>
              <Text style={s.title}>{enrollment?.bib}</Text>
            </View>
          )}
          {view.error && <Notice error>{view.error}</Notice>}
          <Button
            loading={view.busy}
            onPress={() =>
              dialog === "success"
                ? setDialog(undefined)
                : void execute(
                    dialog === "register"
                      ? "register"
                      : dialog === "checkin"
                        ? "checkin"
                        : "start",
                  )
            }
          >
            {dialog === "register"
              ? "Xác nhận đăng ký"
              : dialog === "success"
                ? "Xem thông tin tham gia"
                : dialog === "checkin"
                  ? "Lấy vị trí và check-in"
                  : "Bắt đầu phiên chạy"}
          </Button>
        </Dialog>
      )}
    </View>
  );
}
