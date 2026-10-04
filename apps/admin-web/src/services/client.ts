// Demo credentials live only in memory. Never persist or log them.
let adminKey = "";
let generation = 0;
const requests = new Set<AbortController>();
export function setAdminKey(value: string) {
  requests.forEach((controller) => controller.abort());
  adminKey = value;
  generation++;
}
export const getAdminKey = () => adminKey;
export const keyGeneration = () => generation;
export class RequestError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields: Record<string, string> = {},
  ) {
    super(message);
  }
}
export const apiBase =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";
export async function request<T>(
  path: string,
  options: { signal?: AbortSignal; method?: string; body?: unknown } = {},
): Promise<T> {
  if (!adminKey)
    throw new RequestError(401, "Hãy nhập Admin key để kết nối backend.");
  const controller = new AbortController();
  requests.add(controller);
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) controller.abort();
  const timer = setTimeout(abort, 15000);
  try {
    const response = await fetch(`${apiBase.replace(/\/$/, "")}${path}`, {
      method: options.method ?? "GET",
      signal: controller.signal,
      headers: {
        "X-Admin-Key": adminKey,
        ...(options.body === undefined
          ? {}
          : { "Content-Type": "application/json" }),
      },
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const fields: Record<string, string> = {};
      if (Array.isArray(body?.detail))
        for (const item of body.detail)
          fields[(item.loc ?? []).join(".")] = item.msg;
      const messages: Record<number, string> = {
        401: "Admin key không hợp lệ. Hãy nhập lại.",
        403: "Admin key thiếu quyền. Hãy nhập lại.",
        404: "Tài nguyên không còn tồn tại hoặc không thuộc sinh viên này.",
        409: "Xung đột trạng thái hoặc dữ liệu đã tồn tại.",
        422: "Dữ liệu không hợp lệ.",
      };
      throw new RequestError(
        response.status,
        messages[response.status] ?? "Backend gặp lỗi. Hãy thử lại.",
        fields,
      );
    }
    return body as T;
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError(
      0,
      controller.signal.aborted
        ? "Yêu cầu đã hủy hoặc quá thời gian chờ. Hãy thử lại."
        : "Không kết nối được backend. Kiểm tra mạng, địa chỉ và CORS rồi thử lại.",
    );
  } finally {
    clearTimeout(timer);
    requests.delete(controller);
    options.signal?.removeEventListener("abort", abort);
  }
}
export function liveUrl(raceId: string) {
  const url = new URL(
    import.meta.env.VITE_WS_BASE_URL || "ws://localhost:8000",
  );
  if (globalThis.location?.protocol === "https:") url.protocol = "wss:";
  url.pathname = `/ws/v1/races/${encodeURIComponent(raceId)}/live`;
  url.search = new URLSearchParams({ key: adminKey }).toString();
  return url;
}
