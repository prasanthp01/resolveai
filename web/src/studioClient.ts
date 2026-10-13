export const SANDBOX_API = "/api/projects/resolveai";
export type Input = Record<string, string | number | boolean>;
export type Preset = {
  id: string;
  name: string;
  preset_id: string;
  title: string;
  description: string;
  input: Input;
};
export type Field = {
  type: string;
  title?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  enum?: string[];
  pattern?: string;
};
export type Descriptor = {
  input_schema: { properties: Record<string, Field> };
  limits: Record<string, number>;
};
export type Step = {
  project_id: string;
  run_id: string;
  event_id: string;
  sequence: number;
  step_id: string;
  status: string;
  mode: string;
  title: string;
  overview: string;
  technical: Record<string, unknown>;
  duration_ms?: number;
  occurred_at: string;
};
export type State = {
  run_id: string;
  status: string;
  event_count: number;
  deduplicated?: boolean;
};
export type Finding = {
  title: string;
  rationale: string;
  evidence_ids: string[];
  contradicting_evidence_ids: string[];
  confidence: string;
};
export type Result = {
  project_id: string;
  run_id: string;
  status: string;
  app_version: string;
  fixtures_version: string;
  duration_ms: number;
  mode: string;
  errors: { code: string; message: string }[];
  warnings: string[];
  evidence: { evidence_id: string; reference: string; sha256: string }[];
  output: {
    evidence_ledger: {
      id: string;
      source: string;
      data: Record<string, unknown>;
    }[];
    step_details: { sequence: number; technical: Record<string, unknown> }[];
    faults: { code: string; message: string }[];
    summary: string;
    severity?: string;
    impact?: string;
    uncertainty?: string;
    hypotheses?: Finding[];
    recommended_next_steps?: string[];
    semantic_sha256?: string;
    limitations?: string[];
    provenance?: Record<string, unknown>;
  };
  cost: { kind: string; value: number; currency: string };
};
export class StudioError extends Error {
  constructor(
    message: string,
    public code: string,
    public fields: { field: string; type: string; message?: string }[] = [],
  ) {
    super(message);
  }
}
export const terminal = (status: string) =>
  ["SUCCEEDED", "FAILED", "CANCELLED", "EXPIRED"].includes(status);
export function mergeSteps(
  previous: Step[],
  incoming: Step[],
  runId: string,
): Step[] {
  const map = new Map(previous.map((e) => [e.sequence, e]));
  for (const event of incoming) {
    if (
      event.run_id !== runId ||
      event.project_id !== "resolveai" ||
      event.mode !== "SANDBOX_DETERMINISTIC" ||
      !Number.isInteger(event.sequence) ||
      event.sequence < 1 ||
      event.sequence > 40
    )
      throw new StudioError("Incompatible server event.", "EVENT_CONTRACT");
    const old = map.get(event.sequence);
    if (old && JSON.stringify(old) !== JSON.stringify(event))
      throw new StudioError("Conflicting event history.", "EVENT_CONFLICT");
    map.set(event.sequence, event);
  }
  return [...map.values()].sort((a, b) => a.sequence - b.sequence);
}
export class StudioClient {
  private csrf = "";
  async request<T>(
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    const response = await fetch(SANDBOX_API + path, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      redirect: "error",
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(8000)])
        : AbortSignal.timeout(8000),
      headers: {
        Accept: "application/json",
        ...(body === undefined
          ? {}
          : { "Content-Type": "application/json", "X-CSRF-Token": this.csrf }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const token = response.headers.get("x-csrf-token");
    if (token) this.csrf = token;
    if (!response.headers.get("content-type")?.includes("application/json"))
      throw new StudioError(
        "The simulation API is not connected at this address.",
        "API_UNAVAILABLE",
      );
    const data = await response.json();
    if (!response.ok)
      throw new StudioError(
        data.message || "Request failed.",
        data.code || String(response.status),
        data.fields || [],
      );
    return data as T;
  }
  async discover(signal?: AbortSignal) {
    const [schema, presets] = await Promise.all([
      this.request<Descriptor>("/simulation/schema", undefined, signal),
      this.request<{ presets: Preset[] }>(
        "/simulation/presets",
        undefined,
        signal,
      ),
    ]);
    return {
      schema,
      presets: presets.presets.map((p) => ({
        ...p,
        id: p.preset_id,
        name: p.title,
      })),
    };
  }
}
