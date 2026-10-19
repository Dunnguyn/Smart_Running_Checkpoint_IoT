import type { Fix } from "../domain/model";
export interface Gps {
  fresh(): Promise<Fix>;
  start(
    onFix: (fix: Fix) => void,
    onError: (message: string) => void,
  ): Promise<void>;
  stop(): Promise<void>;
}
export const LOCATION_TASK = "neu-run-location-v1";
