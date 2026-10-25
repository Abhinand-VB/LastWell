# LastWell: hard rules for reading an emergency call

**Version:** 1.0 · **Purpose:** Give a call-reading model fixed constraints for extracting *what the call actually establishes*. This is an evidence contract for a dispatcher-support prototype. It is **not** a stroke diagnostic rule, probability model, dispatch protocol, or authorization to contact a hospital. A separate, tested decision policy and a human dispatcher control any pre-alert.

## How to use this document

Apply the numbered rules to every live or recorded call. Read the complete available conversation in order; reevaluate when a new turn arrives. For each material symptom or time fact, return a status of `present`, `absent`, or `unknown`, the **exact words** and time span that support it, the speaker, and whether the speaker observed it, repeated someone else's report, answered a prompt, speculated, or corrected an earlier statement. `Present` means **reported/observed in this call**, never medically confirmed. If the audio is not supplied, say `transcript_only`; do not claim to have heard or verified the audio.

The rules below are **hard product constraints on how to represent evidence**. The papers support the problems these constraints address; most papers do **not** validate these exact software rules or an alert threshold. Where the evidence supports only caution, the hard rule is to preserve uncertainty, not to guess. An optional downstream probability may be computed separately from accepted facts, but it must never turn an uncertain transcript span into an affirmed patient fact.

## A. Attribute every claim to its real source

1. **Use the patient as the subject.** Before recording a symptom, establish that the speaker means this patient and this episode. “My father had a stroke last year,” a dispatcher reading a prompt, and background conversation about another person do not establish a current patient symptom. A family history is history, not the patient's current finding. [E3, E4]

2. **Keep speech acts separate.** A dispatcher's “Is his face drooping?” is a question, not a positive finding. “It might be a stroke,” “could his arm be weak?”, and a hypothetical example do not affirm a deficit. Record the patient's or witness's answer, if any. An unambiguous “yes, his face is drooping now” may establish a *reported* finding even though the answer was prompted; mark it `prompted`. [E3, E4, E7]

3. **Require a traceable source span.** Every asserted symptom, denial, correction, and time must have an exact quoted transcript span, transcript version/turn, and speaker attribution. Include a call timestamp when the input actually supplies one; otherwise mark timestamp `unknown`. If you cannot point to the words, do not add the fact. Do not paraphrase a quote as if it were verbatim. [E3, E4]

4. **Separate direct observation from hearsay.** Preserve “I see her mouth droop,” “the neighbor says it drooped,” and “I think it drooped” as different kinds of evidence. Do not promote hearsay or speculation to firsthand observation. Do not infer that the patient personally confirmed a symptom when a bystander said it. [E3, E4]

5. **Preserve the caller's ordinary language.** People may say “can't get the words out,” “the cup keeps slipping,” or “something is wrong” without using the word “stroke” or a clinical term. Store the actual observation first. Map it to a symptom concept only if the described behavior supports that concept; do not infer arm weakness from an unexplained dropped cup. The absence of the word “stroke” has no negative meaning. [E1, E2]

## B. Never repair missing or unreliable speech by guessing

6. **A dropped connection does not contain a statement.** If the call disconnects, the stream has a gap, a phrase is cut off, or the patient/caller stops responding, treat the missing words and any unanswered question as `unknown`. Do not complete a sentence from context or attribute a later disconnected sound to the caller. If contact resumes, treat the later audio as a new segment with a newly established speaker. [E5, E6]

7. **Noise and overlap can invalidate the affected fact.** If a siren, television, cross-talk, clipping, static, or simultaneous speech obscures the word that changes the clinical meaning, the affected fact is `unknown` until someone clearly repeats it or a dispatcher verifies the audio. Examples: “can” versus “can't,” “has” versus “hasn't,” left versus right, and the date/time. Clear, independent statements elsewhere in the call remain usable. The presence of some noise does not erase the whole call. [E5, E6]

8. **Do not infer speaker from sound alone when identity matters.** An unidentified voice, a third party taking the phone, a recording playing in the room, and a caller on speakerphone require separate attribution. If the speaker cannot be established, mark the source `unclear` and withhold any patient-specific affirmation dependent on that identity. [E3, E4, E5]

9. **A transcript is a hypothesis about audio.** An ASR transcript may omit or alter negation, names, times, or symptoms. If the application provides competing ASR versions, preserve the competing readings. Do not pick one because it seems clinically more likely. A numeric ASR confidence is not a clinically validated cutoff; use audio review or direct repetition when a critical word is contested. If audio is unavailable, report `transcript_only` and the unresolved ambiguity. [E5, E6]

10. **Do not treat an accent, language switch, or impaired speech as proof of disease or unreliability.** A transcript error is a property of the transcription process, not the caller. Preserve the original wording/language when possible, identify what is unclear, and seek a repeat or qualified interpretation through the dispatch workflow. Never convert an ASR failure into a negative symptom or a speech-deficit diagnosis. [E5, E6]

11. **Do not diagnose from nonverbal sound.** A thud, groan, silence, crying, or unusual voice quality alone does not establish a fall, loss of consciousness, aphasia, or stroke. Record an audible observation as such only if the actual audio was available and the event is audible. New speech change requires a source for its change from baseline; a caller's explicit comparison or verified follow-up is preferable to a model's impression. [E1, E5]

## C. Interpret affirmation, denial, and uncertainty locally

12. **Negation applies to the symptom actually denied.** “No facial droop, but her speech is strange” means face `absent` as reported and speech potentially `present` after its own evidence check. Do not let “no” negate the whole sentence or other symptoms. “He doesn't have a headache” does not deny weakness. [E3, E4]

13. **Do not mistake grammar for affirmation.** Handle “not weak,” “can't move,” “no longer can lift,” and “not *just* dizzy” according to the whole utterance. If the polarity of a critical clause is genuinely ambiguous, use `unknown` and request clarification; keyword matching alone is insufficient. [E3, E4, E5]

14. **Silence is not a denial.** A symptom not mentioned, a question not answered, a refusal to answer, and “I don't know” are `unknown`, not `absent`. Mark `absent` only when a person clearly denies that specific current finding for this patient; retain who denied it and when. [E3, E4]

15. **Uncertainty stays uncertainty.** “Maybe,” “I think,” “it looked like,” “I'm not sure,” an unclear ASR alternative, and an unidentified speaker do not become confirmed through repetition or model confidence. Store the tentative statement as `unknown` or `suspected` metadata with its quote; ask a neutral follow-up. A probability estimate, if one exists elsewhere, must not silently change the assertion label. [E3, E4, E5]

16. **Store distinct symptom concepts separately.** Speech that is slurred, words that cannot be found, inability to understand, confusion, reduced consciousness, dizziness, difficulty walking, vision loss, and double vision are not interchangeable. If the caller's words do not distinguish them, keep the broader observation and mark the specific concept `unknown`. [E1, E2, E7]

17. **Track whether a change is new.** “Her arm has been weak since last year” does not describe a newly changed arm. “She is always hard to understand” does not establish new speech trouble. If baseline or newness is unspecified, do not invent a sudden onset; record `newness=unknown`. A newly worsened chronic symptom needs its own explicit evidence. [E3, E4, E7]

18. **Do not turn first discovery into a sudden event.** “I found him on the floor at eight” establishes a discovery time and observation, not the moment he fell, developed a deficit, or was last well. “It happened suddenly” is supported only if a witness describes a sudden change or directly observed its start. [E8, E9]

## D. Keep the conversation's changing account intact

19. **Later corrections revise, but do not erase, earlier words.** If the same source says “his speech is slurred” and later “I was hearing the radio; his speech is normal,” retain both turns and the correction link. Use the corrected account for the current symptom status if its target and meaning are clear. If the correction is itself inaudible or ambiguous, leave the symptom disputed. [E3, E4]

20. **Conflicts remain visible.** If two people give incompatible accounts, or the same person cannot resolve one, do not silently select the latest, loudest, most repeated, or most likely version. Mark the affected fact `unknown/conflict` and show both quotes. A clearly identified firsthand correction can resolve a prior report; preserve the audit trail. [E3, E4]

21. **Repetition is not independent confirmation.** One caller repeating a claim, a dispatcher paraphrasing it, and an ASR alternative of the same sound are one underlying observation. Do not count them as multiple witnesses or multiple distinct symptoms. [E1, E3]

22. **Preserve changes over time.** If a reported deficit resolves, document when and by whom it was said to resolve. Do not rewrite the earlier symptom as never having occurred. A resolved focal episode can still matter clinically; the model must not label it “no concern” merely because symptoms stopped. [E10]

## E. Record the time facts without inventing a clock

23. **Keep four time concepts separate:** last known well (the last time someone knew the patient was at their usual baseline), first observed symptom, time found abnormal, and call time. Store the original time phrase and its source. Only assign a precise timestamp when date, clock time, time zone, and reference day are actually established; otherwise retain an interval or `unknown`. [E8, E9]

24. **Do not manufacture last known well.** “Woke up with symptoms at 7,” “found on the floor at 8,” or “called at 8:05” is not evidence that the patient was normal at those times. A bedtime is last-known-well only if someone actually says the patient was at baseline then. If no one can say when the patient was last normal, output `last_known_well=unknown` and ask who last saw them normal and when. [E8, E9]

25. **Treat ambiguous relative time literally.** “About an hour ago,” “yesterday evening,” and “around nine” must retain their approximate/relative character and the call date used to interpret them. Do not silently choose AM/PM, cross a midnight boundary, or claim minute precision. If two reported times conflict, preserve both and ask for clarification. [E8, E9]

26. **Time missing does not negate the symptom.** An unknown last-known-well time must be shown as missing; it must not cause an accepted report of a new symptom to disappear or imply a treatment window. The hospital/EMS team determines eligibility under its clinical protocol. [E8, E9]

## F. Handle competing explanations and the output boundary

27. **A possible mimic is a parallel claim.** A caller's suggestion of intoxication, migraine, seizure, infection, or low blood sugar is not proof of that diagnosis or proof stroke is absent. Record the exact source and whether a measurement exists. “He is diabetic” and “his glucose was measured at 45” are different facts; neither should be invented from the other. [E11, E12]

28. **Vague symptoms deserve clarification without automatic conversion.** Dizziness, headache, nausea, confusion, falling, or “acting strange” may appear in stroke calls and in other conditions. Record them as described; do not convert an isolated vague report into a confirmed focal deficit. Equally, lack of a face/arm/speech report does not rule out stroke. A neutral question can seek specific observations of face, limb, language/speech, vision, and balance. [E1, E2, E7, E12]

29. **Never present an extracted fact as a diagnosis or clinical probability.** Use “caller reports…,” “bystander observed…,” “transcript suggests but audio is unclear…,” or “not established.” Do not state “the patient has a stroke,” “stroke ruled out,” a treatment eligibility window, or a numerical stroke probability from these rules. A later scoring model needs separate validation on emergency calls. [E7, E12]

30. **A model must not send or approve a hospital pre-alert.** Its output is a cited evidence record and unresolved questions for a dispatcher. Only a dispatcher may review a proposed message and explicitly approve any outbound action through the application. Keep the patient's reported facts, uncertain facts, suspected mimics, and LKW status visibly distinct in that review. Research on EMS pre-notification does not validate autonomous hospital alerts from raw calls. [E9, E13]

## Minimal output for each evaluated call

Return machine-readable fields in the application's schema, or an equivalent structure. Never fabricate a missing field value:

```text
call_id, evidence_version, transcript_version, audio_available, audio_quality,
evidence_items: [{concept, status: present|absent|unknown, patient_or_other,
  source_role, source_id, speech_act, prompted_or_spontaneous,
  confirmed_or_tentative, current_or_historical, newness,
  exact_quote, transcript_turn, call_start_ms, call_end_ms,
  audio_verified_by, competing_transcripts, correction_of}],
time_facts: {last_known_well, first_symptom, discovery, call_time,
  raw_phrase, source, precision, timezone, unresolved_ambiguity},
conflicts, gaps_or_audio_problems, possible_mimic_reports,
questions_to_clarify, dispatcher_review_required: true
```

If no reliable audio is available, `audio_verified_by=none`. If the entire relevant statement was cut off or masked, its asserted content is `unknown`; retain the reason. Absence of accepted evidence is **not** evidence that stroke is absent.

## Worked call examples

| Conversation fragment | Correct extraction | Do not do this |
|---|---|---|
| Dispatcher: “Is his arm weak?” Caller: “No, he moves both normally.” | Arm weakness `absent` **as reported by caller**, prompted; quote the answer. | Count the dispatcher's question as arm weakness. |
| Caller: “He can—” **connection drops** | Ability/weakness `unknown`; record dropout and seek repeat. | Complete “can move” or “can't move” from context. |
| ASR A: “she can lift it”; ASR B: “she can't lift it”; background siren | Arm ability `unknown` pending audio check or repeat. | Pick the reading that appears more likely. |
| Caller: “Her words were mixed up just now; I saw it.” | Reported new language/speech change, exact quote and source; subtype only if established. | Diagnose aphasia from the phrase alone. |
| Caller: “He felt dizzy”; no answer about walking, vision, weakness, or speech | Dizziness `present` as reported; other concepts `unknown`; ask about them. | Invent balance loss or rule out stroke. |
| Caller: “I saw her normal at 6. I found her on the floor at 8.” | LKW reported as 6; discovery at 8; fall time `unknown`. | Write onset/LKW as 8. |
| Caller: “He has diabetes, maybe sugar is low”; no measurement | Diabetes history reported; low glucose `suspected`, unmeasured. | Report confirmed hypoglycemia or dismiss another new symptom. |
| Caller: “His face was drooping.” Later: “Sorry, that was the shadow; his face looks normal.” | Preserve both quotes; link correction; current reported droop `absent` if clear. | Keep only the initial positive or delete its history. |

## Evidence notes and limits

**Emergency-call evidence:** Actual caller wording differs from textbook terminology [E1, E2]. Dispatcher accuracy varies across systems, and non-FAST symptoms can be both real stroke presentations and common mimics [E7, E12]. These studies do not establish a LastWell alert threshold.

**NLP/ASR evidence:** Assertion detection must consider negation, experiencer, uncertainty, and time [E3, E4]. Medical or patient-speech ASR error differs across speakers and can affect meaning [E5, E6]. Much of this evidence comes from clinical records, home care, or dictated speech, **not emergency call audio**. The exact dropout, attribution, and conflict handling rules above are conservative engineering constraints, not experimentally validated stroke-call algorithms.

**Time and workflow evidence:** Last-known-well documentation is important and often incomplete in EMS records [E8, E9]. Pre-notification evidence largely concerns ambulance/EMS notifications rather than automatic voice alerts from a dispatcher call [E13]. A real deployment requires local clinical governance, call-data validation, and dispatcher control. No numeric ASR threshold, mention count, symptom score, risk percentage, or treatment cutoff is specified here.

