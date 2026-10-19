import { useState } from "react";
import { Text, View } from "react-native";
import Svg, {
  Circle,
  G,
  Line,
  Polygon,
  Polyline,
  Rect,
  Text as SvgText,
} from "react-native-svg";
import { Button } from "../components/ui";
import { c, s } from "../components/theme";
import type { Point } from "../domain/model";
import { segments, type MapProps } from "./model";
export default function Schematic({
  race,
  samples = [],
  location,
  compact,
}: MapProps) {
  const [selected, setSelected] = useState(""),
    [centered, setCentered] = useState(false);
  const latitudes = race.route.map((p) => p.latitude),
    longitudes = race.route.map((p) => p.longitude);
  const lat0 = Math.min(...latitudes),
    lon0 = Math.min(...longitudes),
    latSpan = Math.max(...latitudes) - lat0 || 0.001,
    lonSpan = Math.max(...longitudes) - lon0 || 0.001;
  const project = (p: Point) => [
    35 + ((p.longitude - lon0) / lonSpan) * 290,
    40 + (1 - (p.latitude - lat0) / latSpan) * 220,
  ];
  const [cx, cy] = location ? project(location) : [180, 150];
  return (
    <View style={{ gap: 10 }}>
      <View
        style={{
          height: compact ? 150 : 310,
          backgroundColor: "#e6eedf",
          borderRadius: 16,
          overflow: "hidden",
        }}
      >
        <Svg
          width="100%"
          height="100%"
          viewBox={
            centered && location
              ? `${cx - 130} ${cy - 110} 260 220`
              : "0 0 360 300"
          }
        >
          <Rect width={360} height={300} fill="#e6eedf" />
          <Line
            x1={0}
            y1={65}
            x2={360}
            y2={65}
            stroke="white"
            strokeWidth={18}
          />
          <Line
            x1={170}
            y1={0}
            x2={170}
            y2={300}
            stroke="white"
            strokeWidth={16}
          />
          <Rect
            x={90}
            y={100}
            width={180}
            height={100}
            rx={18}
            fill="#cddbc4"
          />
          <Polygon points="110,118 245,118 245,180 110,180" fill="#f1f0e8" />
          <Polyline
            points={race.route.map((p) => project(p).join(",")).join(" ")}
            stroke="white"
            strokeWidth={12}
            fill="none"
          />
          <Polyline
            points={race.route.map((p) => project(p).join(",")).join(" ")}
            stroke={c.blue700}
            strokeWidth={6}
            fill="none"
          />
          {segments(samples).map((segment, index) => (
            <Polyline
              key={index}
              points={segment.map((p) => project(p).join(",")).join(" ")}
              stroke={index % 2 ? c.orange : c.red}
              strokeWidth={4}
              fill="none"
            />
          ))}
          {race.attendanceZone && (
            <Circle
              cx={project(race.attendanceZone.center)[0]}
              cy={project(race.attendanceZone.center)[1]}
              r={30}
              fill="#16794b22"
              stroke={c.green}
              strokeDasharray="4 4"
            />
          )}
          {race.checkpoints.map((cp) => {
            const [x, y] = project(cp.point);
            return (
              <G
                key={cp.id}
                onPress={() => setSelected(`${cp.id} · ${cp.name}`)}
                accessibilityLabel={cp.name}
              >
                <Circle
                  cx={x}
                  cy={y}
                  r={17}
                  fill={cp.kind === "LAP" ? c.green : c.navy}
                  stroke="white"
                  strokeWidth={3}
                />
                <SvgText
                  x={x}
                  y={y + 4}
                  textAnchor="middle"
                  fill="white"
                  fontSize={11}
                >
                  {cp.id}
                </SvgText>
              </G>
            );
          })}
          {location && (
            <Circle
              cx={cx}
              cy={cy}
              r={8}
              fill="#3485f5"
              stroke="white"
              strokeWidth={3}
            />
          )}
          <SvgText
            x={180}
            y={154}
            textAnchor="middle"
            fill={c.body}
            fontSize={13}
          >
            Khuôn viên NEU
          </SvgText>
        </Svg>
      </View>
      {!compact && (
        <>
          <Text style={s.small}>
            Sơ đồ tuyến · không phải nền bản đồ địa lý
          </Text>
          <View style={s.row}>
            <View style={s.grow}>
              <Button
                variant="secondary"
                onPress={() => {
                  setCentered(false);
                  setSelected("Toàn tuyến");
                }}
              >
                Xem toàn tuyến
              </Button>
            </View>
            <View style={s.grow}>
              <Button
                variant="secondary"
                disabled={!location}
                onPress={() => {
                  setCentered(true);
                  setSelected("Vị trí hiện tại");
                }}
              >
                Về vị trí
              </Button>
            </View>
          </View>
          {!!selected && <Text style={s.strong}>{selected}</Text>}
        </>
      )}
    </View>
  );
}
