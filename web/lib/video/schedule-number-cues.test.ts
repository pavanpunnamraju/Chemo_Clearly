import assert from "node:assert/strict";
import { scheduleCuesFromWords, scheduleNumberState } from "./schedule-number-cues";
const words = (text: string) => text.split(" ").map((text, index) => ({ text, startSeconds: 10 + index * .3, endSeconds: 10.2 + index * .3 }));
for (const phrase of ["days 6-10", "days 6–10", "Days six through ten", "days 6 to 10"]) {
  const cue = scheduleCuesFromWords(words(phrase), "test", 20)[0]!;
  assert.deepEqual(cue.numbers, [6, 7, 8, 9, 10]);
  assert.equal(cue.startSeconds, words(phrase).at(-1)!.startSeconds);
}
assert.deepEqual(scheduleCuesFromWords(words("Day 1"), "test", 20)[0]!.numbers, [1]);
assert.deepEqual(scheduleCuesFromWords(words("Weeks two through three"), "test", 20)[0]!.numbers, [2, 3]);
assert.deepEqual(scheduleCuesFromWords(words("days eleven through twenty-one"), "test", 20)[0]!.numbers, Array.from({length:11},(_,i)=>i+11));
for (const text of ["a 3-week cycle", "5 days of pills", "day 1.5", "days 10–6", "days 0–4", "weeks 53–60", "days 2 through", "day. 1"]) {
  assert.deepEqual(scheduleCuesFromWords(words(text), "test", 20), [], text);
}
const cues = [{unit:"day" as const,numbers:[1],startSeconds:2,endSeconds:5,sourceRef:"a",text:"Day 1"},
  {unit:"day" as const,numbers:[6,7,8,9,10],startSeconds:5,endSeconds:8,sourceRef:"b",text:"Days 6–10"}];
assert.deepEqual(scheduleNumberState(cues, 1).numbers, []);
assert.deepEqual(scheduleNumberState(cues, 4).numbers, [{value:1,opacity:1}]);
const fading = scheduleNumberState(cues, 5.2).numbers;
assert.ok(fading.every(n=>Math.abs(n.opacity-.5)<1e-8));
assert.deepEqual(scheduleNumberState(cues, 5.5).numbers.map(n=>n.value), [6,7,8,9,10]);
assert.deepEqual(scheduleNumberState(cues, 5, true).numbers, cues[1]!.numbers.map(value=>({value,opacity:1})));
assert.deepEqual(scheduleNumberState(cues, 9).numbers, []);
const mixedUnits = [cues[0]!, {...cues[1]!,unit:"week" as const,numbers:[2,3]}];
assert.ok(Math.abs(scheduleNumberState(mixedUnits,4.8).numbers[0]!.opacity-.5)<1e-8);
assert.equal(scheduleNumberState(mixedUnits,5.2).unit,"week");
assert.deepEqual(scheduleNumberState(mixedUnits,5.2).numbers.map(n=>n.value),[2,3]);
assert.deepEqual(scheduleNumberState(cues, 3), scheduleNumberState(cues, 3), "seeking is deterministic");
console.log("Schedule mention binding and fade checks passed.");
