import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const APPS = [
  {
    code: "free-fire",
    label: "Free Fire",
    description: "Server web hiện tại cho app Free Fire.",
    url: (import.meta.env.VITE_SERVER_APP_FREE_FIRE_URL as string | undefined)?.trim() || "/admin/free-keys?app=free-fire",
  },
  {
    code: "find-dumps",
    label: "Find Dumps",
    description: "Server web dành cho app Find Dumps.",
    url: (import.meta.env.VITE_SERVER_APP_FIND_DUMPS_URL as string | undefined)?.trim() || "/admin/free-keys?app=find-dumps",
  },
] as const;

export function AdminServerAppsPage() {
  const openTarget = (url: string) => {
    if (!url) return;
    if (/^https?:\/\//i.test(url)) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    window.location.assign(url);
  };

  return (
    <section className="space-y-4">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Server app</h1>
        <p className="text-sm text-muted-foreground">
          Mỗi app có một khu quản lý riêng. Bấm vào app để chuyển tới server web của app đó.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {APPS.map((app) => (
          <Card key={app.code}>
            <CardHeader>
              <CardTitle>{app.label}</CardTitle>
              <CardDescription>{app.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-between gap-3">
              <div className="text-xs text-muted-foreground break-all">{app.url}</div>
              <Button onClick={() => openTarget(app.url)}>Mở server</Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
