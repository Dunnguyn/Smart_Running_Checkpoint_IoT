import type { Auth } from "../domain/model";
// Only mock sessions persist in a browser. Real native credentials use SecureStore.
export const authStorage = {
  async read(): Promise<Auth | undefined> {
    const value = sessionStorage.getItem("neu-run-mock-auth");
    return value ? (JSON.parse(value) as Auth) : undefined;
  },
  async write(auth: Auth) {
    if (auth.token.startsWith("mock:"))
      sessionStorage.setItem("neu-run-mock-auth", JSON.stringify(auth));
  },
  async clear() {
    sessionStorage.removeItem("neu-run-mock-auth");
  },
};
