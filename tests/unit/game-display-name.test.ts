import { describe, expect, it } from "vitest";
import { displayName } from "@/features/game/domain/display-name";

describe("displayName", () => {
  it("keeps one- and two-word names whole", () => {
    expect(displayName("Lauren")).toBe("Lauren");
    expect(displayName("Mohamed Salah")).toBe("Mohamed Salah");
    expect(displayName("Cristiano Ronaldo")).toBe("Cristiano Ronaldo");
    expect(displayName("Erling Haaland")).toBe("Erling Haaland");
  });

  it("collapses 3+ word names to the surname", () => {
    expect(displayName("Alan Michael Shearer")).toBe("Shearer");
  });

  it("keeps nobiliary particles attached to the surname", () => {
    expect(displayName("Edwin van der Sar")).toBe("van der Sar");
    expect(displayName("Virgil van Dijk")).toBe("van Dijk");
    expect(displayName("Kevin De Bruyne")).toBe("De Bruyne");
    expect(displayName("Alexis Mac Allister")).toBe("Mac Allister");
  });

  it("prefers a curated override when provided", () => {
    expect(displayName("Anonymous Someone", "Pelé")).toBe("Pelé");
    expect(displayName("Edwin van der Sar", "  ")).toBe("van der Sar");
    expect(displayName("Edwin van der Sar", null)).toBe("van der Sar");
  });

  it("is whitespace tolerant", () => {
    expect(displayName("  Mohamed   Salah  ")).toBe("Mohamed Salah");
  });
});
