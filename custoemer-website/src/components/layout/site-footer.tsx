import Link from "next/link";
import { Wordmark } from "@/components/layout/wordmark";

const COLUMNS = [
  {
    heading: "Rent",
    links: [
      { href: "/products", label: "All gear" },
      { href: "/products?category=cameras", label: "Cameras" },
      { href: "/products?category=audio", label: "Audio" },
      { href: "/products?category=events", label: "Event & staging" },
    ],
  },
  {
    heading: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/how-it-works", label: "How it works" },
    ],
  },
  {
    heading: "Support",
    links: [
      { href: "/account/orders", label: "My rentals" },
      { href: "/how-it-works#deposits", label: "Deposits & refunds" },
      { href: "/how-it-works#returns", label: "Returns & late fees" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface-raised">
      <div className="container grid gap-10 py-14 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="max-w-xs">
          <Wordmark />
          <p className="mt-4 text-sm leading-relaxed text-ink-soft">
            A rental house for cameras, sound, staging, and tools. Clear rates, deposits you get
            back, returns that stay simple.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.heading}>
            <h3 className="text-2xs font-medium uppercase tracking-[0.18em] text-ink-soft">
              {col.heading}
            </h3>
            <ul className="mt-4 space-y-2.5">
              {col.links.map((link) => (
                <li key={link.href + link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-ink transition-colors hover:text-ink-soft"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="container flex flex-col items-start justify-between gap-2 py-5 text-xs text-ink-soft sm:flex-row sm:items-center">
          <p>© {new Date().getFullYear()} Renton Rentals. All rights reserved.</p>
          <p className="tnum">Rates in INR. Deposits held securely and refunded on time.</p>
        </div>
      </div>
    </footer>
  );
}
