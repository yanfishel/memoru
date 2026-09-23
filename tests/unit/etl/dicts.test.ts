import { describe, expect, it } from "vitest";
import {
  DICT_FIELDS,
  UNKNOWN,
  UNRECOGNIZED,
  loadAllDictionaries,
  loadDictionary,
  parseDictionaryCsv,
} from "../../../scripts/etl/normalize/dicts";

const CSV = `raw_value,code,method,reviewed
Мужчина,m,manual,true
"женщина",f,manual,true
муж.,m,llm,false
`;

describe("parseDictionaryCsv", () => {
  const dict = parseDictionaryCsv("sex", CSV);

  it("looks up by normalized key", () => {
    expect(dict.lookup("мужчина")).toBe("m");
    expect(dict.lookup(" ЖЕНЩИНА ")).toBe("f");
    expect(dict.lookup("Муж")).toBe("m");
  });

  it("distinguishes unknown from unrecognized", () => {
    expect(dict.lookup(undefined)).toBe(UNKNOWN);
    expect(dict.lookup("   ")).toBe(UNKNOWN);
    expect(dict.lookup("иное")).toBe(UNRECOGNIZED);
  });

  it("exposes entries and size", () => {
    expect(dict.size).toBe(3);
    expect(dict.has("МУЖЧИНА")).toBe(true);
    expect(dict.entries()[2]).toEqual({ rawValue: "муж.", code: "m", method: "llm", reviewed: false });
  });

  it("allows duplicates with the same code", () => {
    expect(parseDictionaryCsv("sex", "raw_value,code,method,reviewed\nм,m,manual,true\nМ,m,manual,true\n").size).toBe(1);
  });

  it("rejects conflicting codes for one key", () => {
    expect(() => parseDictionaryCsv("sex", "raw_value,code,method,reviewed\nм,m,manual,true\nМ,f,manual,true\n")).toThrow(
      'sex: conflicting codes for "м": m, f',
    );
  });

  it("rejects a bad header and unknown methods", () => {
    expect(() => parseDictionaryCsv("sex", "value,code\nм,m\n")).toThrow("sex: expected header raw_value,code,method,reviewed");
    expect(() => parseDictionaryCsv("sex", "raw_value,code,method,reviewed\nм,m,guess,true\n")).toThrow(
      'sex: unknown method "guess"',
    );
  });

  it("rejects a data row with too few columns", () => {
    expect(() =>
      parseDictionaryCsv("sex", "raw_value,code,method,reviewed\nм,m,manual,true\nж,f,manual\n"),
    ).toThrow("sex: row 2 has 3 columns, expected 4");
  });

  it("rejects a data row with too many columns", () => {
    expect(() =>
      parseDictionaryCsv(
        "sex",
        "raw_value,code,method,reviewed\nм,m,manual,true\nж,f,manual,true\nвне,x,manual,true,extra\n",
      ),
    ).toThrow("sex: row 3 has 5 columns, expected 4");
  });
});

describe("loading from disk", () => {
  it("returns an empty dictionary for a missing file", () => {
    const dict = loadDictionary("data/dicts", "does_not_exist");
    expect(dict.size).toBe(0);
    expect(dict.lookup("x")).toBe(UNRECOGNIZED);
  });

  it("loads every dictionary field from data/dicts", () => {
    const dicts = loadAllDictionaries("data/dicts");
    expect(Object.keys(dicts).sort()).toEqual([...DICT_FIELDS].sort());
    expect(dicts.sex.lookup("женщина")).toBe("f");
    expect(dicts.source_region.lookup("Челябинская обл.")).toBe("RU-CHE");
  });
});
