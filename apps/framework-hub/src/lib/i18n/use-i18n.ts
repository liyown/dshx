import { useContext } from "react";

import { I18nContext, type I18nContextValue } from "./context";

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside I18nProvider");
  return value;
}
