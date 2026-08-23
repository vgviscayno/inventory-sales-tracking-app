"use client";

// A windowed, day-grouped list. A heading and a row have different heights, so
// a prefix-sum offset table gives every position. A single row height does not.
// A caller may also give `rowH` as a function, because a Movements row grows
// with the number of products in its Entry. The offsets are the only thing that
// places a row, so a height this table does not agree with puts the row in the
// wrong place. Every row therefore takes its height from here, and never from
// its own content.
// The current day's heading pins as an overlay, and reserves no space. It pins
// only once its own inline heading has scrolled away, so the heading never
// reads double.
// This is what keeps a year of entries scrollable without a year of DOM nodes.

import classNames from "classnames";
import { type ReactNode, useMemo, useState } from "react";
import { dayKey, formatDayHeading, signed } from "./format";

type DayListItem<T> =
  | { kind: "header"; key: string; at: number; net: number; rows: T[] }
  | { kind: "row"; key: string; row: T };

type Groupable = { _id: string; createdAt: number; netChange: number };

/** One day's heading, for a caller that words the figure on the right itself. */
export type DayGroup<T> = { at: number; net: number; rows: T[] };

function buildDayList<T extends Groupable>(
  rows: T[],
  headerH: number,
  rowH: number | ((row: T) => number),
) {
  const heightOf = typeof rowH === "function" ? rowH : () => rowH;
  const items: DayListItem<T>[] = [];
  let current: string | null = null;
  let headerIndex = -1;

  for (const row of rows) {
    const key = dayKey(row.createdAt);
    if (key !== current) {
      current = key;
      headerIndex = items.length;
      items.push({
        kind: "header",
        key: `h_${key}`,
        at: row.createdAt,
        net: 0,
        rows: [],
      });
    }
    const header = items[headerIndex];
    if (header.kind === "header") {
      header.net += row.netChange;
      header.rows.push(row);
    }
    items.push({ kind: "row", key: row._id, row });
  }

  const offsets = [0];
  const heights: number[] = [];
  for (const item of items) {
    const h = item.kind === "header" ? headerH : heightOf(item.row);
    heights.push(h);
    offsets.push(offsets[offsets.length - 1] + h);
  }
  return { items, offsets, heights, total: offsets[offsets.length - 1] };
}

function indexAtOffset(offsets: number[], y: number) {
  for (let i = 0; i < offsets.length - 1; i++) {
    if (offsets[i + 1] > y) return i;
  }
  return Math.max(0, offsets.length - 2);
}

const OVERSCAN = 5;

export function WindowedDayList<T extends Groupable>({
  rows,
  headerH,
  rowH,
  viewportH,
  renderRow,
  renderDayFigure = defaultDayFigure,
  empty = "Nothing logged yet",
}: {
  rows: T[];
  headerH: number;
  /**
   * A fixed height, or one per row. A function must give the same answer for
   * the same row on every call, because the offsets place the row by it.
   */
  rowH: number | ((row: T) => number);
  viewportH: number;
  renderRow: (row: T) => ReactNode;
  /**
   * The figure on the right of a day heading. It defaults to the day's net in
   * Base units, which suits a Ledger of one product. The Movements tab spans
   * products, where no single figure is checkable, so it words its own.
   */
  renderDayFigure?: (day: DayGroup<T>) => ReactNode;
  empty?: string;
}) {
  const [scrollTop, setScrollTop] = useState(0);
  const { items, offsets, heights, total } = useMemo(
    () => buildDayList(rows, headerH, rowH),
    [rows, headerH, rowH],
  );

  if (items.length === 0) {
    return <p className="text-sub py-8 text-center">{empty}</p>;
  }

  const topIndex = indexAtOffset(offsets, scrollTop);
  const first = Math.max(0, topIndex - OVERSCAN);
  const last = Math.min(
    items.length - 1,
    indexAtOffset(offsets, scrollTop + viewportH) + OVERSCAN,
  );
  const visible = items.slice(first, last + 1);

  let stickyAt: Extract<DayListItem<T>, { kind: "header" }> | null = null;
  let stickyIndex = -1;
  for (let i = topIndex; i >= 0; i--) {
    const item = items[i];
    if (item.kind === "header") {
      stickyAt = item;
      stickyIndex = i;
      break;
    }
  }
  const showSticky = stickyAt !== null && scrollTop > offsets[stickyIndex];

  return (
    <div className="card relative overflow-hidden">
      {stickyAt && showSticky && (
        <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-bg/95 px-3 py-1.5 backdrop-blur-sm">
          <DayHeading day={stickyAt} render={renderDayFigure} />
        </div>
      )}

      <div
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        style={{ height: viewportH }}
        className="overflow-y-auto"
      >
        <div style={{ height: total, position: "relative" }}>
          {visible.map((item, i) => {
            const index = first + i;
            const top = offsets[index];
            if (item.kind === "header") {
              return (
                <div
                  key={item.key}
                  style={{ position: "absolute", top, height: headerH }}
                  className="flex w-full items-center justify-between gap-3 px-3"
                >
                  <DayHeading day={item} render={renderDayFigure} />
                </div>
              );
            }
            return (
              <div
                key={item.key}
                style={{ position: "absolute", top, height: heights[index] }}
                className="w-full border-t border-line"
              >
                {renderRow(item.row)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DayHeading<T>({
  day,
  render,
}: {
  day: DayGroup<T>;
  render: (day: DayGroup<T>) => ReactNode;
}) {
  return (
    <>
      <span className="text-sub shrink-0 text-[11px] font-semibold uppercase tracking-wide">
        {formatDayHeading(day.at)}
      </span>
      <span className="truncate text-right text-[11px] font-semibold">
        {render(day)}
      </span>
    </>
  );
}

function defaultDayFigure<T>({ net }: DayGroup<T>): ReactNode {
  return (
    <span
      className={classNames({
        "text-accent": net > 0,
        "text-danger": net <= 0,
      })}
    >
      {signed(net)}
    </span>
  );
}
