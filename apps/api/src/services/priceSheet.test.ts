import { describe, expect, it } from "vitest";
import { ProductCategory } from "@buildora/shared";
import { parseCsv, parsePriceSheet, serializePriceSheet } from "./priceSheet";

/**
 * CSV is a format that looks trivial and is not. Every test below is a case a
 * naive `split(",")` gets wrong, and each one would show up as a real price
 * being read as a different number — or a whole row silently vanishing from the
 * sheet the estimator prices against.
 *
 * The parsing functions are pure and take their input as a string, so none of
 * this needs a database.
 */

/** A minimal valid file, built from the columns the importer requires. */
function sheet(...rows: string[]): string {
  return ["category,itemLabel,unit,priceBdt,sourceName,sourceUrl,effectiveFrom", ...rows].join(
    "\n"
  );
}

describe("parseCsv", () => {
  it("keeps a quoted comma inside one field", () => {
    // "OPC cement, 50kg bag" is a real label. Split naively it becomes two
    // columns and every field after it shifts left — the unit column would end
    // up holding "50kg bag" and the price would be read from the wrong cell.
    const rows = parseCsv('a,"one, two",c');
    expect(rows).toEqual([["a", "one, two", "c"]]);
  });

  it("unescapes a doubled quote", () => {
    const rows = parseCsv('x,"3"" pipe",y');
    expect(rows).toEqual([["x", '3" pipe', "y"]]);
  });

  it("treats CRLF as one line break", () => {
    // Excel on Windows writes \r\n. Counted as two breaks it produces a blank
    // row between every real one.
    const rows = parseCsv("a,b\r\nc,d\r\n");
    expect(rows).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("strips the byte-order mark Excel writes", () => {
    // Left in place the BOM becomes part of the first header name, so
    // "category" stops matching and the whole file is rejected for a missing
    // column that is plainly there.
    const rows = parseCsv("﻿category,itemLabel");
    expect(rows[0]![0]).toBe("category");
  });

  it("keeps a newline inside a quoted field", () => {
    const rows = parseCsv('a,"line one\nline two"');
    expect(rows).toEqual([["a", "line one\nline two"]]);
  });
});

describe("parsePriceSheet", () => {
  it("reads a well-formed row", () => {
    const { rows, errors } = parsePriceSheet(
      sheet("CEMENT,OPC cement 50kg bag,bag,540,TCB bulletin,,2026-08-30")
    );

    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      category: ProductCategory.CEMENT,
      itemLabel: "OPC cement 50kg bag",
      unit: "bag",
      priceBdt: 540,
      sourceName: "TCB bulletin",
    });
    expect(rows[0]!.effectiveFrom.toISOString().slice(0, 10)).toBe("2026-08-30");
  });

  it("accepts columns in any order", () => {
    // An admin who drags a column in Excel has not done anything wrong, so
    // cells are addressed by header name rather than by position.
    const { rows, errors } = parsePriceSheet(
      ["priceBdt,unit,category,itemLabel", "91.5,kg,STEEL,MS deformed bar 60 grade"].join("\n")
    );

    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({ category: ProductCategory.STEEL, priceBdt: 91.5, unit: "kg" });
  });

  it("reads a thousands separator inside a quoted price", () => {
    const { rows, errors } = parsePriceSheet(sheet('BRICKS,First class brick,each,"1,250"'));
    expect(errors).toEqual([]);
    expect(rows[0]!.priceBdt).toBe(1250);
  });

  it("defaults effectiveFrom to now when the column is blank", () => {
    const { rows } = parsePriceSheet(sheet("PAINT,Plastic paint interior,litre,420,,,"));
    expect(rows[0]!.effectiveFrom.getTime()).toBeCloseTo(Date.now(), -4);
  });

  it("rejects a header missing a required column", () => {
    const { rows, errors } = parsePriceSheet(
      ["category,itemLabel,unit", "CEMENT,OPC cement,bag"].join("\n")
    );
    expect(rows).toEqual([]);
    expect(errors[0]!.message).toContain("priceBdt");
  });

  it("rejects an unknown category by name", () => {
    const { errors } = parsePriceSheet(sheet("CONCRETE,Ready mix,cft,9000"));
    expect(errors).toHaveLength(1);
    expect(errors[0]!.line).toBe(2);
    expect(errors[0]!.message).toContain("CONCRETE");
  });

  it("rejects a price that isn't a number, naming the line", () => {
    const { errors } = parsePriceSheet(
      sheet("CEMENT,OPC cement,bag,540", "STEEL,MS bar,kg,ninety")
    );
    expect(errors).toHaveLength(1);
    // Line 3: the header is line 1, the good cement row is line 2.
    expect(errors[0]!.line).toBe(3);
  });

  it("rejects a future date", () => {
    // A future-dated row would sort ahead of every real price and read as
    // fresher than anything — the one direction the staleness ladder can't
    // recover from.
    const nextYear = new Date(Date.now() + 400 * 86_400_000).toISOString().slice(0, 10);
    const { errors } = parsePriceSheet(sheet(`CEMENT,OPC cement,bag,540,,,${nextYear}`));
    expect(errors[0]!.message).toContain("future");
  });

  it("rejects the same item twice in one file", () => {
    // Two rows for one item leaves no defensible answer to "which price is it?"
    const { errors } = parsePriceSheet(
      sheet("CEMENT,OPC cement 50kg bag,bag,540", "CEMENT,opc cement 50kg bag,bag,560")
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain("line 2");
  });

  it("ignores blank lines and unknown extra columns", () => {
    const { rows, errors } = parsePriceSheet(
      [
        "category,itemLabel,unit,priceBdt,notes",
        "",
        "TILES,Floor tile 24x24,sft,190,ignore me",
        "",
      ].join("\n")
    );
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
  });

  it("calls an empty file an error rather than an empty sheet", () => {
    // Silently importing nothing from a file the admin believes holds prices is
    // the failure mode this exists to prevent.
    const { errors } = parsePriceSheet("");
    expect(errors).toHaveLength(1);
  });
});

describe("serializePriceSheet", () => {
  const item = {
    priceId: "p1",
    category: "CEMENT",
    itemLabel: "OPC cement, 50kg bag",
    unit: "bag",
    priceBdt: 540,
    source: "CURATED" as never,
    sourceName: 'The "Business Standard"',
    sourceUrl: undefined,
    effectiveFrom: "2026-08-30T00:00:00.000Z",
    ageDays: 3,
    revisions: 2,
    approved: true,
  };

  it("round-trips through the parser", () => {
    // The two halves of the weekly loop have to agree: whatever the download
    // produces, the upload must accept back unchanged.
    const csv = serializePriceSheet([item]);
    const { rows, errors } = parsePriceSheet(csv);

    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({
      category: ProductCategory.CEMENT,
      itemLabel: "OPC cement, 50kg bag",
      unit: "bag",
      priceBdt: 540,
      sourceName: 'The "Business Standard"',
    });
  });

  it("quotes only the fields that need it", () => {
    const csv = serializePriceSheet([item]);
    // The label has a comma and the source name has quotes, so both are quoted;
    // the unit is plain and should not be.
    expect(csv).toContain('"OPC cement, 50kg bag"');
    expect(csv).toContain('"The ""Business Standard"""');
    expect(csv).toContain(",bag,540,");
  });

  it("writes the date column without a time", () => {
    // A full ISO timestamp is a nuisance to edit in a spreadsheet cell, and the
    // time of day a price "took effect" is a fiction anyway.
    expect(serializePriceSheet([item])).toContain("2026-08-30");
  });
});
