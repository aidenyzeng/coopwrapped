import { stamp, postmark, type Shape } from "@/lib/card/illustration";
import { COLORS, THEMES, type ThemeId } from "@/lib/design/tokens";
import type { PersonaId } from "@/lib/persona/personas";

function ShapeEl({ s }: { s: Shape }) {
  const common = {
    fill: s.fill ?? "none",
    stroke: s.stroke,
    strokeWidth: s.lw,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return s.t === "circle" ? <circle cx={s.cx} cy={s.cy} r={s.r} {...common} /> : <path d={s.d} {...common} />;
}

/** SVG rendering of the shared stamp illustration (same shapes as the canvas cards). */
export function Stamp({
  persona,
  seed,
  tone,
  hole,
  className,
  shadow = true,
  title,
}: {
  persona: PersonaId;
  seed: number;
  tone: ThemeId;
  hole: string;
  className?: string;
  shadow?: boolean;
  title?: string;
}) {
  const t = THEMES[tone];
  const st = stamp(persona, seed, {
    paper: COLORS.paper,
    ink: COLORS.ink,
    accent: t.bg,
    accent2: t.accent2 === t.bg ? COLORS.ultra : t.accent2,
    hole,
  });
  return (
    <svg viewBox="-8 -8 116 116" className={className} role={title ? "img" : undefined} aria-hidden={title ? undefined : true}>
      {title ? <title>{title}</title> : null}
      <g transform={`rotate(${st.rotation} 50 50)`}>
        {shadow ? <rect x={3.5} y={3.5} width={100} height={100} fill={COLORS.ink} /> : null}
        {st.shapes.map((s, i) => (
          <ShapeEl key={i} s={s} />
        ))}
      </g>
    </svg>
  );
}

export function Postmark({ seed, color, className }: { seed: number; color: string; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      {postmark(seed, color).map((s, i) => (
        <ShapeEl key={i} s={s} />
      ))}
    </svg>
  );
}
