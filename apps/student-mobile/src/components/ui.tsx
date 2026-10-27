import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import Icon, { type IconName } from "./Icon";
import { c, s } from "./theme";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <View style={s.row}>
      <Image
        accessibilityLabel="Logo NEU RUN"
        source={require("../../assets/neu-run-logo.png")}
        style={{ width: compact ? 44 : 74, height: compact ? 44 : 74 }}
        resizeMode="contain"
      />
      {!compact && (
        <View>
          <Text style={[s.title, { fontSize: 23 }]}>
            NEU<Text style={{ color: c.red }}>★</Text>RUN
          </Text>
          <Text style={[s.small, { fontSize: 11 }]}>
            Chinh phục từng vòng chạy
          </Text>
        </View>
      )}
    </View>
  );
}
export function Button({
  children,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
  icon,
  testID,
}: {
  children: ReactNode;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "danger" | "success" | "ghost";
  disabled?: boolean;
  loading?: boolean;
  icon?: IconName;
  testID?: string;
}) {
  const dark = variant === "primary" || variant === "success";
  const color = dark ? c.white : variant === "danger" ? c.red : c.navy;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 54,
        borderRadius: 999,
        paddingHorizontal: 18,
        paddingVertical: 13,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        opacity: disabled || loading ? 0.48 : pressed ? 0.8 : 1,
        backgroundColor:
          variant === "primary"
            ? c.navy
            : variant === "success"
              ? c.green
              : variant === "danger"
                ? c.red50
                : c.white,
        borderWidth: variant === "secondary" || variant === "danger" ? 1 : 0,
        borderColor: variant === "danger" ? "#f2c8ce" : c.border,
      })}
    >
      {loading ? (
        <ActivityIndicator color={color} />
      ) : icon ? (
        <Icon name={icon} color={color} />
      ) : null}
      <Text
        style={{
          fontFamily: "Inter-Bold",
          fontSize: 14,
          color,
          textAlign: "center",
          flexShrink: 1,
        }}
      >
        {children}
      </Text>
    </Pressable>
  );
}
export function Badge({
  children,
  tone = "blue",
}: {
  children: ReactNode;
  tone?: "blue" | "green" | "orange" | "red" | "gray";
}) {
  const colors = {
    blue: [c.blue100, c.blue],
    green: [c.green100, c.green],
    orange: [c.orange100, c.orange],
    red: [c.red50, c.red],
    gray: [c.line, c.body],
  };
  return (
    <View
      style={{
        alignSelf: "flex-start",
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 99,
        backgroundColor: colors[tone][0],
        flexShrink: 1,
      }}
    >
      <Text
        style={{
          fontFamily: "Inter-Bold",
          fontSize: 11,
          color: colors[tone][1],
        }}
      >
        {children}
      </Text>
    </View>
  );
}
export function Header({
  title,
  subtitle,
  back,
  action,
}: {
  title: string;
  subtitle?: string;
  back?: () => void;
  action?: ReactNode;
}) {
  return (
    <View
      style={{
        minHeight: 72,
        paddingHorizontal: 16,
        backgroundColor: c.white,
        borderBottomWidth: 1,
        borderBottomColor: c.line,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
      }}
    >
      {back ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Quay lại"
          onPress={back}
          style={{ padding: 11, backgroundColor: c.bg, borderRadius: 99 }}
        >
          <Icon name="back" />
        </Pressable>
      ) : (
        <Brand compact />
      )}
      <View style={{ flex: 1, gap: 3 }}>
        <Text
          style={[
            s.h3,
            {
              textAlign: subtitle ? "left" : "center",
              fontSize: subtitle ? 12 : 16,
            },
          ]}
        >
          {title}
        </Text>
        {subtitle && (
          <Text style={[s.small, { fontSize: 10 }]}>{subtitle}</Text>
        )}
      </View>
      <View style={{ minWidth: 44 }}>{action}</View>
    </View>
  );
}
export function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <View
      accessibilityRole={error ? "alert" : undefined}
      style={{
        padding: 12,
        backgroundColor: error ? c.red50 : c.blue50,
        borderRadius: 12,
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 8,
      }}
    >
      <Icon
        name={error ? "alert" : "gps"}
        color={error ? c.red : c.blue}
        size={18}
      />
      <Text style={[s.text, { flex: 1, color: error ? c.red : c.blue }]}>
        {children}
      </Text>
    </View>
  );
}
export function Empty({ title, text }: { title: string; text: string }) {
  return (
    <View style={[s.card, s.center, { paddingVertical: 32 }]}>
      <Icon name="search" size={32} />
      <Text style={[s.h2, { textAlign: "center" }]}>{title}</Text>
      <Text style={[s.text, { textAlign: "center" }]}>{text}</Text>
    </View>
  );
}
export function Chips({
  values,
  value,
  onChange,
}: {
  values: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8 }}
      style={{ flexGrow: 0 }}
    >
      {values.map((label) => (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: value === label }}
          onPress={() => onChange(label)}
          key={label}
          style={{
            minHeight: 42,
            justifyContent: "center",
            paddingHorizontal: 14,
            borderRadius: 99,
            borderWidth: 1,
            borderColor: value === label ? c.navy : c.border,
            backgroundColor: value === label ? c.navy : c.white,
          }}
        >
          <Text
            style={[
              s.strong,
              { fontSize: 12, color: value === label ? c.white : c.body },
            ]}
          >
            {label}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
export function Segments({
  values,
  value,
  onChange,
  underline = false,
}: {
  values: string[];
  value: string;
  onChange: (value: string) => void;
  underline?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: underline ? "transparent" : c.bg,
        borderRadius: 12,
        padding: underline ? 0 : 4,
      }}
    >
      {values.map((label) => (
        <Pressable
          key={label}
          accessibilityRole="button"
          accessibilityState={{ selected: label === value }}
          onPress={() => onChange(label)}
          style={{
            flex: 1,
            minHeight: 42,
            borderRadius: underline ? 0 : 9,
            borderBottomWidth: underline ? 3 : 0,
            borderBottomColor: label === value ? c.navy : "transparent",
            boxShadow:
              !underline && label === value
                ? "0px 2px 9px rgba(8,27,58,.09)"
                : undefined,
            alignItems: "center",
            justifyContent: "center",
            padding: 5,
            backgroundColor:
              !underline && label === value ? c.white : "transparent",
          }}
        >
          <Text
            style={[
              s.strong,
              {
                color: label === value ? c.navy : c.muted,
                textAlign: "center",
              },
            ]}
          >
            {label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
export function Dialog({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(8,27,58,.5)",
          justifyContent: "center",
          padding: 20,
        }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
        >
          <View
            accessibilityViewIsModal
            style={[
              s.card,
              {
                width: "100%",
                maxWidth: 440,
                alignSelf: "center",
                padding: 24,
                borderRadius: 24,
                gap: 16,
              },
            ]}
          >
            <View style={s.between}>
              <Text style={[s.h2, { flex: 1 }]}>{title}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Đóng"
                onPress={close}
                style={{ padding: 10 }}
              >
                <Icon name="close" />
              </Pressable>
            </View>
            {children}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
export const date = (value: number) =>
  !value || !Number.isFinite(value)
    ? "Chưa cấu hình"
    : new Intl.DateTimeFormat("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(value);
export function duration(ms: number) {
  const sec = Math.floor(ms / 1000);
  return [Math.floor(sec / 3600), Math.floor(sec / 60) % 60, sec % 60]
    .map((v) => String(v).padStart(2, "0"))
    .join(":");
}
export function pace(ms: number, distance: number) {
  if (distance <= 0 || ms <= 0) return "—";
  const seconds = Math.round(ms / distance);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
