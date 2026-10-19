import type { ReactNode } from "react";
import Svg, { Path, Circle, Rect } from "react-native-svg";
export type IconName =
  | "home"
  | "chart"
  | "clock"
  | "user"
  | "search"
  | "pin"
  | "calendar"
  | "route"
  | "back"
  | "eye"
  | "gps"
  | "chevron"
  | "check"
  | "alert"
  | "wifi"
  | "layers"
  | "logout"
  | "lock"
  | "map"
  | "flag"
  | "close";
const paths: Record<IconName, ReactNode> = {
  home: (
    <>
      <Path d="M3 11.5 12 4l9 7.5" />
      <Path d="M5.5 10.5V21h13V10.5M9 21v-6h6v6" />
    </>
  ),
  chart: (
    <>
      <Path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </>
  ),
  clock: (
    <>
      <Circle cx="12" cy="12" r="9" />
      <Path d="M12 7v5l3 2" />
    </>
  ),
  user: (
    <>
      <Circle cx="12" cy="8" r="4" />
      <Path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  search: (
    <>
      <Circle cx="11" cy="11" r="7" />
      <Path d="m20 20-4-4" />
    </>
  ),
  pin: (
    <>
      <Path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
      <Circle cx="12" cy="10" r="2.5" />
    </>
  ),
  calendar: (
    <>
      <Rect x="3" y="5" width="18" height="16" rx="3" />
      <Path d="M8 3v4m8-4v4M3 10h18" />
    </>
  ),
  route: (
    <>
      <Circle cx="6" cy="18" r="2" />
      <Circle cx="18" cy="6" r="2" />
      <Path d="M8 18h3a3 3 0 0 0 0-6h2a3 3 0 0 0 3-3V8" />
    </>
  ),
  back: <Path d="m15 18-6-6 6-6" />,
  eye: (
    <>
      <Path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <Circle cx="12" cy="12" r="2.5" />
    </>
  ),
  gps: (
    <>
      <Circle cx="12" cy="12" r="7" />
      <Circle cx="12" cy="12" r="2" />
      <Path d="M12 2v3m0 14v3M2 12h3m14 0h3" />
    </>
  ),
  chevron: <Path d="m9 18 6-6-6-6" />,
  check: <Path d="m5 12 4 4L19 6" />,
  alert: (
    <>
      <Path d="M12 3 2.8 20h18.4L12 3Z" />
      <Path d="M12 9v5m0 3h.01" />
    </>
  ),
  wifi: (
    <>
      <Path d="M4 9a12 12 0 0 1 16 0M7 13a7.5 7.5 0 0 1 10 0m-7 4a3 3 0 0 1 4 0" />
      <Circle cx="12" cy="20" r=".5" />
    </>
  ),
  layers: (
    <>
      <Path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <Path d="m3 12 9 5 9-5m-18 4 9 5 9-5" />
    </>
  ),
  logout: (
    <>
      <Path d="M10 4H4v16h6m5-4 4-4-4-4m4 4H9" />
    </>
  ),
  lock: (
    <>
      <Rect x="4" y="10" width="16" height="11" rx="3" />
      <Path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  map: (
    <>
      <Path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z" />
      <Path d="M9 3v15m6-12v15" />
    </>
  ),
  flag: (
    <>
      <Path d="M5 21V4" />
      <Path d="M5 5h11l-2 4 2 4H5" />
    </>
  ),
  close: <Path d="m6 6 12 12M18 6 6 18" />,
};

export default function Icon({
  name,
  size = 21,
  color = "#0b2f62",
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </Svg>
  );
}
