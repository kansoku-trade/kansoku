export function ChevronDown({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function Check({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m20 6-11 11-5-5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
