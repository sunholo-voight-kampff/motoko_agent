import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { buildChildEnv } from "./runtime-process.js";

// The rig lease has to reach the AILANG runtime: the runtime makes the model
// call, and ailang's clients read AILANG_RIG_LEASE to attach it. buildChildEnv
// is an allowlist, so without an explicit forward a gated local model refuses
// every step (423) while the lock is held.

let workdir: string;
let saved: string | undefined;

beforeEach(() => {
  workdir = fs.mkdtempSync(path.join(os.tmpdir(), "rig-lease-child-env-"));
  saved = process.env.AILANG_RIG_LEASE;
});

afterEach(() => {
  if (saved === undefined) delete process.env.AILANG_RIG_LEASE;
  else process.env.AILANG_RIG_LEASE = saved;
  fs.rmSync(workdir, { recursive: true, force: true });
});

describe("buildChildEnv forwards the ailang_only lane policy", () => {
  it("carries AILANG_AGENT_POLICY when set, and nothing when not", () => {
    const saved = process.env.AILANG_AGENT_POLICY;
    try {
      process.env.AILANG_AGENT_POLICY = "/run/lane/agent-policy.toml";
      expect(buildChildEnv(workdir, "someprofile", "", "").AILANG_AGENT_POLICY).toBe("/run/lane/agent-policy.toml");
      delete process.env.AILANG_AGENT_POLICY;
      expect("AILANG_AGENT_POLICY" in buildChildEnv(workdir, "someprofile", "", "")).toBe(false);
    } finally {
      if (saved === undefined) delete process.env.AILANG_AGENT_POLICY;
      else process.env.AILANG_AGENT_POLICY = saved;
    }
  });
});

describe("buildChildEnv forwards the rig lease", () => {
  it("carries AILANG_RIG_LEASE when the parent holds one", () => {
    process.env.AILANG_RIG_LEASE = "0123456789abcdef0123456789abcdef";
    const childEnv = buildChildEnv(workdir, "someprofile", "", "");
    expect(childEnv.AILANG_RIG_LEASE).toBe("0123456789abcdef0123456789abcdef");
  });

  it("adds nothing when there is no lease", () => {
    delete process.env.AILANG_RIG_LEASE;
    const childEnv = buildChildEnv(workdir, "someprofile", "", "");
    expect("AILANG_RIG_LEASE" in childEnv).toBe(false);
  });
});
