import { useParams } from "react-router-dom";

export function LicenseEditPage() {
  const { id } = useParams();
  return (
    <section>
      <h1 className="text-2xl font-semibold">Edit license</h1>
      <p className="mt-2 text-sm text-muted-foreground">ID: {id}</p>
    </section>
  );
}
