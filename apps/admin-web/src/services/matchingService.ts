import { request } from "./client";
import { utc } from "./contract";
import type {
  CheckpointEvent,
  MatchStatus,
  MatchingConfig,
  Resolution,
} from "./matchingContract";
const part = encodeURIComponent;
export function normalizeEvent(e: CheckpointEvent): CheckpointEvent {
  return {
    ...e,
    occurred_at: utc(e.occurred_at)!,
    received_at: utc(e.received_at)!,
    match_deadline_at: utc(e.match_deadline_at),
    candidates:
      e.candidates?.map((c) => ({ ...c, entry_at: utc(c.entry_at)! })) ?? [],
  };
}
export const matchingService = {
  async list(
    raceId: string,
    filters: {
      checkpoint_id?: string;
      match_status?: MatchStatus | "";
      from?: string;
      to?: string;
      cursor?: string;
      limit?: number;
    },
    signal?: AbortSignal,
  ) {
    const query = new URLSearchParams({ limit: String(filters.limit ?? 20) });
    for (const [key, value] of Object.entries(filters))
      if (value !== undefined && value !== "") query.set(key, String(value));
    const page = await request<{
      items: CheckpointEvent[];
      next_cursor: string | null;
    }>(`/races/${part(raceId)}/checkpoint-events?${query}`, { signal });
    return { ...page, items: page.items.map(normalizeEvent) };
  },
  async detail(id: string, signal?: AbortSignal) {
    return normalizeEvent(
      await request<CheckpointEvent>(`/checkpoint-events/${part(id)}`, {
        signal,
      }),
    );
  },
  async resolve(id: string, body: Resolution, signal?: AbortSignal) {
    return normalizeEvent(
      await request<CheckpointEvent>(`/checkpoint-events/${part(id)}/resolve`, {
        method: "POST",
        body,
        signal,
      }),
    );
  },
  config(
    id: string,
    body: Partial<Omit<MatchingConfig, "config_version">>,
    signal?: AbortSignal,
  ) {
    return request<MatchingConfig>(`/races/${part(id)}/checkpoint-matching`, {
      method: "PATCH",
      body,
      signal,
    });
  },
  register(
    checkpointId: string,
    body: { device_id: string; name?: string },
    signal?: AbortSignal,
  ) {
    return request<{
      device_id: string;
      checkpoint_id: string;
      race_id: string;
      status: string;
    }>(`/checkpoints/${part(checkpointId)}/devices`, {
      method: "POST",
      body,
      signal,
    });
  },
};
