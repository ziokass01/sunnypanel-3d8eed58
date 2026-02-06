import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Link2, MessageCircle, Send, Youtube } from "lucide-react";

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
      {hasNote ? <div className="rounded-md border p-3 text-sm whitespace-pre-wrap">{note}</div> : null}

      {hasLinks ? (
        <div className="grid grid-cols-2 gap-2">
          {list.map((l, idx) => {
            const Icon = pickIcon(l.icon, l.label);
            return (
              <Button
                key={`${l.url}-${idx}`}
                variant="outline"
                className="h-auto justify-start gap-2 whitespace-normal py-2"
                onClick={() => window.open(l.url, "_blank", "noopener,noreferrer")}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="text-left text-sm leading-tight">{l.label}</span>
              </Button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
