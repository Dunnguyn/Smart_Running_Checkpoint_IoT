import type { Fix, Race, Sample } from "../domain/model";
export type MapProps = {
  race: Race;
  samples?: Sample[];
  location?: Fix;
  compact?: boolean;
};
export function segments(samples: Sample[]) {
  const result: Sample[][] = [];
  for (const sample of samples) {
    const last = result.at(-1)?.at(-1);
    if (
      !last ||
      last.segment !== sample.segment ||
      sample.timestamp - last.timestamp > 30000
    )
      result.push([]);
    result.at(-1)!.push(sample);
  }
  return result;
}
