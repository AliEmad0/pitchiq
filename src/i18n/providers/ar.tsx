"use client";

import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import messages from "../messages/ar.json";

// Imported inside the client boundary: the catalog lives in a shared JS chunk,
// rather than being serialized into every prerendered page's HTML and RSC.
export function ArabicIntlProvider({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="ar" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
