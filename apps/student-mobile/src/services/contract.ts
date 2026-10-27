import type { Ack, Auth, Operation, Sample, Snapshot } from "../domain/model";
export class ServiceError extends Error {
  constructor(
    public code: string,
    message: string,
    public retryable = false,
  ) {
    super(message);
  }
}
// Student-only boundary. Never uses admin or wearable credentials.
export interface StudentService {
  login(code: string, password: string): Promise<Auth>;
  snapshot(auth: Auth): Promise<Snapshot>;
  execute(auth: Auth, operation: Operation): Promise<Snapshot>;
  upload(auth: Auth, samples: Sample[]): Promise<Ack>;
  logout?(auth: Auth): Promise<void>;
  changePassword?(auth: Auth, current: string, next: string): Promise<void>;
}
