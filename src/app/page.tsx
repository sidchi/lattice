import Link from "next/link";

import { MAIN_CONTENT_ID } from "@/components/layout/skip-link";
import { practiceTracks, site } from "@/lib/site";

export default function HomePage() {
  return (
    <main
      id={MAIN_CONTENT_ID}
      tabIndex={-1}
      className="mx-auto flex max-w-3xl flex-col gap-12 px-4 py-16 focus:outline-none sm:px-6 sm:py-24"
    >
      <header className="flex flex-col gap-4">
        <p className="text-accent text-sm font-semibold tracking-wide uppercase">{site.name}</p>
        <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">
          {site.tagline}
        </h1>
        <p className="text-muted text-lg text-pretty">{site.description}</p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/practice"
            className="bg-accent text-background inline-flex rounded-md px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90"
          >
            Start practicing
          </Link>
          <Link
            href="/questions"
            className="border-border inline-flex rounded-md border px-4 py-2 text-sm font-semibold hover:border-current"
          >
            Browse questions
          </Link>
        </div>
      </header>

      <section aria-labelledby="tracks-heading" className="flex flex-col gap-4">
        <h2 id="tracks-heading" className="text-xl font-semibold">
          Practice tracks
        </h2>
        <ul className="grid gap-4 sm:grid-cols-3">
          {practiceTracks.map((track) => (
            <li key={track.slug} className="border-border rounded-lg border p-4">
              <h3 className="font-medium">
                <Link
                  href={`/questions?category=${track.slug}`}
                  className="underline-offset-4 hover:underline"
                >
                  {track.title}
                </Link>
              </h3>
              <p className="text-muted mt-1 text-sm">{track.summary}</p>
            </li>
          ))}
        </ul>
      </section>

      <footer className="text-muted text-sm">
        Early access: timed practice is live; rubric-based AI feedback is next.
      </footer>
    </main>
  );
}
