export type Evidence = {
  id: string;
  source: string;
  data: Record<string, unknown>;
  observed_at: string;
};
export type Report = {
  summary: string;
  severity: string;
  impact: string;
  hypotheses: { title: string; rationale: string; evidence_ids: string[] }[];
  supporting_evidence_ids: string[];
  contradicting_evidence_ids: string[];
  uncertainty: string;
  recommended_next_steps: string[];
  investigation_mode: string;
  started_at: string;
  completed_at: string;
};
export type Scenario = {
  slug: string;
  title: string;
  service: string;
  error_rate: number;
  description: string;
  severity: string;
  duration: string;
  evidence: Evidence[];
  report: Report;
  timeline: { action: string; description: string; offset: number }[];
};
export type Incident = {
  id: string;
  event_id: string;
  service: string;
  message: string;
  error_rate: number;
  status: string;
  severity: string;
  mode: string;
  note: string;
  created_at: string;
};
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(
    (location.pathname.startsWith("/projects/resolveai")
      ? "/api/projects/resolveai/v1"
      : "/api/v1") + path,
    {
      credentials: "same-origin",
      ...options,
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": sessionStorage.getItem("csrf") || "",
        ...options.headers,
      },
    },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Request failed");
  return data;
}
export function download(name: string, value: unknown) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
