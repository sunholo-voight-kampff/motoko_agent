import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { buildChildEnv } from "./runtime-process.js";

// The cost cap's rates have to reach the AILANG runtime, and `buildChildEnv` is
// an explicit allowlist, so an unnamed variable is dropped silently. Measured
// 2026-10-12: the cache-aware cap (cost_phase.step_cost_with_cache) shipped with
// its two cache-rate variables missing here, so the runtime priced every cached
// token at the input rate and stopped GLM runs at a self-reported $2.00.

let workdir: string;
const KEYS = [
  "MOTOKO_COST_INPUT_PER_1M_MILLICENTS",
  "MOTOKO_COST_OUTPUT_PER_1M_MILLICENTS",
  "MOTOKO_COST_CACHE_READ_PER_1M_MILLICENTS",
  "MOTOKO_COST_CACHE_WRITE_PER_1M_MILLICENTS",
] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  workdir = fs.mkdtempSync(path.join(os.tmpdir(), "cost-child-env-"));
  for (const k of KEYS) saved[k] = process.env[k];
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  fs.rmSync(workdir, { recursive: true, force: true });
});

describe("buildChildEnv forwards the cost-cap rates", () => {
  it("carries all four rates to the runtime", () => {
    KEYS.forEach((k, i) => { process.env[k] = String(1000 * (i + 1)); });
    const env = buildChildEnv(workdir, "default", "", "");
    KEYS.forEach((k, i) => expect(env[k]).toBe(String(1000 * (i + 1))));
  });
});

describe("buildChildEnv carries an OpenRouter session id", () => {
  it("defaults to the motoko session identity", () => {
    const saved = process.env.OPENROUTER_SESSION_ID;
    delete process.env.OPENROUTER_SESSION_ID;
    const env = buildChildEnv(workdir, "default", "", "");
    expect(env.OPENROUTER_SESSION_ID).toBe(env.MOTOKO_SESSION_ID);
    expect((env.OPENROUTER_SESSION_ID ?? "").length).toBeGreaterThan(0);
    if (saved !== undefined) process.env.OPENROUTER_SESSION_ID = saved;
  });
});

// The ollama streaming switch and its windows reach the runtime. A dropped flag
// fails silently: the runtime takes the buffered path and the host sees no
// progress until the whole generation returns.
describe("buildChildEnv forwards the ollama streaming settings", () => {
  const STREAM_KEYS = [
    "AILANG_OLLAMA_V1_STREAM",
    "AILANG_OLLAMA_IDLE_TIMEOUT_SEC",
    "AILANG_OLLAMA_TTFT_TIMEOUT_SEC",
  ] as const;
  it("carries the flag and both windows", () => {
    const prev: Record<string, string | undefined> = {};
    for (const k of STREAM_KEYS) prev[k] = process.env[k];
    process.env.AILANG_OLLAMA_V1_STREAM = "1";
    process.env.AILANG_OLLAMA_IDLE_TIMEOUT_SEC = "120";
    process.env.AILANG_OLLAMA_TTFT_TIMEOUT_SEC = "600";
    const env = buildChildEnv(workdir, "default", "", "");
    expect(env.AILANG_OLLAMA_V1_STREAM).toBe("1");
    expect(env.AILANG_OLLAMA_IDLE_TIMEOUT_SEC).toBe("120");
    expect(env.AILANG_OLLAMA_TTFT_TIMEOUT_SEC).toBe("600");
    for (const k of STREAM_KEYS) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });
});
