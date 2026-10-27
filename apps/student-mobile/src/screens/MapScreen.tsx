import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Button, Empty, Header, Notice } from "../components/ui";
import { c, s } from "../components/theme";
import type { Fix } from "../domain/model";
import { useApp } from "../state/context";
import RouteMap from "../map/RouteMap";
export default function MapScreen() {
  const { view, route, back, engine } = useApp();
  const [location, setLocation] = useState<Fix>(),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const race = view.snapshot?.races.find((r) => r.id === route.raceId);
  if (!race)
    return (
      <Empty title="Chưa có tuyến chạy" text="Chọn một giải để xem bản đồ." />
    );
  return (
    <View style={s.page}>
      <Header title="Bản đồ tuyến chạy" back={back} />
      <ScrollView contentContainerStyle={s.body}>
        <Text style={s.h2}>{race.name}</Text>
        <RouteMap race={race} location={location ?? view.tracking?.lastFix} />
        <Notice>
          Cho phép vị trí để xem bạn trên bản đồ. Chỉ phiên đang chạy mới ghi dữ
          liệu vận động.
        </Notice>
        <Button
          icon="gps"
          loading={loading}
          onPress={() => {
            setLoading(true);
            setError("");
            void engine.gps
              .fresh()
              .then(setLocation)
              .catch((e) => setError((e as Error).message))
              .finally(() => setLoading(false));
          }}
        >
          Lấy vị trí hiện tại
        </Button>
        {!!error && <Notice error>{error}</Notice>}
        <View style={s.card}>
          <Text style={s.h2}>Chú giải</Text>
          <Text style={[s.text, { color: c.blue }]}>
            Tuyến xanh: tuyến chạy · Chấm xanh: vị trí hiện tại
          </Text>
          <Text style={[s.text, { color: c.green }]}>
            Trạm xanh lá: xuất phát/đếm vòng · Vùng xanh lá: điểm danh
          </Text>
          <Text style={s.small}>Chạm vào trạm để xem thông tin.</Text>
          {race.checkpoints.map((cp) => (
            <View key={cp.id} style={s.dataRow}>
              <Text style={s.strong}>{cp.id}</Text>
              <Text style={s.text}>{cp.name}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
