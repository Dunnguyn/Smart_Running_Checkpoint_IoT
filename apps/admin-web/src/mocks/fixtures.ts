import type {
  LiveSnapshot,
  RunSession,
  DeviceEvent,
  LapEvent,
} from "../types/domain";
export const epoch = Date.parse("2026-10-03T00:35:00Z");
export const route: [number, number][] = [
  [20.9995, 105.8422],
  [21.0015, 105.8424],
  [21.0031, 105.8435],
  [21.0028, 105.8458],
  [21.0004, 105.8461],
  [20.9993, 105.8444],
  [20.9995, 105.8422],
];
export function pointAt(progress: number): [number, number] {
  const position = (((progress % 1) + 1) % 1) * (route.length - 1);
  const index = Math.floor(position),
    fraction = position - index;
  return [
    route[index][0] + (route[index + 1][0] - route[index][0]) * fraction,
    route[index][1] + (route[index + 1][1] - route[index][1]) * fraction,
  ];
}
const names = [
  "Nguyễn Minh Anh",
  "Trần Đức Huy",
  "Lê Hoàng Nam",
  "Phạm Thu Hà",
  "Nguyễn Hải Đăng",
  "Vũ Khánh Linh",
  "Đỗ Minh Quân",
  "Bùi Ngọc Ánh",
  "Hoàng Tuấn Kiệt",
  "Đặng Phương Thảo",
  "Trần Gia Bảo",
  "Lê Mai Chi",
];
const faculties = [
  "Viện Công nghệ thông tin & Kinh tế số",
  "Khoa Marketing",
  "Viện Ngân hàng – Tài chính",
  "Khoa Quản trị kinh doanh",
  "Viện Thương mại & Kinh tế quốc tế",
  "Khoa Kế toán",
];
const colors = [
  "#2463eb",
  "#e99c22",
  "#9b63d9",
  "#ed667a",
  "#11a7a0",
  "#4868b5",
  "#cc6d28",
  "#597b40",
];
export function createFixture(): LiveSnapshot {
  const runners: RunSession[] = Array.from({ length: 128 }, (_, i) => {
    const status =
      i < 80
        ? "ACTIVE"
        : i < 112
          ? "COMPLETED"
          : i < 124
            ? "PENDING"
            : "ABANDONED";
    const meters =
      status === "COMPLETED"
        ? 5000
        : status === "PENDING"
          ? 0
          : 450 + ((i * 173) % 4400);
    const point = pointAt(meters / 1000);
    const completedDuration = 1400 + i * 5;
    const fullName =
      i < 12
        ? names[i]
        : `${["Nguyễn", "Trần", "Lê", "Phạm", "Vũ", "Đỗ", "Bùi", "Hoàng", "Đặng", "Phan", "Đinh"][Math.floor(i / 12)]} ${["Minh Anh", "Đức Huy", "Hoàng Nam", "Thu Hà", "Hải Đăng", "Khánh Linh", "Minh Quân", "Ngọc Ánh", "Tuấn Kiệt", "Phương Thảo", "Gia Bảo", "Mai Chi"][i % 12]}`;
    return {
      student_id: `student-${i + 1}`,
      student_code: String(11230001 + i),
      full_name: fullName,
      faculty: faculties[i % faculties.length],
      race_id: "neu-2026",
      bib: String(i + 1).padStart(3, "0"),
      color: colors[i % colors.length],
      run_id: `run-${i + 1}`,
      status,
      lap_count: Math.floor(meters / 1000),
      total_laps: 5,
      distance_total_m: meters,
      duration_total_s:
        status === "PENDING"
          ? null
          : status === "COMPLETED"
            ? completedDuration
            : status === "ABANDONED"
              ? 1800
              : 2100,
      last_lap_duration_s:
        status === "COMPLETED"
          ? completedDuration / 5
          : meters >= 1000
            ? 350 + (i % 100)
            : null,
      total_steps: status === "PENDING" ? null : Math.floor(meters * 1.4),
      started_at: status === "PENDING" ? null : "2026-10-03T00:00:00Z",
      ended_at:
        status === "COMPLETED"
          ? new Date(
              Date.parse("2026-10-03T00:00:00Z") + completedDuration * 1000,
            ).toISOString()
          : status === "ABANDONED"
            ? "2026-10-03T00:30:00Z"
            : null,
      last_latitude: status === "PENDING" ? null : point[0],
      last_longitude: status === "PENDING" ? null : point[1],
      last_seen_at:
        status === "PENDING"
          ? null
          : new Date(
              epoch - (i >= 8 && status === "ACTIVE" ? 90000 : 0),
            ).toISOString(),
      connection:
        status === "PENDING"
          ? "UNAVAILABLE"
          : i >= 8 && status === "ACTIVE"
            ? "STALE"
            : "ONLINE",
      source: "SIMULATOR",
    };
  });
  const laps: LapEvent[] = runners.flatMap((r) =>
    Array.from({ length: r.lap_count }, (_, i) => ({
      event_id: `lap-${r.run_id}-${i + 1}`,
      student_id: r.student_id,
      run_id: r.run_id,
      lap: i + 1,
      duration_s: r.last_lap_duration_s ?? 400,
      occurred_at: new Date(
        Date.parse(r.started_at!) +
          (i + 1) * (r.last_lap_duration_s ?? 400) * 1000,
      ).toISOString(),
      source: "SIMULATOR" as const,
    })),
  );
  const events: DeviceEvent[] = laps.map((l) => ({
    event_id: `event-${l.event_id}`,
    checkpoint_id: "cp-1",
    student_id: l.student_id,
    run_id: l.run_id,
    occurred_at: l.occurred_at,
    source: "SIMULATOR",
    status: "MATCHED",
  }));
  events.push({
    event_id: "unassigned-1",
    checkpoint_id: "cp-2",
    student_id: null,
    run_id: null,
    occurred_at: new Date(epoch).toISOString(),
    source: "SIMULATOR",
    status: "UNASSIGNED",
  });
  return {
    races: [
      {
        race_id: "neu-2026",
        name: "NEU RUN 2026",
        started_at: "2026-10-03T00:00:00Z",
        location: "Đại học Kinh tế Quốc dân, Hà Nội",
        status: "LIVE",
        total_laps: 5,
        participant_count: 128,
      },
      {
        race_id: "neu-autumn",
        name: "NEU · Chạy vì cộng đồng",
        started_at: "2026-11-08T00:00:00Z",
        location: "Hà Nội",
        status: "SCHEDULED",
        total_laps: 3,
        participant_count: 0,
      },
    ],
    runners,
    route,
    checkpoints: [0, 2, 4].map((index, i) => ({
      checkpoint_id: `cp-${i + 1}`,
      race_id: "neu-2026",
      code: `CP-0${i + 1}`,
      name:
        i === 0
          ? "Xuất phát / Về đích"
          : i === 1
            ? "Cổng phía Bắc"
            : "Điểm tiếp nước",
      type: i === 0 ? "START_FINISH" : "INTERMEDIATE",
      order: i + 1,
      device: `NEU-ARD-0${i + 1}`,
      latitude: route[index][0],
      longitude: route[index][1],
    })),
    events,
    laps,
    updated_at: new Date(epoch).toISOString(),
    running: false,
  };
}
