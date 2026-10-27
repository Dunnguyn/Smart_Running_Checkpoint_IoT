import { config } from "../config";
import { DemoGps } from "../gps/demo";
import { DeviceGps } from "../gps/device";
import { MockService } from "../services/mock";
import { apiService } from "../services/api";
import { store } from "../storage/store";
import { authStorage } from "../storage/auth";
import { Engine } from "./engine";
export const mock = new MockService(store);
// RN suspends JS timers in background. Artificial latency must not hold a
// headless GPS task/ACK open; the mock still applies its normal validation.
if (config.gps === "device" && config.background) mock.latency = 0;
export const demoGps = new DemoGps();
export const engine = new Engine(
  config.mode === "mock" ? mock : apiService,
  store,
  authStorage,
  config.gps === "demo" ? demoGps : new DeviceGps(),
  config.mode,
);
