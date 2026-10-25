/** docs/04 §5: the default Ink 2 keyterms (drug names first: a misheard blood thinner is the costliest error). */
export const DEFAULT_KEYTERMS =
  "Eliquis,apixaban,Xarelto,rivaroxaban,Pradaxa,dabigatran,warfarin,Coumadin,Plavix,clopidogrel,Brilinta,Lovenox,tPA,stroke,drooping,slurred,numb,aphasia,insulin,metformin,glucose,seizure,epilepsy,migraine";

export function parseKeyterms(s: string): string[] {
  return s.split(",").map((x) => x.trim()).filter((x) => x !== "");
}
