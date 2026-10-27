import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Text, View } from "react-native";
import Constants from "expo-constants";
import MapView, {
  Circle,
  Marker,
  Polyline,
  PROVIDER_GOOGLE,
} from "react-native-maps";
import { Button, Notice } from "../components/ui";
import { c, s } from "../components/theme";
import { segments, type MapProps } from "./model";
import Schematic from "./Schematic";
export default function RouteMap(props: MapProps) {
  const { race, samples = [], location, compact } = props;
  const map = useRef<MapView>(null),
    [loaded, setLoaded] = useState(false),
    [failed, setFailed] = useState(false),
    [revision, setRevision] = useState(0),
    [selected, setSelected] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setFailed(true), 15000);
    return () => clearTimeout(timer);
  }, [revision]);
  if (Platform.OS === "android" && !Constants.expoConfig?.extra?.mapsConfigured)
    return (
      <View style={{ gap: 8 }}>
        <Schematic {...props} />
        {!compact && (
          <Notice>
            Nền bản đồ Android cần khóa Google Maps SDK được giới hạn theo ứng
            dụng và bản build mới. Tuyến và trạm vẫn hiển thị bằng sơ đồ.
          </Notice>
        )}
      </View>
    );
  const fit = () =>
    map.current?.fitToCoordinates(race.route, {
      edgePadding: { top: 45, bottom: 45, left: 35, right: 35 },
      animated: true,
    });
  return (
    <View style={{ gap: 10 }}>
      <View
        style={{
          height: compact ? 150 : 360,
          borderRadius: 16,
          overflow: "hidden",
        }}
      >
        <MapView
          key={revision}
          ref={map}
          provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
          style={{ flex: 1 }}
          initialRegion={{
            ...race.route[0],
            latitudeDelta: 0.003,
            longitudeDelta: 0.003,
          }}
          onMapReady={() => {
            setFailed(false);
            fit();
          }}
          onMapLoaded={() => setLoaded(true)}
        >
          <Polyline
            coordinates={race.route}
            strokeColor={c.blue700}
            strokeWidth={5}
          />
          {segments(samples).map((points, i) => (
            <Polyline
              key={i}
              coordinates={points}
              strokeColor={i % 2 ? c.orange : c.red}
              strokeWidth={4}
            />
          ))}
          {race.attendanceZone && (
            <Circle
              center={race.attendanceZone.center}
              radius={race.attendanceZone.radius}
              strokeColor={c.green}
              fillColor="#16794b22"
            />
          )}
          {race.checkpoints.map((cp) => (
            <Marker
              key={cp.id}
              coordinate={cp.point}
              title={cp.id}
              description={cp.name}
              pinColor={cp.kind === "LAP" ? c.green : c.navy}
              onPress={() => setSelected(`${cp.id} · ${cp.name}`)}
            />
          ))}
          {location && (
            <Marker
              coordinate={location}
              title="Vị trí hiện tại"
              pinColor="#3485f5"
            />
          )}
        </MapView>
        {!loaded && (
          <View
            style={{
              position: "absolute",
              top: 12,
              left: 12,
              padding: 12,
              borderRadius: 12,
              backgroundColor: c.white,
            }}
          >
            <ActivityIndicator />
            <Text style={s.small}>Đang tải bản đồ</Text>
          </View>
        )}
      </View>
      {failed && !loaded && (
        <>
          <Notice error>
            Chưa tải được bản đồ. Kiểm tra mạng và cấu hình bản đồ.
          </Notice>
          <Button
            variant="secondary"
            onPress={() => {
              setLoaded(false);
              setFailed(false);
              setRevision(revision + 1);
            }}
          >
            Tải lại bản đồ
          </Button>
        </>
      )}
      {!compact && (
        <View style={s.row}>
          <View style={s.grow}>
            <Button variant="secondary" onPress={fit}>
              Xem toàn tuyến
            </Button>
          </View>
          <View style={s.grow}>
            <Button
              variant="secondary"
              disabled={!location}
              onPress={() =>
                location &&
                map.current?.animateToRegion({
                  ...location,
                  latitudeDelta: 0.001,
                  longitudeDelta: 0.001,
                })
              }
            >
              Về vị trí
            </Button>
          </View>
        </View>
      )}
      {!!selected && <Text style={s.strong}>{selected}</Text>}
      {!compact && (
        <Text style={s.small}>
          Xanh: tuyến quy định · Đỏ/cam: GPS đã ghi theo từng đoạn · Vùng xanh
          lá: điểm danh
        </Text>
      )}
    </View>
  );
}
