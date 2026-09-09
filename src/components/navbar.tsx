import Link from "next/link";
import { Sun } from "lucide-react";

export function Navbar() {
  return (
    <nav className="navbar" aria-label="Main navigation">
      <div className="navbar__inner">
        <Link href="/" className="navbar__brand">
          <span className="navbar__mark" aria-hidden>
            <Sun className="navbar__icon" size={18} strokeWidth={2.5} />
          </span>
          <span className="navbar__brand-text">
            <span className="navbar__title">Solar Ops</span>
            <span className="navbar__subtitle">ระบบติดตามโซลาร์</span>
          </span>
        </Link>
        <div className="navbar__links">
          <Link href="/" className="navbar__link navbar__link--active">
            แดชบอร์ด
          </Link>
        </div>
      </div>
    </nav>
  );
}
