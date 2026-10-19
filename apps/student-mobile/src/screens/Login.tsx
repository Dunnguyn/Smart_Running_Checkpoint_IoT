import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Badge, Brand, Button, Notice } from "../components/ui";
import Icon from "../components/Icon";
import { c, s } from "../components/theme";
import { useApp } from "../state/context";
export default function Login() {
  const { view, engine } = useApp();
  const [code, setCode] = useState(""),
    [password, setPassword] = useState(""),
    [show, setShow] = useState(false),
    [validation, setValidation] = useState("");
  const submit = () => {
    if (!/^\d{8,12}$/.test(code.trim()) || !password) {
      setValidation("Nhập mã sinh viên từ 8–12 chữ số và mật khẩu.");
      return;
    }
    setValidation("");
    void engine.login(code.trim(), password);
  };
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <LinearGradient colors={[c.white, c.blue50]} style={{ flex: 1 }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            paddingHorizontal: 20,
            paddingVertical: 40,
          }}
        >
          <Brand />
          <View style={{ marginTop: 35, marginBottom: 24, gap: 12 }}>
            <Badge>Ứng dụng dành cho sinh viên NEU</Badge>
            <Text style={[s.title, { fontSize: 34 }]}>Đăng nhập</Text>
            <Text style={[s.text, { fontSize: 16, lineHeight: 25 }]}>
              Sẵn sàng cho hành trình chinh phục đường chạy của bạn.
            </Text>
          </View>
          <View style={{ gap: 16 }}>
            <View style={{ gap: 8 }}>
              <Text style={s.strong}>Mã sinh viên</Text>
              <View style={s.inputWrap}>
                <Icon name="user" color={c.muted} />
                <TextInput
                  accessibilityLabel="Mã sinh viên"
                  style={s.input}
                  placeholder="Nhập mã sinh viên"
                  placeholderTextColor={c.muted}
                  value={code}
                  onChangeText={setCode}
                  keyboardType="number-pad"
                  autoCapitalize="none"
                  autoComplete="username"
                  returnKeyType="next"
                />
              </View>
            </View>
            <View style={{ gap: 8 }}>
              <Text style={s.strong}>Mật khẩu</Text>
              <View style={s.inputWrap}>
                <Icon name="lock" color={c.muted} />
                <TextInput
                  accessibilityLabel="Mật khẩu"
                  style={s.input}
                  placeholder="Nhập mật khẩu"
                  placeholderTextColor={c.muted}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!show}
                  autoCapitalize="none"
                  autoComplete="current-password"
                  onSubmitEditing={submit}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  onPress={() => setShow(!show)}
                  style={{ padding: 10 }}
                >
                  <Icon name="eye" color={c.muted} />
                </Pressable>
              </View>
            </View>
            {!!(validation || view.error) && (
              <Notice error>{validation || view.error}</Notice>
            )}
            <Button
              onPress={submit}
              loading={view.busy}
              disabled={!code || !password}
            >
              {view.busy ? "Đang đăng nhập" : "Đăng nhập"}
            </Button>
          </View>
          <Text style={[s.text, { textAlign: "center", marginTop: 22 }]}>
            Bạn gặp vấn đề với tài khoản?{"\n"}
            <Text style={{ fontFamily: "Inter-Bold", color: c.blue }}>
              Liên hệ Ban tổ chức để được hỗ trợ.
            </Text>
          </Text>
        </ScrollView>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}
