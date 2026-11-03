import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { Brand } from "./Brand";
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" className="auth-shell">
      <section className="auth-story">
        <Brand inverse />
        <div>
          <ArrowUpRight size={65} strokeWidth={1.2} />
          <h1>
            Your stops.
            <br />
            Ready when
            <br />
            you are.
          </h1>
          <p>
            Save your everyday Divvy stations. Check for a bike or an open dock
            before your next ride.
          </p>
        </div>
        <p className="auth-caption">
          HYDE PARK / THE LOOP
          <br />A Chicago station board.
        </p>
      </section>
      <section className="auth-form">
        <Link href="/" className="auth-back">
          <ArrowLeft size={15} /> Back to the station board
        </Link>
        {children}
      </section>
    </main>
  );
}
