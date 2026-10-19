import * as SecureStore from "expo-secure-store";
import type { Auth } from "../domain/model";
export const authStorage = {
  async read(): Promise<Auth | undefined> {
    const value = await SecureStore.getItemAsync("neu-run-auth");
    return value ? (JSON.parse(value) as Auth) : undefined;
  },
  async write(auth: Auth) {
    await SecureStore.setItemAsync("neu-run-auth", JSON.stringify(auth));
  },
  async clear() {
    await SecureStore.deleteItemAsync("neu-run-auth");
  },
};
