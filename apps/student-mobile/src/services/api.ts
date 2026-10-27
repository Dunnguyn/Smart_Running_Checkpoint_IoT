import type { StudentService } from "./contract";
import { ServiceError } from "./contract";
// Deliberately no guessed URLs and no fallback. Existing routes require privileged
// admin/wearable keys and cannot authenticate a student/password or GPS segments.
const pending = async (): Promise<never> => {
  throw new ServiceError(
    "CONTRACT_PENDING",
    "API sinh viên đang chờ backend: xác thực mật khẩu, phiên và GPS theo đoạn chưa có hợp đồng. Chế độ API không dùng dữ liệu demo.",
  );
};
export const apiService: StudentService = {
  login: pending,
  snapshot: pending,
  execute: pending,
  upload: pending,
};
