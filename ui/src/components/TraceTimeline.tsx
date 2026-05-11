import { useMemo, useState } from "react";

// Renders a Chrome Trace Event Format document as a Gantt-style
// timeline. Threads (think run ids) become rows; each "B/E" pair is
// drawn as a bar; "i" events become tick marks.

export interface ChromeTraceDoc {
  traceEvents: TraceEvent[];
  displayTimeUnit?: string;
}
interface TraceEvent {
  name: string;
  cat: string;
  ph: "B" | "E" | "i";
  ts: number;
  pid: number;
  tid: string | number;
  args?: Record<string, unknown>;
}

interface Span {
  tid: string;
  name: string;
  cat: string;
  start: number;
  end: number;
  args?: Record<string, unknown>;
}

export function TraceTimeline({ doc }: { doc: ChromeTraceDoc | null }) {
  const [hover, setHover] = useState<Span | null>(null);
  const { spans, ticks, tids, tMin, tMax } = useMemo(
    () => layoutTrace(doc),
    [doc]
  );

  if (!doc) return <div className="text-sm text-neutral-500">Loading…</div>;
  if (!spans.length && !ticks.length)
    return <div className="text-sm text-neutral-500">Trace was empty.</div>;

  const width = 1000;
  const rowH = 28;
  const headerW = 110;
  const height = tids.length * rowH + 20;
  const span = tMax - tMin || 1;
  const xOf = (ts: number) =>
    headerW + ((ts - tMin) / span) * (width - headerW - 10);

  return (
    <div className="space-y-3">
      <div className="text-xs text-neutral-500">
        {tids.length} run(s) · {spans.length} spans ·{" "}
        {(span / 1000).toFixed(2)} ms total
      </div>
      <div className="overflow-x-auto rounded-md border border-neutral-200 bg-white">
        <svg width={width} height={height}>
          {tids.map((tid, i) => (
            <g key={tid}>
              <text
                x={4}
                y={i * rowH + 18}
                fontSize={11}
                fontFamily="ui-monospace, monospace"
                fill="#525252"
              >
                {tid}
              </text>
              <line
                x1={headerW}
                x2={width - 6}
                y1={i * rowH + 22}
                y2={i * rowH + 22}
                stroke="#e5e5e5"
              />
            </g>
          ))}
          {spans.map((s, i) => {
            const y = tids.indexOf(s.tid) * rowH + 4;
            const x = xOf(s.start);
            const w = Math.max(2, xOf(s.end) - x);
            const hue = Math.abs(hashStr(s.cat)) % 360;
            return (
              <g key={`s${i}`}>
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={16}
                  fill={`hsl(${hue}, 60%, 60%)`}
                  rx={2}
                  onMouseEnter={() => setHover(s)}
                  onMouseLeave={() => setHover(null)}
                />
                {w > 70 ? (
                  <text
                    x={x + 4}
                    y={y + 12}
                    fontSize={10}
                    fill="#fff"
                    className="pointer-events-none"
                  >
                    {s.name}
                  </text>
                ) : null}
              </g>
            );
          })}
          {ticks.map((t, i) => {
            const tid = tids.indexOf(t.tid);
            if (tid < 0) return null;
            const x = xOf(t.start);
            return (
              <line
                key={`t${i}`}
                x1={x}
                x2={x}
                y1={tid * rowH + 2}
                y2={tid * rowH + 22}
                stroke="#737373"
                strokeWidth={1}
              />
            );
          })}
        </svg>
      </div>
      {hover ? (
        <div className="rounded-md bg-neutral-900 text-white text-xs p-3 font-mono">
          <div>
            <span className="font-semibold">{hover.name}</span> · cat{" "}
            {hover.cat}
          </div>
          <div className="text-neutral-300 mt-1">
            duration: {((hover.end - hover.start) / 1000).toFixed(3)}ms · tid{" "}
            {hover.tid}
          </div>
          {hover.args ? (
            <pre className="mt-2 text-[10px] text-neutral-200 whitespace-pre-wrap">
              {JSON.stringify(hover.args, null, 2)}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function layoutTrace(doc: ChromeTraceDoc | null): {
  spans: Span[];
  ticks: Span[];
  tids: string[];
  tMin: number;
  tMax: number;
} {
  if (!doc || !doc.traceEvents?.length)
    return { spans: [], ticks: [], tids: [], tMin: 0, tMax: 0 };
  const evs = doc.traceEvents;
  const open: Map<string, Span[]> = new Map();
  const spans: Span[] = [];
  const ticks: Span[] = [];
  const tidsSet = new Set<string>();
  let tMin = Infinity;
  let tMax = -Infinity;
  for (const e of evs) {
    tMin = Math.min(tMin, e.ts);
    tMax = Math.max(tMax, e.ts);
    const tid = String(e.tid);
    tidsSet.add(tid);
    if (e.ph === "B") {
      const arr = open.get(`${tid}:${e.name}`) ?? [];
      arr.push({
        tid,
        name: e.name,
        cat: e.cat,
        start: e.ts,
        end: e.ts,
        args: e.args,
      });
      open.set(`${tid}:${e.name}`, arr);
    } else if (e.ph === "E") {
      const arr = open.get(`${tid}:${e.name}`);
      if (arr && arr.length) {
        const s = arr.pop()!;
        s.end = e.ts;
        spans.push(s);
      }
    } else if (e.ph === "i") {
      ticks.push({
        tid,
        name: e.name,
        cat: e.cat,
        start: e.ts,
        end: e.ts,
        args: e.args,
      });
    }
  }
  return {
    spans,
    ticks,
    tids: Array.from(tidsSet),
    tMin,
    tMax,
  };
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}
