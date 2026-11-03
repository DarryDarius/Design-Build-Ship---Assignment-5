import Link from "next/link";
export function Brand({ inverse = false }: { inverse?: boolean }) {
  return (
    <Link
      href="/"
      className={`brand${inverse ? " inverse" : ""}`}
      aria-label="Dockside home"
    >
      <svg
        width="33"
        height="33"
        viewBox="0 0 33 33"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M3 8h10v17H3M20 8h10v17H20M13 16.5h7"
          stroke="currentColor"
          strokeWidth="3.5"
        />
        <circle cx="16.5" cy="16.5" r="3" fill="currentColor" />
      </svg>
      <span>
        dockside<span className="brand-period">.</span>
      </span>
    </Link>
  );
}
