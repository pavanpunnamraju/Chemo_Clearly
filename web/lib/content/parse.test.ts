// Regression test for the two extractField regex bugs found in the Alert/Quote
// content rounds (label-prefix collision, `---` separator leak) — see
// docs/references/handoff-goal11.md. No framework; run directly with tsx.
// Run: npm run test:parse

import assert from "node:assert/strict";
import { extractField, parseDrugNames } from "./parse";

// call_team_if must not be eaten by a `call_team` prefix match.
const block1 = "**call_team_if:** vomiting >24h\n**call_team:** call your team";
assert.equal(extractField(block1, "call_team_if"), "vomiting >24h");
assert.equal(extractField(block1, "call_team"), "call your team");

// A trailing `---` section separator must not leak into the last field.
const block2 = "**plain:** some text\n---\n";
assert.equal(extractField(block2, "plain"), "some text");

// drug_names: backtick-quoted proper nouns (mixed case, spaces, hyphens) —
// wider charset than parseTags' lowercase-slug tags.
const block3 = "**drug_names:** `Rituximab`, `Cyclophosphamide`, `Hydroxydaunorubicin`, `Vincristine`, `Prednisone`";
assert.deepEqual(parseDrugNames(block3), [
  "Rituximab",
  "Cyclophosphamide",
  "Hydroxydaunorubicin",
  "Vincristine",
  "Prednisone",
]);
assert.deepEqual(parseDrugNames("**plain:** no drug_names field here"), []);

console.log("parse.test: ok");
