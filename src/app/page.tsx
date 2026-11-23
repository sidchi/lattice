import { practiceTracks, site } from "@/lib/site";

export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-12 px-4 py-16 sm:px-6 sm:py-24">
      <header className="flex flex-col gap-4">
        <p className="text-accent text-sm font-semibold tracking-wide uppercase">{site.name}</p>
        <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">
          {site.tagline}
        </h1>
        <p className="text-muted text-lg text-pretty">{site.description}</p>
      </header>

      <section aria-labelledby="tracks-heading" className="flex flex-col gap-4">
        <h2 id="tracks-heading" className="text-xl font-semibold">
          Practice tracks
        </h2>
        <ul className="grid gap-4 sm:grid-cols-3">
          {practiceTracks.map((track) => (
            <li key={track.slug} className="border-border rounded-lg border p-4">
              <h3 className="font-medium">{track.title}</h3>
              <p className="text-muted mt-1 text-sm">{track.summary}</p>
            </li>
          ))}
        </ul>
      </section>

      <footer className="text-muted text-sm">
        Early access: sign-in, the question bank and practice sessions are on the way.
      </footer>
    </main>
  );
}
