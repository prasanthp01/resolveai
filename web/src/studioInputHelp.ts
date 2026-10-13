import type { Field } from "./studioClient";

type InputHelp = {
  label: string;
  meaning: string;
  example: string;
  effect: string;
  unit?: string;
  constraint?: string;
  options?: Record<string, { label: string; effect: string }>;
};

export const inputHelp: Record<string, InputHelp> = {
  service: {
    label: "Service name",
    meaning: "The application or service experiencing the problem.",
    example: "payment-api — the service that processes payments.",
    constraint:
      "Start with a lowercase letter; use only lowercase letters, digits and hyphens.",
    effect:
      "Names the affected service in the report. The name alone does not change severity or the suspected cause.",
  },
  error_rate: {
    label: "Error rate (%)",
    meaning:
      "The percentage of requests that fail. Enter a percentage, not a fraction.",
    example: "62 means 62 out of every 100 requests fail; 0.2 means 0.2%.",
    unit: "%",
    effect:
      "Sets severity: below 1% is low; 1–under 10% medium; 10–under 50% high; 50% or more critical. It also helps compare errors before and after a release. Severity does not prove a cause.",
  },
  latency_ms: {
    label: "Response time (ms)",
    meaning: "How long a request takes to respond, in milliseconds.",
    example: "2400 ms = 2.4 seconds; 120 ms = 0.12 seconds.",
    unit: "ms",
    effect:
      "Appears in the impact summary. At least 1,000 ms supports a slow-query hypothesis only when slow queries and high database CPU or lock waits are also present.",
  },
  incident_context: {
    label: "Incident description",
    meaning:
      "A short, synthetic note describing what you noticed. Leave it empty if you do not need a note.",
    example: "Checkout requests are failing after lunch.",
    constraint:
      "Use English letters, digits, spaces and these symbols: . , _ ( ) - . No real customer details or secrets.",
    effect:
      "Records context in the input. The current rules do not interpret this text or use it to determine the cause.",
  },
  db_connections: {
    label: "Database connections in use",
    meaning: "How many connections to the database are currently being used.",
    example: "96 in use with a maximum of 100 = 96% utilisation.",
    constraint: "Must not exceed Maximum database connections below.",
    effect:
      "At least 85% of the maximum supports database connection pressure, provided database diagnostics are available. Lowering this value can remove that hypothesis.",
  },
  db_max_connections: {
    label: "Maximum database connections",
    meaning:
      "The database's configured connection capacity. This is the limit, not current usage.",
    example: "100 maximum with 96 in use leaves 4 connections available.",
    constraint: "Must be at least Database connections in use.",
    effect:
      "Provides the denominator for utilisation: connections in use ÷ maximum. Increasing only the maximum reduces the simulated pressure; no real database setting is changed.",
  },
  db_cpu_percent: {
    label: "Database CPU usage (%)",
    meaning: "How busy the database processor is.",
    example:
      "96 means the processor is 96% busy; 20 is relatively light usage.",
    unit: "%",
    effect:
      "At least 85%, together with slow queries and response time of at least 1,000 ms, supports a slow-query hypothesis. Lock waiters can provide the alternative supporting signal.",
  },
  db_lock_waiters: {
    label: "Database operations waiting for locks",
    meaning:
      "Operations waiting because another operation is holding a database lock.",
    example:
      "9 means nine operations are waiting; 0 means none are waiting in this sample.",
    effect:
      "A value above zero, together with slow queries and response time of at least 1,000 ms, supports lock contention. Waiting operations alone do not establish a cause.",
  },
  slow_queries: {
    label: "Slow database queries",
    meaning:
      "The number of database queries reported as slow in your synthetic sample.",
    example: "12 slow queries; use 0 if the sample has none.",
    effect:
      "Must be above zero for the slow-query hypothesis. The rules also need at least 1,000 ms response time and either CPU usage of at least 85% or lock waiters above zero.",
  },
  redis_memory_mb: {
    label: "Cache memory used (MiB)",
    meaning:
      "Memory currently used by the Redis cache, which stores temporary data for faster access.",
    example: "990 MiB used out of 1,024 MiB is about 97% full.",
    unit: "MiB",
    constraint: "Must not exceed Maximum cache memory below.",
    effect:
      "At least 90% of maximum memory, together with evictions above zero, supports cache memory pressure. High usage by itself is not enough.",
  },
  redis_maxmemory_mb: {
    label: "Maximum cache memory (MiB)",
    meaning: "The configured memory limit for the simulated Redis cache.",
    example: "1024 MiB = 1 GiB of cache capacity.",
    unit: "MiB",
    constraint: "Must be at least Cache memory used.",
    effect:
      "Provides the denominator for cache utilisation: used memory ÷ maximum. Changing it affects the pressure calculation, not a real cache configuration.",
  },
  redis_evictions: {
    label: "Cache items evicted",
    meaning: "The count of cached items Redis removed to make room.",
    example: "820 evictions; 0 means no evictions in this synthetic counter.",
    effect:
      "A value above zero plus at least 90% memory utilisation supports cache pressure. A cumulative counter alone does not prove the evictions caused this incident.",
  },
  upstream_429: {
    label: "Upstream rate-limit responses (429)",
    meaning:
      "How many times a service you depend on responded with HTTP 429: too many requests.",
    example: "80 rate-limit responses; use 0 when there are none.",
    effect:
      "Any value above zero supports upstream rate limiting. This describes the incident signal; it is separate from injecting a mock provider failure below.",
  },
  retry_after_seconds: {
    label: "Retry delay (seconds)",
    meaning:
      "How long the upstream service asks callers to wait before trying again.",
    example: "2 means wait two seconds before retrying.",
    unit: "seconds",
    effect:
      "Appears in rate-limit guidance and the mock provider-429 trace. It does not make a real retry, add this delay to the run, or change severity.",
  },
  recent_deployment: {
    label: "Recent software deployment",
    meaning: "Was a new software version released shortly before the incident?",
    example: "Check Yes for a recent release; leave unchecked for No.",
    effect:
      "Yes plus an error-rate increase of at least five percentage points supports a release-regression hypothesis (current rate must also be at least 1%). Competing database evidence weakens confidence; this does not prove the release caused it.",
  },
  previous_error_rate: {
    label: "Error rate before deployment (%)",
    meaning: "The percentage of failed requests before the software release.",
    example:
      "0.2% before and 32% now is an increase of 31.8 percentage points.",
    unit: "%",
    effect:
      "Compared with the current error rate only when Recent software deployment is Yes. It does not set the incident's current severity.",
  },
  log_fixture: {
    label: "Sample log message",
    meaning:
      "Choose a prepared synthetic log sample. You cannot paste or execute arbitrary log instructions.",
    example:
      "Connection pool timeout for exhausted connections; Normal diagnostics for no matching log error.",
    effect:
      "Adds evidence that can support or contradict the numeric signals. Logs cannot prove a cause on their own.",
    options: {
      pool_timeout: {
        label: "Connection pool timeout",
        effect:
          "Shows a connection acquisition timeout. Database utilisation still determines whether connection pressure is supported.",
      },
      query_timeout: {
        label: "Slow query timeout",
        effect:
          "Shows a query exceeding its deadline. Slow queries, latency and CPU or lock waits are still needed.",
      },
      cache_miss: {
        label: "Cache eviction",
        effect:
          "Adds a cache-eviction log sample. High memory utilisation and a nonzero eviction count are still needed.",
      },
      release_error: {
        label: "Error after release",
        effect:
          "Adds a release-related error sample. Recent deployment and the change in error rate determine the release hypothesis.",
      },
      upstream_limit: {
        label: "Upstream rate limit",
        effect:
          "Adds an HTTP 429 log sample. A nonzero upstream-429 count is still needed for the rate-limit hypothesis.",
      },
      normal: {
        label: "Normal diagnostics",
        effect:
          "Contradicts a database-pressure hypothesis and can reduce confidence. With healthy numeric signals, the result may be insufficient evidence.",
      },
      injection_attempt: {
        label: "Instruction attempt (quarantined)",
        effect:
          "Demonstrates an untrusted instruction attempt. Its content is quarantined and no instruction is executed.",
      },
    },
  },
  fault: {
    label: "Failure to simulate",
    meaning:
      "Deliberately interrupt part of the investigation to see how the system handles an exception.",
    example:
      "Choose Connector timeout to investigate with missing database evidence.",
    effect:
      "Tests failure handling independently of the incident metrics. All failures and provider calls in this selector are simulated.",
    options: {
      none: {
        label: "None — normal investigation",
        effect:
          "Runs the normal deterministic workflow without an injected failure.",
      },
      connector_timeout: {
        label: "Connector timeout",
        effect:
          "Database diagnostics are unavailable. The investigation continues with partial evidence, flags the gap and avoids assuming database health.",
      },
      provider_429: {
        label: "Provider rate limit (429)",
        effect:
          "A mock provider is blocked by a rate limit. The workflow continues with deterministic rules and a warning; no real model is contacted.",
      },
      invalid_model_output: {
        label: "Invalid model output",
        effect:
          "Rejects a simulated invalid model response and falls back to deterministic rules, retaining a warning.",
      },
      workflow_timeout: {
        label: "Workflow timeout",
        effect:
          "Stalls the synthetic workflow to trigger its deadline. The run ends as failed with timeout information.",
      },
    },
  },
  seed: {
    label: "Experiment seed",
    meaning:
      "A value recorded with the run to support reproducible experiments.",
    example: "42 — keep the same seed while comparing changes to other inputs.",
    effect:
      "The current rules use no randomness. Changing only the seed changes provenance, not the diagnosis; it is not a random incident generator.",
  },
};

export function allowedInput(field: Field, help: InputHelp): string {
  let range: string;
  if (field.enum) {
    range = "Choose one of the listed options; custom values are rejected.";
  } else if (field.type === "boolean") {
    range = "Yes (checked) or No (unchecked). JSON: true or false.";
  } else if (field.type === "string") {
    range = `${field.minLength ?? 0}–${field.maxLength} characters${!field.minLength ? "; empty is allowed" : ""}.`;
  } else {
    const fmt = (n: number | undefined) => n?.toLocaleString("en-US");
    range = `${fmt(field.minimum)}–${fmt(field.maximum)}${help.unit ? (help.unit === "%" ? "%" : " " + help.unit) : ""}, inclusive. ${field.type === "integer" ? "Whole numbers only." : "Decimals allowed."}`;
  }
  return range + (help.constraint ? " " + help.constraint : "");
}
