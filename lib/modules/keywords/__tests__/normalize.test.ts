import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MAX_KEYWORD_LENGTH, normalizeKeywordList, normalizeKeywordValue } from "../normalize";

describe("normalizeKeywordList", () => {
  it("splits on comma, trims, and lowercases", () => {
    const { values } = normalizeKeywordList("Deal, BUY, Link");
    assert.deepEqual(values, ["deal", "buy", "link"]);
  });

  it("splits on newline as well as comma, including mixed separators", () => {
    const { values } = normalizeKeywordList("deal, buy\nlink,sale\n\ndiscount");
    assert.deepEqual(values, ["deal", "buy", "link", "sale", "discount"]);
  });

  it("dedupes case-insensitively after normalization", () => {
    const { values } = normalizeKeywordList("Deal, deal, DEAL, deal");
    assert.deepEqual(values, ["deal"]);
  });

  it("drops empty entries produced by stray separators", () => {
    const { values } = normalizeKeywordList("deal,,  ,\n\nbuy");
    assert.deepEqual(values, ["deal", "buy"]);
  });

  it("drops entries longer than MAX_KEYWORD_LENGTH and reports them separately", () => {
    const tooLong = "x".repeat(MAX_KEYWORD_LENGTH + 1);
    const { values, rejectedTooLong } = normalizeKeywordList(`deal,${tooLong}`);
    assert.deepEqual(values, ["deal"]);
    assert.deepEqual(rejectedTooLong, [tooLong]);
  });

  it("accepts an entry exactly at MAX_KEYWORD_LENGTH", () => {
    const exact = "x".repeat(MAX_KEYWORD_LENGTH);
    const { values, rejectedTooLong } = normalizeKeywordList(exact);
    assert.deepEqual(values, [exact]);
    assert.deepEqual(rejectedTooLong, []);
  });

  it("returns empty arrays for blank input", () => {
    const { values, rejectedTooLong } = normalizeKeywordList("   \n\n  ,, ");
    assert.deepEqual(values, []);
    assert.deepEqual(rejectedTooLong, []);
  });
});

describe("normalizeKeywordValue", () => {
  it("trims and lowercases a single value", () => {
    assert.equal(normalizeKeywordValue("  ClickTheLink  "), "clickthelink");
  });

  it("returns an empty string for whitespace-only input", () => {
    assert.equal(normalizeKeywordValue("   "), "");
  });
});
