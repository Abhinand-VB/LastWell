import { afterEach, describe, expect, it } from "vitest";
import { createFakeModel, type ModelClient } from "@lastwell/core";
import { testGateway, until, type TestGateway } from "../testkit.js";

let gw: TestGateway | null = null;
afterEach(async () => {
  await gw?.app.close();
  gw = null;
});

describe("call runner (V-05)", () => {
  it("fast pass errors are absorbed; three reasoner failures raise reasoner_delayed, a success clears it", async () => {
    const fake = createFakeModel();
    let reasonerFails = true;
    let fastFails = true;
    const model: ModelClient = {
      fastPass: async (i) => {
        if (fastFails) throw new Error("429");
        return fake.fastPass(i);
      },
      reason: async (i) => {
        if (reasonerFails) throw new Error("timeout");
        return fake.reason(i);
      },
      answer: (i) => fake.answer(i),
    };
    gw = testGateway({ model, env: { REASONER_INTERVAL_MS: "20" } });
    const call = gw.calls.create({ mode: "phone", streamStartedNow: true });
    gw.calls.addFinal(call, { speaker: "caller", text: "He can't lift his coffee cup.", tStartMs: 0, tEndMs: 500 });
    await until(() => call.runner!.state.warnings.includes("reasoner_delayed"));
    expect(call.runner!.state.signs).toHaveLength(0); // the failed fast pass added nothing, process alive
    fastFails = false;
    reasonerFails = false;
    gw.calls.addFinal(call, { speaker: "caller", text: "His words come out all mixed up.", tStartMs: 1000, tEndMs: 1500 });
    await until(() => !call.runner!.state.warnings.includes("reasoner_delayed") && call.runner!.state.signs.length > 0);
    expect(call.runner!.state.latency.fastPassMs).not.toBeNull();
    expect(call.runner!.state.latency.reasonerMs).not.toBeNull();
  });

  it("dispatcher utterances skip the fast pass but reach the reasoner; versions increase", async () => {
    gw = testGateway();
    const call = gw.calls.create({ mode: "phone", streamStartedNow: true });
    gw.calls.addFinal(call, { speaker: "dispatcher", text: "Can he lift both arms?", tStartMs: 0, tEndMs: 500 });
    gw.calls.addFinal(call, { speaker: "caller", text: "No, his right arm just drops.", tStartMs: 600, tEndMs: 1500 });
    await until(() => call.runner!.state.version > 0);
    const v = call.runner!.state.version;
    await gw.calls.end(call);
    expect(call.runner!.state.version).toBeGreaterThan(v);
    expect(call.status).toBe("ended");
  });
});
