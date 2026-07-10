/** Shared layout classes for currency Select triggers/popups.
 * Trigger hugs the selected label; popup matches that width so list rows
 * don't stretch to the longest currency name in the catalog. */
export const currencySelectTriggerClass =
  "w-fit max-w-[14rem] flex-none gap-1.5";
export const currencySelectValueClass = "flex-none";
export const currencySelectPopupClass =
  "w-(--anchor-width) min-w-(--anchor-width) max-w-[14rem]";
