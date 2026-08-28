import { createContext } from "react";

import type { Locale, Translate } from "./index";

export type I18nContextValue = { locale: Locale; t: Translate };
export const I18nContext = createContext<I18nContextValue | null>(null);
