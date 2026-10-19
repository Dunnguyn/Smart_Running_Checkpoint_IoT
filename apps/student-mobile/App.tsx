import { useEffect, useState, useSyncExternalStore } from "react";
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Platform,
  Pressable,
  StatusBar,
  Text,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import NetInfo from "@react-native-community/netinfo";
import { useFonts } from "expo-font";
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold";
import { c, s } from "./src/components/theme";
import Icon, { type IconName } from "./src/components/Icon";
import { Button, Notice } from "./src/components/ui";
import { config, configurationError } from "./src/config";
import { terminal } from "./src/domain/model";
import { AppContext, type Route, type Screen } from "./src/state/context";
import { engine } from "./src/state/runtime";
import Login from "./src/screens/Login";
import Races from "./src/screens/Races";
import RaceDetail from "./src/screens/RaceDetail";
import MapScreen from "./src/screens/MapScreen";
import RunScreen from "./src/screens/RunScreen";
import Result from "./src/screens/Result";
import Stats from "./src/screens/Stats";
import History from "./src/screens/History";
import Profile from "./src/screens/Profile";

const tabs: { screen: Screen; label: string; icon: IconName }[] = [
  { screen: "races", label: "Giải chạy", icon: "home" },
  { screen: "stats", label: "Thống kê", icon: "chart" },
  { screen: "history", label: "Lịch sử", icon: "clock" },
  { screen: "profile", label: "Hồ sơ", icon: "user" },
];
export default function App() {
  const view = useSyncExternalStore(engine.subscribe, engine.get);
  const [fonts, fontError] = useFonts({
    Inter: Inter_400Regular,
    "Inter-Bold": Inter_700Bold,
  });
  const [stack, setStack] = useState<Route[]>([{ screen: "races" }]);
  const route = stack[stack.length - 1];
  const go = (next: Route) =>
    setStack((current) =>
      tabs.some((t) => t.screen === next.screen) ? [next] : [...current, next],
    );
  const back = () =>
    setStack((current) =>
      current.length > 1 ? current.slice(0, -1) : [{ screen: "races" }],
    );
  useEffect(() => {
    void engine.boot();
    return NetInfo.addEventListener((state) =>
      engine.setOnline(
        state.isConnected !== false && state.isInternetReachable !== false,
      ),
    );
  }, []);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void engine.sync();
      else if (
        !config.background ||
        config.gps === "demo" ||
        Platform.OS === "web"
      )
        void engine.suspendForeground();
    });
    const timer = setInterval(() => {
      if (AppState.currentState === "active" || config.background)
        void engine.sync();
    }, 5000);
    return () => {
      subscription.remove();
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (!view.auth) setStack([{ screen: "races" }]);
  }, [view.auth?.student.id]);
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (stack.length <= 1) return false;
        back();
        return true;
      },
    );
    return () => subscription.remove();
  }, [stack.length]);
  const ongoing = view.snapshot?.runs.find((r) => !terminal(r));
  const configError = configurationError();
  let content;
  if (configError)
    content = (
      <View style={s.body}>
        <Notice error>{configError}</Notice>
      </View>
    );
  else if ((!fonts && !fontError) || !view.ready)
    content = (
      <View style={[s.grow, s.center]}>
        <ActivityIndicator color={c.navy} />
        <Text style={s.text}>Đang khôi phục phiên…</Text>
      </View>
    );
  else if (!view.auth) content = <Login />;
  else if (!view.snapshot && !view.error)
    content = (
      <View style={[s.grow, s.center]}>
        <ActivityIndicator color={c.navy} />
        <Text style={s.text}>Đang tải giải chạy và phiên của bạn…</Text>
      </View>
    );
  else
    content = {
      races: <Races />,
      detail: <RaceDetail />,
      map: <MapScreen />,
      run: <RunScreen />,
      result: <Result />,
      stats: <Stats />,
      history: <History />,
      "history-detail": <Result />,
      profile: <Profile />,
    }[route.screen];
  const tabScreen = tabs.some((t) => t.screen === route.screen);
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <AppContext.Provider value={{ view, engine, route, go, back }}>
        <SafeAreaView style={{ flex: 1, backgroundColor: c.white }}>
          <View
            style={{
              flex: 1,
              width: "100%",
              maxWidth: 480,
              alignSelf: "center",
              backgroundColor: c.bg,
            }}
          >
            {view.auth && (
              <View
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 4,
                  backgroundColor:
                    config.gps === "demo" ? c.orange100 : c.blue50,
                }}
              >
                <Text
                  style={[
                    s.small,
                    { color: config.gps === "demo" ? c.orange : c.blue },
                  ]}
                >
                  {config.mode === "mock"
                    ? "DEMO · Backend mô phỏng"
                    : "API thật"}{" "}
                  · {config.gps === "demo" ? "GPS GIẢ" : "GPS thiết bị"}
                </Text>
              </View>
            )}
            {view.auth && view.error && (
              <View style={{ padding: 8, gap: 4 }}>
                <Notice error>{view.error}</Notice>
                <View style={s.row}>
                  <View style={s.grow}>
                    <Button
                      variant="secondary"
                      loading={view.syncing}
                      onPress={() => void engine.sync()}
                    >
                      Thử đồng bộ lại
                    </Button>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Ẩn thông báo"
                    onPress={() => engine.clearError()}
                    style={{ padding: 12 }}
                  >
                    <Icon name="close" />
                  </Pressable>
                </View>
              </View>
            )}
            {view.auth && ongoing && tabScreen && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Quay lại phiên chạy"
                onPress={() =>
                  go({
                    screen: "run",
                    runId: ongoing.id,
                    raceId: ongoing.raceId,
                  })
                }
                style={{
                  margin: 12,
                  marginBottom: 0,
                  padding: 14,
                  borderRadius: 16,
                  backgroundColor:
                    view.tracking?.capture === "PAUSED" ||
                    ongoing.status === "PAUSED"
                      ? c.orange
                      : c.navy,
                  flexDirection: "row",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <Icon name="gps" color={c.white} />
                <View style={s.grow}>
                  <Text style={[s.strong, { color: c.white }]}>
                    {view.tracking?.capture === "PAUSED" ||
                    ongoing.status === "PAUSED"
                      ? "Phiên chạy đang tạm dừng"
                      : "Bạn có phiên chạy chưa kết thúc"}
                  </Text>
                  <Text style={[s.small, { color: "#ffffffcc" }]}>
                    {
                      view.snapshot?.races.find((r) => r.id === ongoing.raceId)
                        ?.name
                    }{" "}
                    · Chạm để quay lại
                  </Text>
                </View>
                <Icon name="chevron" color={c.white} />
              </Pressable>
            )}
            <View style={{ flex: 1 }} key={view.auth?.student.id ?? "login"}>
              {content}
            </View>
            {view.auth && tabScreen && (
              <View
                style={{
                  flexDirection: "row",
                  padding: 9,
                  backgroundColor: c.white,
                  borderTopWidth: 1,
                  borderTopColor: c.line,
                }}
              >
                {tabs.map((tab) => (
                  <Pressable
                    key={tab.screen}
                    accessibilityRole="tab"
                    accessibilityLabel={tab.label}
                    accessibilityState={{
                      selected: route.screen === tab.screen,
                    }}
                    onPress={() => go({ screen: tab.screen })}
                    style={{
                      flex: 1,
                      minHeight: 60,
                      justifyContent: "center",
                      alignItems: "center",
                      gap: 5,
                      borderRadius: 13,
                      backgroundColor:
                        route.screen === tab.screen ? c.blue50 : c.white,
                    }}
                  >
                    <Icon
                      name={tab.icon}
                      color={route.screen === tab.screen ? c.navy : c.muted}
                    />
                    <Text
                      style={[
                        s.strong,
                        {
                          fontSize: 11,
                          color: route.screen === tab.screen ? c.navy : c.muted,
                        },
                      ]}
                    >
                      {tab.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </SafeAreaView>
      </AppContext.Provider>
    </SafeAreaProvider>
  );
}
