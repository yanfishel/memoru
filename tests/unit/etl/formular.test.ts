import { describe, expect, it } from "vitest";
import { parseFormular } from "../../../scripts/etl/parse/formular";

const SVERKOT = `{{Шаблон:Формуляр
|дата рождения=1903
|место рождения=Польша
|пол=мужчина
|приговор 1=ВМН (расстрел)
|расстрел=17.10.1938
|источники данных=Книга памяти Республики Башкортостан
}}

[[Категория:Все мартирологи]]
[[Категория:Книга памяти Республики Башкортостан]]
[[Категория:Башкирия]]

==Биография==`;

describe("parseFormular", () => {
  it("extracts params and categories", () => {
    const result = parseFormular(SVERKOT);
    expect(result).toEqual({
      params: {
        "дата рождения": "1903",
        "место рождения": "Польша",
        "пол": "мужчина",
        "приговор 1": "ВМН (расстрел)",
        "расстрел": "17.10.1938",
        "источники данных": "Книга памяти Республики Башкортостан",
      },
      categories: ["Все мартирологи", "Книга памяти Республики Башкортостан", "Башкирия"],
    });
  });

  it("returns null without a Формуляр template", () => {
    expect(parseFormular("Просто текст [[Категория:Списки]]")).toBeNull();
  });

  it("accepts the template without namespace prefix and keeps pipes inside links and nested templates", () => {
    const text = `{{Формуляр
|источники данных=[[Книга памяти|Книга]] и {{ref|1}}
|пол=женщина
}}`;
    expect(parseFormular(text)?.params).toEqual({
      "источники данных": "[[Книга памяти|Книга]] и {{ref|1}}",
      "пол": "женщина",
    });
  });

  it("omits empty values, trims, and lets the last duplicate win", () => {
    const text = `{{Шаблон:Формуляр
| пол =  мужчина
|национальность=
|пол=женщина
}}`;
    expect(parseFormular(text)?.params).toEqual({ "пол": "женщина" });
  });

  it("strips category sort keys", () => {
    const text = `{{Формуляр|пол=мужчина}} [[Категория:Башкирия|Сверкот]]`;
    expect(parseFormular(text)?.categories).toEqual(["Башкирия"]);
  });

  it("keeps values that contain '=' after the first one", () => {
    const text = `{{Формуляр|архивное дело=Фонд=Р-467}}`;
    expect(parseFormular(text)?.params).toEqual({ "архивное дело": "Фонд=Р-467" });
  });

  it("handles lowercase категория in category links", () => {
    const text = `{{Формуляр|пол=мужчина}} [[категория:Башкирия]]`;
    expect(parseFormular(text)?.categories).toEqual(["Башкирия"]);
  });

  it("returns params from unterminated template", () => {
    const text = `{{Формуляр
|дата рождения=1903
|место рождения=Польша`;
    expect(parseFormular(text)?.params).toEqual({
      "дата рождения": "1903",
      "место рождения": "Польша",
    });
  });

  it("drops positional parameters without an equals sign", () => {
    const text = `{{Формуляр|какой-то текст|пол=мужчина}}`;
    expect(parseFormular(text)?.params).toEqual({ "пол": "мужчина" });
  });

  it("deletes a key when a later empty value is encountered", () => {
    const text = `{{Формуляр|пол=мужчина|пол=}}`;
    expect(parseFormular(text)?.params).toEqual({});
  });
});
