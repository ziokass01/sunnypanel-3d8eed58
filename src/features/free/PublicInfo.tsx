import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronRight, Link2, MessageCircle, Send, Youtube } from "lucide-react";

export type PublicLink = {
  label: string;
  url: string;
  icon?: string | null;
};

function pickIcon(icon?: string | null, label?: string) {
  const key = (icon || label || "").toLowerCase();
  if (key.includes("youtube")) return Youtube;
  if (key.includes("zalo")) return MessageCircle;
  if (key.includes("tele")) return Send;
  return Link2;
}

export function PublicInfo({
  note,
  links,
  className,
}: {
  note?: string | null;
  links?: PublicLink[] | null;
  className?: string;
}) {
  const hasNote = Boolean(note && note.trim());
  const list = Array.isArray(links) ? links : [];
  const hasLinks = list.length > 0;

  if (!hasNote && !hasLinks) return null;

  return (
    <div className={cn("space-y-3", className)}>
      {hasNote ? <div className="rounded-[24px] border bg-gradient-to-br from-background to-muted/20 p-4 text-sm leading-8 whitespace-pre-wrap shadow-sm">{note}</div> : null}

      {hasLinks ? (
        <div className="grid grid-cols-2 gap-3">
          {list.map((l, idx) => {
            const Icon = pickIcon(l.icon, l.label);
            return (
              <Button
                key={`${l.url}-${idx}`}
                variant="outline"
                className="h-auto justify-between gap-2 rounded-2xl border-border/80 bg-background/70 px-4 py-3 whitespace-normal shadow-sm transition hover:bg-muted/40"
                onClick={() => window.open(l.url, "_blank", "noopener")}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="text-left text-sm font-medium leading-tight">{l.label}</span>
                <ChevronRight className="ml-auto h-4 w-4 shrink-0 opacity-60" />
              </Button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
