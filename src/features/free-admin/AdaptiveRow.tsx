import { useState, type ReactNode } from "react";
import { TableCell, TableRow } from "@/components/ui/table";
export function AdaptiveRow({
  children,
  kind,
  className,
}: {
  children: ReactNode;
  kind: "provider" | "key";
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <TableRow
      className={className}
      data-adaptive={kind}
      data-expanded={expanded}
    >
      {children}
      <TableCell className="adaptive-row-control">
        <button
          type="button"
          aria-expanded={expanded}
          className="w-full rounded-lg border bg-slate-50 px-3 py-2 text-sm font-semibold"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Thu gọn" : "Xem / chỉnh chi tiết"}
        </button>
      </TableCell>
    </TableRow>
  );
}
