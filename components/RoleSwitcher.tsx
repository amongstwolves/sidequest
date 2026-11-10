import { switchPersona } from "@/app/actions/persona";
import { PERSONAS, currentPersona } from "@/lib/demo/personas";

// Reads a cookie, so it must render inside <Suspense> (Cache Components).
export async function RoleSwitcher() {
  const active = await currentPersona();
  return (
    <form action={switchPersona} aria-label="Demo role" className="flex gap-1 rounded-full bg-surface p-1">
      {PERSONAS.map((p) => {
        const selected = p.key === active.key;
        return (
          <button
            key={p.key}
            type="submit"
            name="persona"
            value={p.key}
            aria-pressed={selected}
            title={`Act as ${p.name}`}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              selected ? "bg-accent text-background" : "text-muted hover:text-foreground"
            }`}
          >
            {p.role}
          </button>
        );
      })}
    </form>
  );
}

export function RoleSwitcherFallback() {
  return <div className="h-9 w-72 rounded-full bg-surface" aria-hidden />;
}
