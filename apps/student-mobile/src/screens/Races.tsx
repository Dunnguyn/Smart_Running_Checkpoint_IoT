import { useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Badge, Button, Chips, Empty, Segments, date } from "../components/ui";
import Icon from "../components/Icon";
import { c, s } from "../components/theme";
import { registrationLabel, type Race } from "../domain/model";
import { useApp } from "../state/context";
export default function Races() {
  const { view, engine, go } = useApp();
  const [tab, setTab] = useState("Khám phá"),
    [filter, setFilter] = useState("Tất cả"),
    [query, setQuery] = useState(""),
    [limit, setLimit] = useState(4);
  const enrollments = view.snapshot?.enrollments ?? [];
  const list = (view.snapshot?.races ?? []).filter(
    (r) =>
      (tab === "Khám phá" || enrollments.some((e) => e.raceId === r.id)) &&
      r.name.toLocaleLowerCase("vi").includes(query.toLocaleLowerCase("vi")) &&
      (filter === "Tất cả" ||
        r.phase ===
          (
            {
              "Sắp diễn ra": "UPCOMING",
              "Đang diễn ra": "LIVE",
              "Đã kết thúc": "ENDED",
            } as Record<string, string>
          )[filter]),
  );
  const changed = (value: string) => {
    setFilter(value);
    setLimit(4);
  };
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={view.syncing}
          onRefresh={() => void engine.sync()}
        />
      }
      contentContainerStyle={{ paddingBottom: 26 }}
    >
      <View
        style={[
          s.between,
          { padding: 18, paddingTop: 24, backgroundColor: c.white },
        ]}
      >
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={s.small}>Chào bạn,</Text>
          <Text style={[s.title, { fontFamily: "Inter" }]}>
            {view.auth?.student.name.split(" ").slice(-2).join(" ")}
          </Text>
          <Text style={s.text}>Hôm nay là một ngày tuyệt vời để chạy.</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mở hồ sơ"
          onPress={() => go({ screen: "profile" })}
          style={{
            width: 50,
            height: 50,
            backgroundColor: c.navy,
            borderRadius: 25,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={[s.h3, { color: c.white }]}>
            {view.auth?.student.name
              .split(" ")
              .slice(-2)
              .map((p) => p[0])
              .join("")}
          </Text>
        </Pressable>
      </View>
      <View style={[s.body, { paddingTop: 8 }]}>
        <View style={[s.inputWrap, { backgroundColor: c.bg, minHeight: 51 }]}>
          <Icon name="search" color={c.muted} />
          <TextInput
            accessibilityLabel="Tìm kiếm giải chạy"
            placeholder="Tìm kiếm giải chạy"
            style={s.input}
            value={query}
            onChangeText={(value) => {
              setQuery(value);
              setLimit(4);
            }}
          />
        </View>
        <View style={s.between}>
          <Text style={[s.h2, { fontFamily: "Inter" }]}>Giải chạy</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setTab("Đã đăng ký")}
            style={{ padding: 10 }}
          >
            <Text style={[s.strong, { color: c.blue }]}>Lịch của tôi</Text>
          </Pressable>
        </View>
        <Segments
          values={["Khám phá", "Đã đăng ký"]}
          value={tab}
          onChange={(value) => {
            setTab(value);
            setLimit(4);
          }}
        />
        <Chips
          values={["Tất cả", "Sắp diễn ra", "Đang diễn ra", "Đã kết thúc"]}
          value={filter}
          onChange={changed}
        />
        {list.slice(0, limit).map((race) => (
          <RaceCard
            key={race.id}
            race={race}
            registered={enrollments.some((e) => e.raceId === race.id)}
            open={() => go({ screen: "detail", raceId: race.id })}
          />
        ))}
        {!list.length && (
          <Empty
            title="Chưa tìm thấy giải phù hợp"
            text="Thử thay đổi từ khóa, bộ lọc hoặc khám phá các giải khác."
          />
        )}
        {list.length > limit && (
          <Button variant="secondary" onPress={() => setLimit(limit + 4)}>
            Xem thêm giải chạy
          </Button>
        )}
      </View>
    </ScrollView>
  );
}
function RaceCard({
  race,
  registered,
  open,
}: {
  race: Race;
  registered: boolean;
  open: () => void;
}) {
  const label = registrationLabel(race);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={race.name}
      onPress={open}
      style={{
        backgroundColor: c.white,
        borderRadius: 24,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: c.line,
      }}
    >
      <LinearGradient
        colors={[c.navy950, c.blue700]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ height: 120, padding: 12, overflow: "hidden" }}
      >
        <Badge
          tone={
            label.startsWith("Còn")
              ? "green"
              : label.includes("hủy") || label === "Hết chỗ"
                ? "red"
                : "gray"
          }
        >
          {label}
        </Badge>
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={{
              position: "absolute",
              width: 160 - i * 24,
              height: 88 - i * 20,
              borderWidth: i ? 4 : 7,
              borderColor: "rgba(255,255,255,.24)",
              borderRadius: 100,
              right: -8 + i * 12,
              bottom: -16 + i * 10,
              transform: [{ rotate: "-12deg" }],
            }}
          />
        ))}
        <View
          style={{
            position: "absolute",
            right: 68,
            bottom: 56,
            width: 23,
            height: 23,
            borderRadius: 12,
            borderWidth: 4,
            borderColor: c.white,
            backgroundColor: c.red,
          }}
        />
      </LinearGradient>
      <View style={{ padding: 16, gap: 10 }}>
        <View style={s.between}>
          <Text
            style={[
              s.h3,
              { flex: 1, color: c.navy950, fontFamily: "Inter" },
            ]}
          >
            {race.name}
          </Text>
          <Icon name="chevron" />
        </View>
        <View style={s.row}>
          <Icon name="calendar" size={17} />
          <Text style={s.text}>{date(race.startsAt)}</Text>
        </View>
        <View style={s.row}>
          <Icon name="pin" size={17} />
          <Text style={s.text}>{race.place}</Text>
        </View>
        <View style={s.divider} />
        <View style={s.between}>
          <Text style={[s.strong, { color: c.blue }]}>
            {race.targetLaps} vòng · {race.lapMeters} m/vòng
          </Text>
          <Text style={s.small}>
            {registered ? "Đã đăng ký" : "Xem chi tiết"}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
