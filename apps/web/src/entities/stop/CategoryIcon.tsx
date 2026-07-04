import type { StopCategory } from "./model";
import { categoryMeta } from "./category";

export function CategoryIcon({ category }: { category: StopCategory }) {
  const meta = categoryMeta(category);

  return (
    <span
      className="flex size-[22px] flex-none items-center justify-center rounded-sm"
      style={{ background: meta.bg, color: meta.fg }}
    >
      <svg
        viewBox="0 0 24 24"
        className="size-[13px]"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={meta.path} />
      </svg>
    </span>
  );
}
