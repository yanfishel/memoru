import { describe, expect, it } from "vitest";
import { sentenceTerm, sentenceTypeByRule } from "../../../scripts/etl/normalize/sentence";

describe("sentenceTypeByRule", () => {
  it.each([
    ["ВМН (расстрел)", "vmn"],
    ["Расстрелять", "vmn"],
    ["10 лет ИТЛ", "itl"],
    ["5 лет исправительно-трудовых лагерей", "itl"],
    ["высылка в Казахстан", "vys"],
    ["5 лет ссылки", "vys"],
    ["3 года лишения свободы", "zak"],
    ["1 год исправительно-трудовых работ", "pr"],
    ["репрессир. по национ. призн.", null],
    ["освобожден", null],
  ])("%j -> %j", (raw, expected) => {
    expect(sentenceTypeByRule(raw)).toBe(expected);
  });

  it("does not treat words containing 'вмн' letters as execution", () => {
    expect(sentenceTypeByRule("главмный")).toBeNull();
  });
});

describe("sentenceTerm", () => {
  it.each([
    ["10 лет ИТЛ", { years: 10, months: null }],
    ["3 года лишения свободы", { years: 3, months: null }],
    ["1 год исправительно-трудовых работ", { years: 1, months: null }],
    ["2 г. 6 мес. ИТЛ", { years: 2, months: 6 }],
    ["6 месяцев принудительных работ", { years: null, months: 6 }],
    ["ВМН (расстрел)", { years: null, months: null }],
    ["ИТЛ, осужден в 1938 г.", { years: null, months: null }],
    // "место" contains "мес" but is not a month count; must not match.
    ["12.10.1923 место ссылки заменено", { years: null, months: null }],
    // Above the plausible range (a real max in the data was 1923 months from
    // matching "место"); out-of-range months must be dropped like years are.
    ["48 мес. ИТЛ", { years: null, months: 48 }],
    ["360 мес. ИТЛ", { years: null, months: null }],
  ])("%j -> %j", (raw, expected) => {
    expect(sentenceTerm(raw)).toEqual(expected);
  });
});
