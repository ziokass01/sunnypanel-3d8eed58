import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/NavLink";

export function LicensesListPage() {
  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Licenses</h1>
        <Button asChild>
          <NavLink to="/licenses/new">Create license</NavLink>
        </Button>
      </header>
      <p className="text-sm text-muted-foreground">List view coming next.</p>
    </section>
  );
}
