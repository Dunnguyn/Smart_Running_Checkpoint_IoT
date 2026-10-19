import type { Race, Snapshot } from "../domain/model";
export const demoRoute = [
  { latitude: 21.000389, longitude: 105.842583 },
  { latitude: 21.0, longitude: 105.843417 },
  { latitude: 20.999611, longitude: 105.842639 },
  { latitude: 20.999972, longitude: 105.841889 },
  { latitude: 21.000389, longitude: 105.842583 },
];
export function seed(owner: string, now = Date.now()): Snapshot {
  const day = 86400000;
  const base: Race = {
    id: "campus",
    name: "NEU Campus Run 2026",
    place: "Sân vận động NEU",
    startsAt: now - 3600000,
    opensAt: now - day,
    closesAt: now + day,
    phase: "LIVE",
    capacity: 300,
    registered: 264,
    targetLaps: 4,
    lapMeters: 425,
    route: demoRoute,
    checkpoints: demoRoute.slice(0, 4).map((point, i) => ({
      id: `C${i + 1}`,
      name: i === 0 ? "Xuất phát · đích vòng" : `Trạm kiểm soát ${i + 1}`,
      point,
      kind: i === 0 ? "LAP" : "CONTROL",
    })),
    // MOCK POLICY ONLY: never reused as an official backend geofence.
    attendanceZone: { center: demoRoute[0], radius: 80, maxAccuracy: 50 },
  };
  const races: Race[] = [
    base,
    {
      ...base,
      id: "economics",
      name: "Chạy cùng Khoa Kinh tế",
      place: "Công viên Thống Nhất",
      startsAt: now + 7 * day,
      phase: "UPCOMING",
      capacity: 200,
      registered: 182,
      targetLaps: 5,
    },
    {
      ...base,
      id: "summer",
      name: "NEU Summer Run",
      phase: "UPCOMING",
      capacity: 100,
      registered: 100,
    },
    {
      ...base,
      id: "friendship",
      name: "NEU Friendship Run",
      closesAt: now - day,
      phase: "ENDED",
    },
    { ...base, id: "green", name: "Run for Green Campus", phase: "CANCELLED" },
    {
      ...base,
      id: "winter",
      name: "NEU Winter Run",
      opensAt: now + day,
      closesAt: now + 10 * day,
      phase: "UPCOMING",
    },
    {
      ...base,
      id: "spring",
      name: "NEU Spring Run",
      phase: "ENDED",
      startsAt: now - 10 * day,
      closesAt: now - 11 * day,
    },
  ];
  const runs =
    owner === "11223344"
      ? [2, 10].map((days, index) => ({
          id: `history-${index}`,
          owner,
          raceId: index === 0 ? "friendship" : "spring",
          status: index === 0 ? ("ENDED" as const) : ("COMPLETED" as const),
          startedAt: now - days * day - 1125000,
          endedAt: now - days * day,
          activeMs: 1000000,
          distance: index === 0 ? 850 : 1700,
          laps: Array.from({ length: index === 0 ? 2 : 4 }, (_, i) => ({
            number: i + 1,
            at: now - days * day - (3 - i) * 200000,
          })),
          samples: demoRoute.map((point, i) => ({
            ...point,
            id: `seed-${index}-${i}`,
            owner,
            runId: `history-${index}`,
            sequence: i + 1,
            segment: i < 2 ? 1 : 2,
            timestamp: now - days * day - (5 - i) * 10000,
            accuracy: 5,
            simulated: true,
          })),
          revision: 1,
          outsideLapZone: false,
        }))
      : [];
  return {
    races,
    enrollments: runs.map((r) => ({
      raceId: r.raceId,
      bib: r.raceId === "spring" ? "SR-1042" : "FR-0268",
      checkedInAt: r.startedAt - 60000,
      checkedOutAt: r.endedAt! + 60000,
    })),
    runs,
    revision: 1,
  };
}
