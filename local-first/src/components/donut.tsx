import { useState } from "react";

/**
 * Where the money went, as a ring.
 *
 * Deliberately at most six segments. A donut answers "is one of these most of
 * it?" at a glance and answers nothing else well — past about six slices the
 * arcs stop being comparable and it becomes decoration with a legend. Sixteen
 * categories do not go in a pie; the fifth-largest and everything below it fold
 * into **Other**, and the full ranked list underneath is where the tail lives.
 *
 * Colour encodes **magnitude, not identity**: one blue hue, darkest for the
 * largest share, stepped so adjacent slices are visibly different. That is why
 * changing the date range may recolour a category — the colour is saying "this
 * is the biggest", which is the thing the reader is here to learn. Identity
 * comes from the labels and the list, never from colour alone. Other is neutral
 * grey because it is a remainder rather than a category with an opinion.
 *
 * The five steps are the reference sequential ramp, validated with the palette
 * checker in ordinal mode for both surfaces: monotone lightness, every adjacent
 * gap over the minimum, and the lightest step still clearing the surface.
 */

export type Slice = { label: string; amount: number; isOther?: boolean };


const SIZE = 240;
const R_OUTER = 108;
const R_INNER = 66;
const TAU = Math.PI * 2;

/**
 * A 2px surface gap between fills, expressed as a fraction of the circle.
 *
 * The units matter and got this wrong once: `2 / R_OUTER` is the gap in
 * *radians*, but the layout below works in turns (0 to 1). Using one as the
 * other made every gap 2π times too wide — about 13px of surface between
 * slices, which looked deliberate rather than broken, and only showed up on
 * screenshotting the finished chart.
 */
const GAP = 2 / (TAU * R_OUTER);

function arc(from: number, to: number): string {
  // Start at twelve o'clock and run clockwise, which is how a share is read.
  const a0 = from * TAU - Math.PI / 2;
  const a1 = to * TAU - Math.PI / 2;
  const c = SIZE / 2;
  const large = to - from > 0.5 ? 1 : 0;
  const x0 = c + R_OUTER * Math.cos(a0);
  const y0 = c + R_OUTER * Math.sin(a0);
  const x1 = c + R_OUTER * Math.cos(a1);
  const y1 = c + R_OUTER * Math.sin(a1);
  const xi1 = c + R_INNER * Math.cos(a1);
  const yi1 = c + R_INNER * Math.sin(a1);
  const xi0 = c + R_INNER * Math.cos(a0);
  const yi0 = c + R_INNER * Math.sin(a0);
  return [
    `M ${x0} ${y0}`,
    `A ${R_OUTER} ${R_OUTER} 0 ${large} 1 ${x1} ${y1}`,
    `L ${xi1} ${yi1}`,
    `A ${R_INNER} ${R_INNER} 0 ${large} 0 ${xi0} ${yi0}`,
    "Z",
  ].join(" ");
}

export function Donut({
  slices,
  total,
  money,
  caption,
}: {
  slices: readonly Slice[];
  total: number;
  money: (minor: number) => string;
  caption: string;
}) {
  const [active, setActive] = useState<number | null>(null);

  if (total <= 0 || slices.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground" data-testid="donut-empty">
        Nothing spent in this period.
      </p>
    );
  }

  // A single slice would render as a ring with a 2px notch cut in it for no
  // reason, so the gap only applies once there is something to separate.
  const gap = slices.length > 1 ? GAP : 0;
  let cursor = 0;
  const laid = slices.map((slice, index) => {
    const share = slice.amount / total;
    const from = cursor;
    const to = cursor + share;
    cursor = to;
    return { ...slice, index, share, from: from + gap / 2, to: Math.max(from + gap / 2, to - gap / 2) };
  });

  const shown = active === null ? null : laid[active];

  return (
    <figure className="m-0 flex flex-col items-center gap-3">
      <div className="relative">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="h-[240px] w-[240px]"
          role="img"
          aria-label={caption}
          data-testid="donut"
        >
          {laid.map((slice) => (
            <path
              key={slice.label}
              d={arc(slice.from, slice.to)}
              className="cursor-pointer transition-opacity"
              style={{
                fill: `var(${slice.isOther ? "--slice-other" : `--slice-${slice.index}`})`,
                opacity: active === null || active === slice.index ? 1 : 0.35,
              }}
              onMouseEnter={() => setActive(slice.index)}
              onMouseLeave={() => setActive(null)}
              onClick={() => setActive(active === slice.index ? null : slice.index)}
              data-testid="donut-slice"
              data-label={slice.label}
            >
              <title>{`${slice.label}: ${money(slice.amount)} (${Math.round(slice.share * 100)}%)`}</title>
            </path>
          ))}
        </svg>

        {/* The hole is the obvious home for the total, so the ring does not
            need a separate figure beside it competing for the same glance. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {shown ? shown.label : "Total"}
          </span>
          <span className="tabular text-xl font-semibold" data-testid="donut-centre">
            {money(shown ? shown.amount : total)}
          </span>
          {shown ? (
            <span className="tabular text-xs text-muted-foreground">
              {Math.round(shown.share * 100)}%
            </span>
          ) : null}
        </div>
      </div>

      <figcaption className="sr-only">{caption}</figcaption>
    </figure>
  );
}

