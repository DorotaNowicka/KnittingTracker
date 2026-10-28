/**
 * The kitten of the "Kłębek" themes: a calm line drawing (no big eyes, no hearts), coloured by the
 * theme's --fur, --ink and --marker. Decorative only: always aria-hidden.
 */
export function KittenMark({
  size = 24,
  paws = false,
  className,
}: {
  readonly size?: number;
  readonly paws?: boolean;
  readonly className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className={`kitten${className ? ` ${className}` : ''}`}
    >
      <path d="M4.6 11 5.6 3.6 10 7.4M14 7.4l4.4-3.8 1 7.4" className="kitten__fur" />
      <ellipse cx="12" cy="13.6" rx="8.6" ry="7.2" className="kitten__fur" />
      <path d="M7.4 13.6q1.5 1.2 3 0M13.6 13.6q1.5 1.2 3 0" className="kitten__line" />
      <path d="M11.1 16.2h1.8l-.9 1.1z" className="kitten__nose" />
      <path
        d="M3 15.8l2.6-.4M3.4 18l2.4-1M21 15.8l-2.6-.4M20.6 18l-2.4-1"
        className="kitten__line kitten__whisker"
      />
      {paws && (
        <>
          <ellipse cx="7.6" cy="21.4" rx="3" ry="1.9" className="kitten__fur" />
          <ellipse cx="16.4" cy="21.4" rx="3" ry="1.9" className="kitten__fur" />
        </>
      )}
    </svg>
  );
}
