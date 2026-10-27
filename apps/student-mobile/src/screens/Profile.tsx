import { useState } from "react";
import { Linking, ScrollView, Text, View } from "react-native";
import { Badge, Button, Chips, Dialog, Header, Notice } from "../components/ui";
import { c, s } from "../components/theme";
import { useApp } from "../state/context";
import { config } from "../config";
import { demoGps, mock } from "../state/runtime";
import type { Scenario } from "../services/mock";
export default function Profile() {
  const { view, engine } = useApp();
  const [dialog, setDialog] = useState<"logout" | "reset" | undefined>(),
    [scenario, setScenario] = useState<string>(mock.scenario),
    [gpsIssue, setGpsIssue] = useState<string>(demoGps.issue);
  const student = view.auth!.student;
  return (
    <View style={s.page}>
      <Header title="Hồ sơ" />
      <ScrollView contentContainerStyle={s.body}>
        <View style={[s.card, s.center, { padding: 22, borderRadius: 24 }]}>
          <View
            style={{
              width: 88,
              height: 88,
              borderRadius: 44,
              backgroundColor: c.navy,
              borderWidth: 6,
              borderColor: c.blue100,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={[s.title, { fontSize: 24, color: c.white }]}>
              {student.name
                .split(" ")
                .slice(-2)
                .map((p) => p[0])
                .join("")}
            </Text>
          </View>
          <Text style={[s.title, { fontSize: 22, textAlign: "center" }]}>
            {student.name}
          </Text>
          <Text style={s.small}>Sinh viên Đại học Kinh tế Quốc dân</Text>
          <Badge>Mã sinh viên: {student.code}</Badge>
        </View>
        <View style={s.card}>
          <Text style={s.h2}>Thông tin học tập</Text>
          {[
            ["Khoa", student.faculty],
            ["Lớp", student.className],
          ].map(([label, value]) => (
            <View key={label} style={s.dataRow}>
              <Text style={s.text}>{label}</Text>
              <Text style={s.strong}>{value}</Text>
            </View>
          ))}
          <Text style={s.small}>
            Nếu thông tin chưa chính xác, vui lòng liên hệ Ban tổ chức để được
            hỗ trợ.
          </Text>
        </View>
        <View style={s.card}>
          <Text style={s.h2}>Số báo danh theo giải</Text>
          {view.snapshot?.enrollments.length ? (
            view.snapshot.enrollments.map((e) => (
              <View key={e.raceId} style={s.dataRow}>
                <Text style={[s.strong, s.grow]}>
                  {view.snapshot?.races.find((r) => r.id === e.raceId)?.name}
                </Text>
                <Text style={[s.strong, { color: c.blue }]}>{e.bib}</Text>
              </View>
            ))
          ) : (
            <Text style={s.text}>Bạn chưa đăng ký giải nào.</Text>
          )}
        </View>
        <Button
          variant="secondary"
          icon="gps"
          onPress={() =>
            void Linking.openSettings().catch((e) => engine.report(e))
          }
        >
          Cài đặt quyền vị trí
        </Button>
        <Button
          variant="danger"
          icon="logout"
          onPress={() => setDialog("logout")}
        >
          Đăng xuất
        </Button>
        {config.mode === "mock" && (
          <View style={s.card}>
            <Text style={s.h2}>Công cụ demo / kiểm thử</Text>
            <Notice>
              Backend mô phỏng ·{" "}
              {config.gps === "demo"
                ? "GPS giả được gắn nhãn"
                : "GPS thật của thiết bị"}
              . Dữ liệu không gửi tới backend thật.
            </Notice>
            <Text style={s.small}>Kịch bản dịch vụ (normal để khôi phục)</Text>
            <Chips
              values={[
                "normal",
                "offline",
                "empty",
                "start-error",
                "ambiguous",
                "ack-lost",
                "expired",
              ]}
              value={scenario}
              onChange={(value) => {
                mock.scenario = value as Scenario;
                setScenario(value);
                void engine.refresh();
              }}
            />
            {config.gps === "demo" && (
              <>
                <Text style={s.small}>Kịch bản GPS</Text>
                <Chips
                  values={[
                    "none",
                    "permission",
                    "outside",
                    "inaccurate",
                    "timeout",
                  ]}
                  value={gpsIssue}
                  onChange={(value) => {
                    demoGps.issue = value as typeof demoGps.issue;
                    setGpsIssue(value);
                  }}
                />
              </>
            )}
            <Button
              variant="secondary"
              disabled={view.busy || view.syncing}
              onPress={() => setDialog("reset")}
            >
              Đặt lại dữ liệu demo
            </Button>
          </View>
        )}
      </ScrollView>
      {dialog && (
        <Dialog
          title={
            dialog === "logout"
              ? "Đăng xuất tài khoản?"
              : "Đặt lại dữ liệu demo?"
          }
          close={() => setDialog(undefined)}
        >
          <Text style={s.text}>
            {dialog === "logout"
              ? "GPS sẽ ngừng thu. Dữ liệu chưa đồng bộ được giữ riêng cho tài khoản này; đăng xuất không kết thúc phiên trên hệ thống. Đăng nhập lại để xử lý dữ liệu còn chờ."
              : "Chỉ xóa dữ liệu demo và hàng đợi của tài khoản hiện tại trên máy này. Thao tác dùng để lặp lại kịch bản kiểm thử."}
          </Text>
          <Button
            variant="danger"
            disabled={dialog === "reset" && (view.busy || view.syncing)}
            onPress={() => {
              if (dialog === "reset") {
                mock.scenario = "normal";
                demoGps.issue = "none";
                setScenario("normal");
                setGpsIssue("none");
              }
              const action =
                dialog === "logout" ? engine.logout() : engine.resetDemo();
              void action.catch((e) => engine.report(e));
              setDialog(undefined);
            }}
          >
            Xác nhận {dialog === "logout" ? "đăng xuất" : "đặt lại"}
          </Button>
          <Button variant="secondary" onPress={() => setDialog(undefined)}>
            Quay lại
          </Button>
        </Dialog>
      )}
    </View>
  );
}
