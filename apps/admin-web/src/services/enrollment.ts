import { request } from "./client";
export interface Student {
  student_id: string;
  student_code: string;
  full_name: string;
  faculty: string | null;
  status: string;
}
export interface Participant extends Omit<Student, "status"> {
  participant_id: string;
  bib_number: string | null;
  display_id: string | null;
  registration_status: string;
}
export const enrollment = {
  students: (q: string, offset: number, signal?: AbortSignal) =>
    request<{ items: Student[]; limit: number; offset: number }>(
      `/students?${new URLSearchParams({ limit: "20", offset: String(offset), ...(q.trim() ? { q: q.trim() } : {}) })}`,
      { signal },
    ),
  participants: (id: string, signal?: AbortSignal) =>
    request<{ race_id: string; items: Participant[] }>(
      `/races/${encodeURIComponent(id)}/participants`,
      { signal },
    ),
  register: (
    id: string,
    studentId: string,
    bib: string,
    signal?: AbortSignal,
  ) =>
    request(`/races/${encodeURIComponent(id)}/participants`, {
      method: "POST",
      body: registrationPayload(studentId, bib),
      signal,
    }),
};
export function registrationPayload(studentId: string, bib: string) {
  return {
    student_id: studentId,
    ...(bib.trim() ? { bib_number: bib.trim() } : {}),
  };
}
