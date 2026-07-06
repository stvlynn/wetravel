import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import {
  getStoredTheme,
  setStoredTheme,
  type ThemeMode,
} from "@/shared/lib/theme";
import { applyTheme } from "../lib/apply-theme";

export function ThemeModeSelect(): React.ReactElement {
  const { t } = useTranslation("common");
  const [mode, setMode] = useState<ThemeMode>(() => getStoredTheme());

  const handleValueChange = (next: ThemeMode | null) => {
    if (!next) return;
    setStoredTheme(next);
    applyTheme();
    setMode(next);
  };

  return (
    <Select value={mode} onValueChange={handleValueChange}>
      <SelectTrigger className="w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectPopup>
        <SelectItem value="system">{t("settings.appearance.system")}</SelectItem>
        <SelectItem value="light">{t("settings.appearance.light")}</SelectItem>
        <SelectItem value="dark">{t("settings.appearance.dark")}</SelectItem>
      </SelectPopup>
    </Select>
  );
}
