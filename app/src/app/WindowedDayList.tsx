"use client";

// A windowed, day-grouped list. Headings and rows have different fixed
// heights, so positions come from a prefix-sum offset table rather than a
// single row height. The current day's heading pins as an overlay —
// reserving no space, and only once its own inline heading has scrolled away,
// so it never reads double. This is what keeps a year of entries scrollable
// without a year of DOM nodes.

import { type ReactNode, useMemo, useState } from "react";
import { dayKey, formatDayHeading, signed } from "./format";
import classNames from "classnames";

type DayListItem<T> =
	| { kind: "header"; key: string; at: number; net: number }
	| { kind: "row"; key: string; row: T };

type Groupable = { _id: string; createdAt: number; netChange: number };

function buildDayList<T extends Groupable>(
	rows: T[],
	headerH: number,
	rowH: number,
) {
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
			});
		}
		const header = items[headerIndex];
		if (header.kind === "header") header.net += row.netChange;
		items.push({ kind: "row", key: row._id, row });
	}

	const offsets = [0];
	for (const item of items) {
		offsets.push(
			offsets[offsets.length - 1] + (item.kind === "header" ? headerH : rowH),
		);
	}
	return { items, offsets, total: offsets[offsets.length - 1] };
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
	empty = "Nothing logged yet",
}: {
	rows: T[];
	headerH: number;
	rowH: number;
	viewportH: number;
	renderRow: (row: T) => ReactNode;
	empty?: string;
}) {
	const [scrollTop, setScrollTop] = useState(0);
	const { items, offsets, total } = useMemo(
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
				<div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between border-b border-line bg-bg/95 px-3 py-1.5 backdrop-blur-sm">
					<DayHeading at={stickyAt.at} net={stickyAt.net} />
				</div>
			)}

			<div
				onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
				style={{ height: viewportH }}
				className="overflow-y-auto"
			>
				<div style={{ height: total, position: "relative" }}>
					{visible.map((item, i) => {
						const top = offsets[first + i];
						if (item.kind === "header") {
							return (
								<div
									key={item.key}
									style={{ position: "absolute", top, height: headerH }}
									className="flex w-full items-center justify-between px-3"
								>
									<DayHeading at={item.at} net={item.net} />
								</div>
							);
						}
						return (
							<div
								key={item.key}
								style={{ position: "absolute", top, height: rowH }}
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

function DayHeading({ at, net }: { at: number; net: number }) {
	return (
		<>
			<span className="text-sub text-[11px] font-semibold uppercase tracking-wide">
				{formatDayHeading(at)}
			</span>
			<span
				className={classNames("text-[11px] font-semibold", {
					"text-accent": net > 0,
					"text-danger": net <= 0,
				})}
			>
				{signed(net)}
			</span>
		</>
	);
}
