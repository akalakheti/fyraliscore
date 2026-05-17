import type { ForecastCategory } from "@/api/forecasts-types";

interface IconProps {
  size?: number;
}

export function ShieldIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <path d="M9 2 3.5 4v4.5c0 3.4 2.4 6.2 5.5 7 3.1-.8 5.5-3.6 5.5-7V4L9 2Z" />
    </svg>
  );
}

export function WaveIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <path d="M2 11c1.6 0 1.6-3 3.2-3s1.6 3 3.2 3 1.6-3 3.2-3 1.6 3 3.2 3" />
    </svg>
  );
}

export function DatabaseIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <ellipse cx="9" cy="4.5" rx="5.5" ry="2" />
      <path d="M3.5 4.5v9c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2v-9" />
      <path d="M3.5 9c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2" />
    </svg>
  );
}

export function ChartIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <path d="M2.5 14h13" />
      <path d="M4 12V8M7.5 12V5M11 12V9M14.5 12V6" />
    </svg>
  );
}

export function ScaleIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <path d="M9 2v13" />
      <path d="M4 5h10" />
      <path d="M2.5 9 4 5l1.5 4c0 .8-.7 1.5-1.5 1.5S2.5 9.8 2.5 9Z" />
      <path d="M12.5 9 14 5l1.5 4c0 .8-.7 1.5-1.5 1.5s-1.5-.7-1.5-1.5Z" />
      <path d="M5.5 15h7" />
    </svg>
  );
}

export function CoinIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <circle cx="9" cy="9" r="6.5" />
      <path d="M9 5v8M7 6.5h3a1.5 1.5 0 1 1 0 3H8a1.5 1.5 0 1 0 0 3h3" />
    </svg>
  );
}

export function HandshakeIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <path d="M2 7l3-2 4 1 4-1 3 2v3l-3.5 3.5L8 10l-4.5 3.5L2 10V7Z" />
    </svg>
  );
}

export function CategoryIcon({
  category,
  size = 18,
}: {
  category: ForecastCategory;
  size?: number;
}) {
  switch (category) {
    case "customer_risk":
      return <ShieldIcon size={size} />;
    case "capacity":
      return <WaveIcon size={size} />;
    case "delivery":
      return <DatabaseIcon size={size} />;
    case "strategy":
      return <ChartIcon size={size} />;
    case "decision":
      return <ScaleIcon size={size} />;
    case "pricing":
      return <CoinIcon size={size} />;
    case "partner":
      return <HandshakeIcon size={size} />;
    default:
      return <ChartIcon size={size} />;
  }
}

export function PlusIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M7 2.5v9M2.5 7h9" />
    </svg>
  );
}

export function ChevronDownIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M3 5l4 4 4-4" />
    </svg>
  );
}

export function ChevronRightIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M5 3l4 4-4 4" />
    </svg>
  );
}

export function InfoIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <circle cx="7" cy="7" r="5.5" />
      <path d="M7 6.2v3.5" />
      <circle cx="7" cy="4.4" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}
