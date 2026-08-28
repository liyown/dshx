import type { ReactNode } from "react";

import { I18nContext } from "./context";
import { createTranslator, type Locale } from "./index";

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return (
    <I18nContext.Provider value={{ locale, t: createTranslator(locale) }}>
      {children}
    </I18nContext.Provider>
  );
}
