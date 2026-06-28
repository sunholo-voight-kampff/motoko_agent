# M-MOTOKO-VERIFY-DONE: redefine the done-gate to require behavioral validation

**Status:** In Progress (2026-06-28). Lane: motoko harness (env-gated, A/B before default — minimal-core discipline).

## Problem (data, this session)

The DP7 done-gate (`agent_loop_v2.ail:962 run_dp7_verifier`) gates "done" on **`ailang check .` (types only)**, and its reject message literally says *"Fix all errors before declaring done"* / *"Do not stop until the project type-checks."* So the harness **trains the model that type-correct = done.** Result (docx N=5, post-compaction-fix): the `logic_error` failure — `parseDocx` searched `"body"` instead of the namespaced `"w:body"`, returned `[]` → output `"0\n"` vs expected 10. **Perfectly type-correct, semantically wrong.** Across all trials the model authored **0 contracts** and ran **0 `verify`/`test`** — it never used AILANG's behavioral-verification tools, because the gate never asked it to.

A type check is necessary but not sufficient. The fix: make "done" require **behavioral** validation, not just types.

## Design

Gate behind `MOTOKO_REQUIRE_TEST=1` (off by default; A/B on the rig, then flip the default — same pattern as `MOTOKO_PERSIST_RETRIES`). When on, after the existing type-check passes for an `.ail` project, the done-gate additionally requires:

1. **The model authored behavioral validation.** Track a `behavior_validated` flag in the loop: set true when the model writes a file whose content contains `requires {` / `ensures {` / `tests [`. (Tracking the model's *writes* — not the workspace — cleanly distinguishes model-authored contracts from the ones in provided dependency files like `document.ail`.) If false at the gate → **Reject** with coaching:
   > Type-check passes, but you've validated only TYPES, not BEHAVIOR. Add a property contract to your main function capturing a spec invariant — e.g. for a parser, `ensures { length(result) > 0 }` (a non-empty input must yield blocks) — or an inline `tests [...]`, then make `ailang verify` / `ailang test` pass before declaring done.

2. **The contracts hold.** `ailang verify` is FILE-only (errors on `.`) and exit 1 covers both `VIOLATION` and Z3 `ERROR` (e.g. a builtin used in a contract but not imported), so iterate the `.ail` files and key on the literal **`VIOLATION`** — a provably-false contract. On a hit → **Reject** with the counterexample. Confirmed working: `ensures { length(result) > 0 }` with `import std/list (length)` maps to Z3 `seq.len` (smt/types.go:396) — holds → `VERIFIED`, `[]` → `VIOLATION` + counterexample. Un-provable contracts (`ERROR`) are skipped, never block.

   **This also teaches good AILANG architecture.** A contract verifies only on a PURE function (Z3 can't model effects), so requiring one steers the model to extract a pure, contractable core (`parseBody(xml) -> [Block]` with `ensures { length(result) > 0 }`) called by a thin effectful shell (`parseDocx(file) ! {FS}`) — the pure-core/effectful-shell discipline. The failed docx solution was one un-contractable `parseDocx ! {FS}`; the gate pushes the structure that makes verification (and correctness) possible.

3. **Inline tests pass.** `ailang test --format json .` → if any test failed → **Reject** with the failures.

Type errors / missing-infrastructure handling is unchanged. Non-`.ail` projects keep `rt.verification.command`.

## Why this is the right lane + minimal

- The done-gate **is** the policy that's wrong (the floor trains a bad habit) — fixing it is legitimate core work, but it's **env-gated** so the default is unchanged until A/B proves it, and the *strategy* (what counts as validation) stays a thin, tunable policy rather than sprawling logic.
- General, not docx-specific: every type-correct-but-wrong AILANG task benefits. The invariant-contract coaching is a general AILANG skill.

## Verification
- `make check_core` clean. Unit-style: a workspace with no contract → Reject(coaching); a violated contract → Reject(counterexample); a passing contract → Approve. Then A/B docx N=5 with `MOTOKO_REQUIRE_TEST=1` vs off — expect the `logic_error` class to convert into either a pass or a *caught* failure the model can act on.
