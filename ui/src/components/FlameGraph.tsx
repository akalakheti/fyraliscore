import { useMemo, useState } from "react";

// Minimal flame-graph viewer for speedscope-format "evented" profiles.
// Reads { profiles: [{ events: [{type, frame, at}], shared: { frames: [...] } }] }
// and lays out each (open, close) pair as a horizontal bar. Multiple
// concurrent bars stack vertically (icicle).

export interface SpeedscopeDoc {
  profiles: SpeedscopeProfile[];
  shared: { frames: { name: string }[] };
}
interface SpeedscopeProfile {
  type: "evented" | "sampled";
  events?: { type: "O" | "C"; frame: number; at: number }[];
  startValue?: number;
  endValue?: number;
  unit?: string;
  name?: string;
}

interface Bar {
  frame: number;
  depth: number;
  startAt: number;
  endAt: number;
}

export function FlameGraph({ doc }: { doc: SpeedscopeDoc | null }) {
  const [hover, setHover] = useState<Bar | null>(null);
  const bars = useMemo<Bar[]>(() => layoutBars(doc), [doc]);

  if (!doc) return <div className="text-sm text-neutral-500">Loading…</div>;
  if (bars.length === 0)
    return (
      <div className="text-sm text-neutral-500">
        Profile contained no events.
      </div>
    );

  const maxEnd = Math.max(...bars.map((b) => b.endAt), 1);
  const maxDepth = Math.max(...bars.map((b) => b.depth), 0);
  const rowH = 18;
  const width = 1000;
  const height = (maxDepth + 1) * rowH + 4;
  const frames = doc.shared?.frames ?? [];

  return (
    <div className="space-y-3">
      <div className="text-xs text-neutral-500">
        {bars.length.toLocaleString()} frames · total{" "}
        {maxEnd.toFixed(3)} {doc.profiles[0]?.unit ?? "s"}
      </div>
      <div
        className="relative overflow-x-auto border border-neutral-200 bg-white rounded-md"
        style={{ width: "100%" }}
      >
        <svg width={width} height={height} className="block">
          {bars.map((b, i) => {
            const x = (b.startAt / maxEnd) * width;
            const w = Math.max(1, ((b.endAt - b.startAt) / maxEnd) * width);
            const y = b.depth * rowH;
            const fr = frames[b.frame]?.name ?? `frame ${b.frame}`;
            const hue = (b.frame * 47) % 360;
            return (
              <g key={i}>
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={rowH - 2}
                  fill={`hsl(${hue}, 60%, 60%)`}
                  stroke="white"
                  strokeWidth={0.5}
                  onMouseEnter={() => setHover(b)}
                  onMouseLeave={() => setHover(null)}
                />
                {w > 50 ? (
                  <text
                    x={x + 4}
                    y={y + 12}
                    fontSize={10}
                    fill="rgba(0,0,0,0.85)"
                    className="pointer-events-none select-none font-mono"
                  >
                    {fr.length > Math.floor(w / 6)
                      ? fr.slice(0, Math.floor(w / 6) - 1) + "…"
                      : fr}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
      {hover ? (
        <div className="rounded-md bg-neutral-900 text-white text-xs p-3 font-mono">
          <div>{frames[hover.frame]?.name ?? `frame ${hover.frame}`}</div>
          <div className="text-neutral-300 mt-1">
            duration: {(hover.endAt - hover.startAt).toFixed(4)}{" "}
            {doc.profiles[0]?.unit ?? "s"} · start: {hover.startAt.toFixed(4)}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function layoutBars(doc: SpeedscopeDoc | null): Bar[] {
  if (!doc || !doc.profiles?.length) return [];
  const prof = doc.profiles[0];
  if (prof.type !== "evented" || !prof.events) return [];
  const events = prof.events;
  const openStack: { frame: number; startAt: number }[] = [];
  const out: Bar[] = [];
  for (const e of events) {
    if (e.type === "O") {
      openStack.push({ frame: e.frame, startAt: e.at });
    } else if (e.type === "C") {
      // Pop the matching open frame.
      const idx = (() => {
        for (let i = openStack.length - 1; i >= 0; i--) {
          if (openStack[i].frame === e.frame) return i;
        }
        return -1;
      })();
      if (idx < 0) continue;
      const open = openStack.splice(idx, 1)[0];
      out.push({
        frame: e.frame,
        depth: idx,
        startAt: open.startAt,
        endAt: e.at,
      });
    }
  }
  return out;
}
