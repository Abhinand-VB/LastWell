# CALL-EVIDENCE RULES (model version of docs/guardrails/call-evidence-hard-rules.md v1.0)

These rules decide what counts as evidence. [Rn] is the source rule number. Apply them inside the JSON schema you were given; add no fields. Not emitted as a sign: denied, tentative, historical, other-person, hearsay, question-only and corrected items. Anything the rules leave unknown is left out. Time phrases are passed as the caller said them.

## A. Source
- Only this patient, this episode: family history, other people and background talk are not signs. [R1]
- A dispatcher question, a guess ("might be a stroke") or a hypothetical is not a finding; a clear answer that restates it ("yes, his face is drooping now") is. [R2]
- No exact quote of the caller's words, no item. Never paraphrase a quote. [R3]
- Firsthand ("I see her mouth droop") ≠ hearsay ("the neighbor says it drooped") ≠ guess ("I think it drooped"); only firsthand, affirmed observations become signs. [R4]
- Map lay words to a sign only when the described behavior fits ("can't get the words out" → speech; an unexplained dropped cup is not arm weakness). Not saying "stroke" means nothing. [R5]

## B. Missing or unreliable speech
- Cut-off, dropped or unanswered speech is unknown; never complete it from context. [R6]
- If noise or overlap hides the deciding word (can/can't, has/hasn't, left/right, a time), that item is unknown; clear statements elsewhere still count. [R7]
- If the speaker of a patient-specific statement is unclear, leave it out. [R8]
- The transcript may be wrong; never pick the more clinically likely reading of a contested word. [R9]
- An accent, a language switch or a garbled transcript is neither a speech sign nor a denial. [R10]
- Sounds, silence or crying alone prove nothing; a speech sign needs the caller to say speech changed. [R11]

## C. Affirmation, denial, uncertainty
- A denial covers only what it denies: "no droop, but her speech is strange" → no face sign; speech may still be a sign. [R12]
- Read polarity from the whole clause ("not weak", "can't move", "no longer can lift"); if it is unclear, leave it out. [R13]
- Not mentioned, not answered, refused or "I don't know" is unknown, never denied. [R14]
- "Maybe", "I think", "it looked like", "not sure" stay uncertain: not a sign. [R15]
- Keep kinds apart: slurred speech, word-finding, not understanding, confusion, drowsiness, dizziness, walking trouble, vision loss and double vision differ. [R16]
- Long-standing problems ("weak since last year", "always hard to understand") are not new signs; never invent a sudden onset. [R17]
- A discovery time ("found him on the floor at eight") is not onset or last-known-well; "suddenly" needs someone who saw the change. [R18]

## D. A changing account
- A clear correction by the caller replaces the earlier claim: do not emit the corrected sign again. [R19]
- Conflicting accounts stay unresolved; do not pick one. [R20]
- A repetition or a dispatcher's paraphrase is the same observation, not more evidence. [R21]
- A symptom that went away still happened; never call it "no concern". [R22]

## E. Time
- Last known well, first symptom, time found and call time are different things; only a last-known-well phrase goes in last_known_well. [R23]
- Waking up with symptoms, being found or calling at a time is not last known well; bedtime counts only if the caller says the patient was normal then. [R24]
- Keep approximate or relative phrases as said ("about an hour ago", "around nine"); never choose AM/PM or convert to a clock time. [R25]
- A missing time never cancels a reported sign. [R26]

## F. Mimics and limits
- A mimic the caller mentions (low sugar, seizure, drinking, migraine, infection) is a parallel possibility, not proof stroke is absent; "he is diabetic" is not a measured low sugar. [R27]
- Vague complaints (dizzy, headache, confused, acting strange) are recorded as described, never upgraded to a face, arm or speech sign; no face, arm or speech report does not rule stroke out. [R28]
- Never state a diagnosis, "stroke ruled out", a treatment window or a probability. [R29]
- You never send or approve an alert; the dispatcher decides. [R30]

## Examples (caller says → emit / never)
- D: "Is his arm weak?" C: "No, he moves both normally." → no arms sign / never an arms sign from the question. [R2, R12]
- C: "He can—" (cut off) → nothing / never complete the sentence. [R6]
- "she can lift it" under a siren, another reading "can't" → no arms sign / never pick a reading. [R7, R9]
- C: "Her words were mixed up just now; I saw it." → speech sign quoting "Her words were mixed up just now" / never a diagnosis word. [R4, R29]
- C: "He felt dizzy." → balance sign quoting "He felt dizzy" only / never add other signs, never rule stroke out. [R16, R28]
- C: "I saw her normal at 6. I found her on the floor at 8." → last_known_well "normal at 6" / never "at 8". [R23, R24]
- C: "He has diabetes, maybe sugar is low." → diabetes fact; low blood sugar only as a look-alike / never a measured low sugar. [R27]
- C: "His face was drooping." Later: "Sorry, that was the shadow; his face looks normal." → after the correction, no face sign / never keep only the first claim. [R19]
