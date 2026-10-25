// docs/04 §2 fast-pass fixture expectations, shared by the fake-model test and fastPass.live.test.ts.
import type { FactKind, SignKind } from "../contracts/index.js";

export interface FastPassFixture {
  utterance: string;
  prevDispatcherText: string | null;
  /** Exactly these sign kinds (no more, no fewer); `quotes` lists acceptable quotes per kind. */
  signs: { kind: SignKind; quotes?: readonly string[] }[];
  /** Required facts; extra facts of other kinds are tolerated. */
  facts: { kind: FactKind; value?: string; quote?: string }[];
}

export const FAST_PASS_FIXTURES: readonly FastPassFixture[] = [
  {
    utterance: "Since lunch his words come out all mixed up and his right hand is weak, he can't lift his coffee cup.",
    prevDispatcherText: null,
    signs: [
      { kind: "speech", quotes: ["his words come out all mixed up"] },
      { kind: "arms", quotes: ["his right hand is weak", "he can't lift his coffee cup"] },
    ],
    facts: [{ kind: "last_known_well", value: "Since lunch" }, { kind: "sex", value: "male" }],
  },
  {
    utterance: "He was fine at about 2 PM. He takes Eliquis.",
    prevDispatcherText: null,
    signs: [],
    facts: [
      { kind: "last_known_well", value: "fine at about 2 PM" },
      { kind: "blood_thinner", value: "Eliquis", quote: "He takes Eliquis" },
    ],
  },
  {
    utterance: "My wife is dizzy, keeps bumping into the wall and says she sees double. I think she's just tired.",
    prevDispatcherText: null,
    signs: [{ kind: "balance" }, { kind: "eyes" }],
    facts: [{ kind: "sex", value: "female", quote: "My wife" }],
  },
  {
    utterance: "My husband is diabetic, skipped dinner, is sweaty and confused.",
    prevDispatcherText: null,
    signs: [],
    facts: [{ kind: "diabetes" }, { kind: "sex", value: "male" }],
  },
  {
    utterance: "I think it's his chest, he says it hurts and he's sweating.",
    prevDispatcherText: null,
    signs: [],
    facts: [{ kind: "sex", value: "male" }],
  },
  {
    utterance: "Yes.",
    prevDispatcherText: "Is his face drooping?",
    signs: [],
    facts: [],
  },
];
