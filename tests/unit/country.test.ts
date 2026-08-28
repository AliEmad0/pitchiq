import { describe, it, expect } from "vitest";

import { countryNameFromCode } from "../../src/utils/country";

describe("countryNameFromCode", () => {
  it("maps an ISO-2 code to a display name", () => {
    expect(countryNameFromCode("fr")).toBe("France");
    expect(countryNameFromCode("pt")).toBe("Portugal");
  });

  it("maps home-nation flag codes", () => {
    expect(countryNameFromCode("gb-eng")).toBe("England");
    expect(countryNameFromCode("gb-sct")).toBe("Scotland");
    expect(countryNameFromCode("gb-wls")).toBe("Wales");
    expect(countryNameFromCode("gb-nir")).toBe("Northern Ireland");
  });

  it("returns null for null/unknown", () => {
    expect(countryNameFromCode(null)).toBeNull();
    expect(countryNameFromCode(undefined)).toBeNull();
    expect(countryNameFromCode("zz")).toBeNull();
    expect(countryNameFromCode("notacode")).toBeNull();
  });

  it("⭐ speaks the requested locale — an English nation name on /ar is the M89 bug (TASK-1842)", () => {
    expect(countryNameFromCode("eg", "ar")).toBe("مصر");
    expect(countryNameFromCode("fr", "ar")).toBe("فرنسا");
    // The home nations and Kosovo have no ISO assignment for Intl to resolve, so their
    // Arabic names are hardcoded beside the English ones — one source, two locales.
    expect(countryNameFromCode("gb-eng", "ar")).toBe("إنجلترا");
    expect(countryNameFromCode("xk", "ar")).toBe("كوسوفو");
    expect(countryNameFromCode("xk")).toBe("Kosovo");
  });

  it("⛔ THE CONTROL — the one-argument call is byte-identical to before the locale existed", () => {
    // Managers' nationality lines and every pre-TASK-1842 caller use the bare form.
    expect(countryNameFromCode("fr")).toBe("France");
    expect(countryNameFromCode("gb-sct")).toBe("Scotland");
  });
});
