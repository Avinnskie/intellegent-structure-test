import assert from "node:assert/strict";
import test from "node:test";
import {
  allQuestions,
  canSubmitQuestionResponse,
  getQuestion,
  questionsBySubtest,
} from "../../lib/ist-questions.ts";
import { subtests, TOTAL_QUESTION_COUNT } from "../../lib/ist-subtests.ts";

test("question bank contains all 176 continuous IST items", () => {
  const globalNumbers = allQuestions.map((question) => question.globalNumber);

  assert.equal(TOTAL_QUESTION_COUNT, 176);
  assert.equal(allQuestions.length, 176);
  assert.deepEqual(
    globalNumbers,
    Array.from({ length: 176 }, (_, index) => index + 1),
  );
  assert.equal(new Set(globalNumbers).size, 176);
});

test("each subtest bank matches its local count and global boundary", () => {
  for (const subtest of subtests) {
    const questions = questionsBySubtest[subtest.code];

    assert.equal(questions.length, subtest.itemCount);
    assert.equal(questions[0]?.globalNumber, subtest.startItem);
    assert.equal(questions.at(-1)?.globalNumber, subtest.startItem + subtest.itemCount - 1);
  }
});

test("question kinds match the participant response controls", () => {
  assert.equal(allQuestions.filter((question) => question.kind === "choice").length, 120);
  assert.equal(allQuestions.filter((question) => question.kind === "short-text").length, 16);
  assert.equal(allQuestions.filter((question) => question.kind === "numeric").length, 40);
});

test("question lookup rejects invalid local boundaries", () => {
  assert.equal(getQuestion("GE", 1)?.globalNumber, 61);
  assert.equal(getQuestion("GE", 16)?.globalNumber, 76);
  assert.equal(getQuestion("GE", 0), null);
  assert.equal(getQuestion("GE", 17), null);
  assert.equal(getQuestion("SE", 1.5), null);
});

test("numeric questions only accept complete numeric responses", () => {
  const question = getQuestion("RA", 1);
  assert.ok(question);
  assert.equal(canSubmitQuestionResponse(question, "12"), true);
  assert.equal(canSubmitQuestionResponse(question, "-3,5"), true);
  assert.equal(canSubmitQuestionResponse(question, "dua belas"), false);
  assert.equal(canSubmitQuestionResponse(question, ""), false);
});
