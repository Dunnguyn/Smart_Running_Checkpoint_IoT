import { useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { Button, Notice } from "../components/ui";
import { s } from "../components/theme";
import { useApp } from "../state/context";
export default function ChangePassword() {
  const { engine, view } = useApp();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  return (
    <ScrollView
      contentContainerStyle={s.body}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={s.title}>Đổi mật khẩu tạm thời</Text>
      <Text style={s.text}>
        Đặt mật khẩu mới trước khi sử dụng tài khoản. Sau khi đổi, hãy đăng nhập
        lại.
      </Text>
      {[
        ["Mật khẩu hiện tại", current, setCurrent],
        ["Mật khẩu mới", next, setNext],
        ["Nhập lại mật khẩu mới", confirm, setConfirm],
      ].map(([label, value, setter]) => (
        <View key={label as string} style={{ gap: 8 }}>
          <Text style={s.strong}>{label as string}</Text>
          <TextInput
            accessibilityLabel={label as string}
            style={s.input}
            secureTextEntry
            autoCapitalize="none"
            value={value as string}
            onChangeText={setter as (value: string) => void}
          />
        </View>
      ))}
      {!!error && <Notice error>{error}</Notice>}
      <Button
        loading={view.busy}
        onPress={() => {
          if (
            !current ||
            next.length < 12 ||
            next.length > 128 ||
            next !== confirm ||
            current === next
          ) {
            setError(
              "Mật khẩu mới cần 12–128 ký tự, khác mật khẩu cũ và trùng với phần xác nhận.",
            );
            return;
          }
          setError("");
          void engine.changePassword(current, next);
        }}
      >
        Đổi mật khẩu
      </Button>
      <Button variant="secondary" onPress={() => void engine.logout()}>
        Đăng xuất
      </Button>
    </ScrollView>
  );
}
