"use client";

import { useControllable } from "@/lib/hooks/useControllable";
import { Sortable } from "../Sortable";
import type { RankingProps } from "./types";

export type * from "./types";

/**
 * Put options in order of preference, best first: drag them by the handle,
 * or focus the handle and use the arrow keys. Controlled with `value`, or
 * uncontrolled with `defaultValue` (both: the values, best first).
 */
export function Ranking({ options, value, defaultValue, onChange, name, disabled, id, className, ...aria }: RankingProps) {
  const [order, setOrder] = useControllable(value, defaultValue ?? options.map((o) => o.value), onChange);
  const byValue = new Map(options.map((o) => [o.value, o]));
  // Options missing from the order (added later) go last; unknown values are dropped.
  const ranked = [...order.filter((v) => byValue.has(v)), ...options.map((o) => o.value).filter((v) => !order.includes(v))];

  return (
    <>
      <Sortable {...aria} id={id} items={ranked} onChange={setOrder} disabled={disabled} className={className}>
        {ranked.map((v, index) => {
          const option = byValue.get(v)!;
          return (
            <Sortable.Item key={v} id={v} label={option.label}>
              <div className="flex items-center gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold text-accent-bright tabular-nums">
                  {index + 1}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{option.label}</span>
                  {option.description && <span className="text-xs text-muted">{option.description}</span>}
                </span>
              </div>
            </Sortable.Item>
          );
        })}
      </Sortable>
      {name && ranked.map((v) => <input key={v} type="hidden" name={name} value={v} />)}
    </>
  );
}

export default Ranking;
