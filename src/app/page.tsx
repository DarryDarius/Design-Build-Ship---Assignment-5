import Board from "@/components/Board";
import { Suspense } from "react";
import { Brand } from "@/components/Brand";
export default function Home() {
  return (
    <Suspense
      fallback={
        <>
          <header className="masthead">
            <Brand />
          </header>
          <main id="main" className="workspace">
            <p className="eyebrow">YOUR CHICAGO STATION BOARD</p>
            <h1>Finding your next stop.</h1>
            <div
              className="skeleton-board"
              role="status"
              aria-label="Loading station board"
            >
              {[0, 1, 2, 3].map((i) => (
                <div className="skeleton-row" key={i}>
                  <span />
                  <span />
                  <span />
                </div>
              ))}
            </div>
          </main>
        </>
      }
    >
      <Board />
    </Suspense>
  );
}
