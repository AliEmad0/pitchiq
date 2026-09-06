"use client";

import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import messages from "../messages/en.json";

// Imported inside the client boundary: the catalog lives in a shared JS chunk,
// rather than being serialized into every prerendered page's HTML and RSC.
export function EnglishIntlProvider({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
