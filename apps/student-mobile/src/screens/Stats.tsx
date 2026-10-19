import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import Svg, { Circle, Polyline } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import {
  Empty,
  Header,
  Segments,
  date,
  duration,
  pace,
} from "../components/ui";
import { c, s } from "../components/theme";
import Icon, { type IconName } from "../components/Icon";
import { activeTime } from "../domain/model";
import { statistics } from "../domain/statistics";
import { useApp } from "../state/context";
export default function Stats() {
  const { view } = useApp();
  const [range, setRange] = useState("Tháng");
  const data = statistics(view.snapshot?.runs ?? [], range);
  const chart = [...data.runs]
    .sort((a, b) => a.startedAt - b.startedAt)
    .slice(-8);
  const max = Math.max(1, ...chart.map((r) => r.distance));
  const paces = chart
    .filter((r) => r.distance > 0)
    .map((r) => activeTime(r) / r.distance);
  const paceMax = Math.max(1, ...paces),
    paceMin = Math.min(...paces);
  const points = paces.map(
    (value, index) =>
      `${20 + (index / Math.max(1, paces.length - 1)) * 260},${15 + ((value - paceMin) / Math.max(1, paceMax - paceMin)) * 70}`,
  );
  return (
    <View style={s.page}>
      <Header title="Thống kê" />
      <ScrollView contentContainerStyle={s.body}>
        <Segments
          values={["Tuần", "Tháng", "Toàn bộ"]}
          value={range}
          onChange={setRange}
        />
        {!data.runs.length ? (
          <Empty
            title="Chưa có kết quả trong khoảng này"
            text="Các phiên chạy đã được hệ thống xác nhận sẽ xuất hiện tại đây."
          />
        ) : (
          <>
            <LinearGradient
              colors={[c.navy, c.blue700]}
              style={{
                borderRadius: 24,
                padding: 22,
                gap: 8,
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  position: "absolute",
                  width: 160,
                  height: 160,
                  borderRadius: 80,
                  borderWidth: 12,
                  borderColor: "rgba(255,255,255,.1)",
                  right: -40,
                  top: -32,
                }}
              />
              <Text style={[s.text, { color: "#ffffffbb" }]}>
                Tổng quãng đường đã xác nhận
              </Text>
              <Text
                style={{
                  fontFamily: "Inter-Bold",
                  color: c.white,
                  fontSize: 40,
                }}
              >
                {(data.distance / 1000).toFixed(2)}{" "}
                <Text style={{ fontSize: 20 }}>km</Text>
              </Text>
              <Text style={[s.small, { color: "#ffffffcc" }]}>
                {data.runs.length} phiên chạy trong khoảng đã chọn
              </Text>
            </LinearGradient>
            <View style={s.wrap}>
              {[
                ["Giải đã tham gia", String(data.participated)],
                ["Giải hoàn thành", String(data.completed)],
                ["Thời gian toàn phiên", duration(data.totalMs)],
                ["Nhịp trung bình", pace(data.activeMs, data.distance)],
              ].map(([label, value], index) => (
                <View
                  key={label}
                  style={[s.card, { width: "47%", flexGrow: 1, gap: 5 }]}
                >
                  <View style={s.row}>
                    <Icon
                      name={
                        (["flag", "check", "clock", "route"] as IconName[])[
                          index
                        ]
                      }
                      color={c.blue700}
                      size={18}
                    />
                    <Text style={[s.small, { flex: 1 }]}>{label}</Text>
                  </View>
                  <Text style={[s.title, { fontSize: 22 }]}>{value}</Text>
                </View>
              ))}
            </View>
            <View style={s.card}>
              <Text style={s.h2}>Quãng đường</Text>
              <Text style={s.small}>
                Theo phiên · km ·{" "}
                {range === "Tuần"
                  ? "7 ngày gần nhất"
                  : range === "Tháng"
                    ? "30 ngày gần nhất"
                    : "Toàn bộ"}
              </Text>
              <View
                style={{
                  height: 180,
                  flexDirection: "row",
                  alignItems: "flex-end",
                  gap: 12,
                }}
              >
                {chart.map((run) => (
                  <View
                    key={run.id}
                    style={{ flex: 1, alignItems: "center", gap: 8 }}
                  >
                    <Text style={s.small}>
                      {(run.distance / 1000).toFixed(2)}
                    </Text>
                    <View
                      style={{
                        width: "75%",
                        height: Math.max(3, (run.distance / max) * 115),
                        borderTopLeftRadius: 10,
                        borderTopRightRadius: 10,
                        backgroundColor: c.blue700,
                      }}
                    />
                    <Text style={[s.small, { fontSize: 9 }]}>
                      {new Date(run.endedAt!).toLocaleDateString("vi-VN", {
                        day: "2-digit",
                        month: "2-digit",
                      })}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
            <View style={s.card}>
              <Text style={s.h2}>Xu hướng nhịp chạy</Text>
              <Text style={s.small}>Phút/km · theo thời gian hoạt động</Text>
              {points.length ? (
                <Svg
                  accessibilityLabel="Xu hướng nhịp chạy các phiên"
                  width="100%"
                  height={120}
                  viewBox="0 0 300 100"
                >
                  <Polyline
                    points={points.join(" ")}
                    stroke={c.blue700}
                    fill="none"
                    strokeWidth={3}
                  />
                  {points.map((point, i) => (
                    <Circle
                      key={i}
                      cx={Number(point.split(",")[0])}
                      cy={Number(point.split(",")[1])}
                      r={4}
                      fill={c.blue700}
                    />
                  ))}
                </Svg>
              ) : (
                <Text style={s.text}>Chưa đủ dữ liệu nhịp chạy.</Text>
              )}
              {chart.map((run) => (
                <View key={run.id} style={s.between}>
                  <Text style={s.small}>{date(run.startedAt)}</Text>
                  <Text style={s.strong}>
                    {pace(activeTime(run), run.distance)}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}
