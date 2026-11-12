import assert from "node:assert/strict";
import { speechReviewPassed, type SpeechReview } from "./speech-fidelity";
import { speechReviewFailure } from "./speech-diagnostics";

const accepted: SpeechReview = {
  transcript: "Take prednisone for five days.", faithful: true, uncertain: false, discrepancies: [],
  notes: "The drug name, quantity and instruction were clearly heard.",
};
const script = "Take prednisone for 5 days.";
assert.match(speechReviewFailure({ ...accepted, transcript: "Take prednisone five days." }, script), /Transcript mismatch/);
assert.equal(speechReviewFailure(accepted, script), "");
assert.equal(speechReviewPassed({ ...accepted, transcript: "Days seven ten." }, "Days 7 to 10."), false, "a missing range connector is not a number equivalent");
assert.equal(speechReviewPassed(accepted, script), true, "number-word equivalents are faithful");
assert.equal(speechReviewPassed({ ...accepted, faithful: false }, script), false, "a failure cannot be cleared by an empty discrepancy list");
assert.equal(speechReviewPassed({ ...accepted, uncertain: true }, script), false, "uncertainty overrides contradictory faithful=true");
assert.equal(speechReviewPassed({ ...accepted, transcript: "Take prednisolone for five days." }, script), false, "similar drug names are not speech equivalents");
assert.equal(speechReviewPassed({ ...accepted, transcript: "Take prednisone for nine days." }, script), false, "changed quantities fail despite a claimed pass");
assert.equal(speechReviewPassed({ ...accepted, transcript: "Do not take prednisone for five days." }, script), false, "negation is never normalized away");
assert.equal(speechReviewPassed({ ...accepted, transcript: "Take prednisone." }, script), false, "missing duration fails despite a claimed pass");
assert.equal(speechReviewPassed({ ...accepted, transcript: " " }, script), false, "whitespace-only transcript cannot pass");
assert.equal(speechReviewPassed({ ...accepted, transcript: "Call nine one one. Don't wait." }, "Call 911. Do not wait."), true, "emergency number and contraction rendering are normal speech");
assert.equal(speechReviewPassed({ ...accepted, transcript: "The temperature is one hundred point four degrees Fahrenheit." }, "The temperature is 100.4°F."), true, "temperature unit symbols and spoken decimals agree");
const feverScript = "Call for 100.4°F (38.0°C) or higher for an hour. Do not wait.";
for (const transcript of [
  "Call for 100.4 degrees F, 38.0 degrees C or higher for an hour. Do not wait.",
  "Call for one hundred point four degrees f, thirty eight point zero degrees c or higher for an hour. Don't wait.",
]) assert.equal(speechReviewPassed({ ...accepted, transcript }, feverScript), true, "numeric degrees F/C preserves each exact temperature and condition");
for (const transcript of [
  "Call for 101.4 degrees F, 38.0 degrees C or higher for an hour. Do not wait.",
  "Call for 100.4 degrees C, 38.0 degrees F or higher for an hour. Do not wait.",
  "Call for 100.4 degrees F, 38.0 degrees or higher for an hour. Do not wait.",
  "Call for 100.4 F, 38.0 C or higher for an hour. Do not wait.",
  "Call for 100.4 degrees F, 38.0 degrees C or lower for an hour. Do not wait.",
  "Call for 100.4 degrees F, 38.0 degrees C or higher for two hours. Do not wait.",
  "Call for 100.4 degrees F, 38.0 degrees C or higher for an hour. Do wait.",
]) assert.equal(speechReviewPassed({ ...accepted, transcript }, feverScript), false, "temperature spelling cannot hide changed values, scales, degree markers, conditions, duration or negation");
for (const [transcript, reference] of [
  ["A C T includes C.", "A C T includes Celsius."],
  ["The letter f follows c.", "The letter Fahrenheit follows Celsius."],
  ["Degrees F can be displayed.", "Degrees Fahrenheit can be displayed."],
  ["The value is degrees c.", "The value is degrees Celsius."],
] as const) assert.equal(speechReviewPassed({ ...accepted, transcript }, reference), false, "scale abbreviation equivalence requires numeric temperature context");
assert.equal(speechReviewPassed({ ...accepted, transcript: "R CHOP includes prednisone." }, "R-CHOP includes prednisone."), true);
assert.equal(speechReviewPassed({ ...accepted, transcript: "The ACT regimen." }, "The AC-T regimen."), true);
assert.equal(speechReviewPassed({ ...accepted, transcript: "The R C H O P regimen." }, "The R-CHOP regimen."), true);
assert.equal(speechReviewPassed({ ...accepted, transcript: "The A T regimen." }, "The AC-T regimen."), false);
assert.equal(speechReviewPassed({ ...accepted, transcript: "The AC regimen." }, "The AC-T regimen."), false);
assert.equal(speechReviewPassed({ ...accepted, transcript: "Please act now." }, "Please A C T now."), false);
assert.equal(speechReviewPassed({ ...accepted, transcript: "Call your team tomorrow." }, "Call your team immediately."), false, "altered urgency cannot hide behind faithful=true");
for (const certainty of ["clear", "uncertain"] as const) {
  const contradiction: SpeechReview = {
    ...accepted,
    discrepancies: [{ expected: "prednisone", heard: "prednisolone", reason: "Different medicine was spoken.", approximateSeconds: 2, certainty }],
  };
  assert.equal(speechReviewPassed(contradiction, script), false, `${certainty} discrepancy overrides a contradictory faithful=true flag`);
}

const invalid: unknown[] = [
  null, undefined, true, [], {},
  { ...accepted, transcript: "" },
  { ...accepted, transcript: " \n\t " },
  { ...accepted, faithful: "true" },
  { ...accepted, uncertain: undefined },
  { ...accepted, uncertain: "false" },
  { ...accepted, discrepancies: undefined },
  { ...accepted, discrepancies: null },
  { ...accepted, notes: undefined },
  { ...accepted, approved: true },
  ...[-1, NaN, Infinity].map((approximateSeconds) => ({ ...accepted,
    discrepancies: [{ expected: "five", heard: "nine", reason: "Changed quantity.", approximateSeconds, certainty: "clear" }],
  })),
  { ...accepted, discrepancies: [{ expected: "prednisone", heard: "prednisolone", reason: "Drug mismatch.", approximateSeconds: 1, certainty: "probably" }] },
];
for (const report of invalid) {
  assert.equal(speechReviewPassed(report as SpeechReview, script), false, "malformed/unexpected cached reports cannot pass based on truthiness");
}

console.log("Speech-fidelity tests passed: script binding, drug/quantity/negation fidelity, spoken equivalents, schema failures, uncertainty and contradictory success flags.");
