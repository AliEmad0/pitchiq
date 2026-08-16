import { describe, expect, it } from "vitest";
import { feeText } from "@/features/players/career-record.api";

/**
 * 901 of the 65,437 committed transfer fees carry raw Transfermarkt markup, and the career
 * record prints fees VERBATIM by design — so they reached production as literal tags:
 *
 *   Loan fee:<br /><i class="normaler-text">€700k</i>
 *
 * Printing verbatim is the right rule (rule 2 in `PlayerCareerRecord.tsx`: coercing these
 * heterogeneous labels would invent a free transfer for every loan). The defect is that the
 * value was never DECODED into text in the first place.
 */
describe("feeText", () => {
  it("turns the leaked markup into the sentence it was meant to be", () => {
    expect(feeText('Loan fee:<br /><i class="normaler-text">€700k</i>')).toBe("Loan fee: €700k");
    expect(feeText('End of loan<br /><i class="normaler-text">€470k</i>')).toBe(
      "End of loan €470k",
    );
    expect(feeText('Loan fee:<br /><i class="normaler-text">€2.00m</i>')).toBe("Loan fee: €2.00m");
  });

  it("leaves the 64,536 plain fees exactly as they are", () => {
    // ⚠️ The important half. Most fees are already clean, and a formatter that rewrites
    // them would be a far bigger regression than the bug it fixes.
    for (const plain of ["€1.40m", "free transfer", "End of loan", "loan transfer", "-", "?"]) {
      expect(feeText(plain)).toBe(plain);
    }
  });

  it("decodes entities rather than printing them", () => {
    expect(feeText("Fee &amp; bonus")).toBe("Fee & bonus");
    expect(feeText("€1.00m&nbsp;")).toBe("€1.00m");
  });

  it("passes null through, and never invents a value", () => {
    expect(feeText(null)).toBeNull();
    // A string that is only markup has no fee in it — null, not an empty cell that reads
    // as a real "no fee".
    expect(feeText("<i></i>")).toBeNull();
    expect(feeText("   ")).toBeNull();
  });

  it("strips a tag rather than trusting its contents", () => {
    // Defensive: the source is scraped HTML, so treat it as markup to be removed, never as
    // something to render.
    expect(feeText('<script>alert(1)</script>€5m')).toBe("alert(1)€5m");
    expect(feeText("<b>€5m</b>")).toBe("€5m");
  });
});
