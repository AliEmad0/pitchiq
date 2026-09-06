import { render, screen, cleanup } from "@testing-library/react";
import { useLocale, useTranslations } from "next-intl";
import { afterEach, describe, expect, it } from "vitest";
import { IntlProvider } from "@/i18n/providers";
import en from "@/i18n/messages/en.json";
import ar from "@/i18n/messages/ar.json";

function Consumer() {
  const t = useTranslations("nav");
  return <p lang={useLocale()}>{t("dashboard")}</p>;
}
afterEach(cleanup);
describe("shared client catalogs", () => {
  it.each([
    ["en", en.nav.dashboard],
    ["ar", ar.nav.dashboard],
  ])("renders the real %s catalog with explicit locale", (locale, label) => {
    render(
      <IntlProvider locale={locale}>
        <Consumer />
      </IntlProvider>,
    );
    expect(screen.getByText(label)).toHaveAttribute("lang", locale);
  });
  it("rejects unsupported locales instead of silently showing English", () => {
    expect(() => IntlProvider({ locale: "fr", children: null })).toThrow(
      "Unsupported catalog locale: fr",
    );
  });
});
