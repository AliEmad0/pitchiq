import "server-only";
import type { ReactNode } from "react";
import { EnglishIntlProvider } from "./en";
import { ArabicIntlProvider } from "./ar";

/** Select the locale on the server without passing a catalog through RSC. */
export function IntlProvider({ locale, children }: { locale: string; children: ReactNode }) {
  if (locale === "en") return <EnglishIntlProvider>{children}</EnglishIntlProvider>;
  if (locale === "ar") return <ArabicIntlProvider>{children}</ArabicIntlProvider>;
  throw new Error(`Unsupported catalog locale: ${locale}`);
}
