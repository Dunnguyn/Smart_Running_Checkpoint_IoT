import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  Badge,
  Button,
  Chips,
  Empty,
  Header,
  date,
  duration,
} from "../components/ui";
import Icon from "../components/Icon";
import { c, s } from "../components/theme";
import { elapsed, terminal } from "../domain/model";
import { useApp } from "../state/context";
export default function History() {
  const { view, go } = useApp();
  const [filter, setFilter] = useState("Tất cả kết quả"),
    [limit, setLimit] = useState(10);
  const list = (view.snapshot?.runs ?? [])
    .filter(
      (r) =>
        terminal(r) &&
        (filter === "Tất cả kết quả" ||
          (filter === "Đạt mục tiêu"
            ? r.status === "COMPLETED"
            : r.status === "ENDED")),
    )
    .sort((a, b) => b.startedAt - a.startedAt);
  return (
    <View style={s.page}>
      <Header title="Lịch sử" />
      <ScrollView contentContainerStyle={s.body}>
        <Chips
          values={["Tất cả kết quả", "Đạt mục tiêu", "Chưa đạt"]}
          value={filter}
          onChange={setFilter}
        />
        <Text style={s.small}>{list.length} phiên chạy</Text>
        {!list.length && (
          <Empty
            title="Chưa có phiên chạy"
            text="Kết quả các giải đã tham gia sẽ xuất hiện tại đây."
          />
        )}
        {list.slice(0, limit).map((run) => {
          const race = view.snapshot?.races.find((r) => r.id === run.raceId);
          return (
            <Pressable
              key={run.id}
              accessibilityRole="button"
              accessibilityLabel={`Chi tiết ${race?.name}`}
              onPress={() =>
                go({
                  screen: "history-detail",
                  runId: run.id,
                  raceId: run.raceId,
                })
              }
              style={[s.card, { borderRadius: 20 }]}
            >
              <View style={s.row}>
                <View
                  style={{
                    width: 48,
                    borderRadius: 12,
                    backgroundColor: c.blue50,
                    paddingVertical: 12,
                    alignItems: "center",
                  }}
                >
                  <Text style={[s.h2, { color: c.blue }]}>
                    {new Date(run.startedAt).getDate()}
                  </Text>
                  <Text style={s.small}>
                    T{new Date(run.startedAt).getMonth() + 1}
                  </Text>
                </View>
                <View style={[s.grow, { gap: 7 }]}>
                  <Text style={s.h3}>{race?.name}</Text>
                  <Badge tone={run.status === "COMPLETED" ? "green" : "orange"}>
                    {run.status === "COMPLETED" ? "Đạt mục tiêu" : "Chưa đạt"}
                  </Badge>
                </View>
                <Icon name="chevron" />
              </View>
              <Text style={s.small}>
                {date(run.startedAt)} · {race?.place}
              </Text>
              <View style={s.between}>
                {[
                  [`${(run.distance / 1000).toFixed(2)} km`, "Quãng đường"],
                  [duration(elapsed(run)), "Thời gian"],
                  [`${run.laps.length}/${race?.targetLaps}`, "Số vòng"],
                ].map(([value, label]) => (
                  <View key={label}>
                    <Text style={s.strong}>{value}</Text>
                    <Text style={s.small}>{label}</Text>
                  </View>
                ))}
              </View>
            </Pressable>
          );
        })}
        {limit < list.length && (
          <Button variant="secondary" onPress={() => setLimit(limit + 10)}>
            Xem thêm phiên
          </Button>
        )}
      </ScrollView>
    </View>
  );
}
