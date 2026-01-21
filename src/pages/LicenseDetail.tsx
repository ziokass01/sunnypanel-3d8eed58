import { useParams } from "react-router-dom";

export function LicenseDetailPage() {
  const { id } = useParams();
  return (
    <section>
      <h1 className="text-2xl font-semibold">License</h1>
      <p className="mt-2 text-sm text-muted-foreground">ID: {id}</p>
    </section>
  );
}
