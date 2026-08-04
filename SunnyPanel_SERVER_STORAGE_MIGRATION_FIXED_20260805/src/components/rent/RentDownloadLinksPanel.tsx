import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { postFunction } from "@/lib/functions";
import { getErrorMessage } from "@/lib/error-message";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

type ApiOk<T> = { ok: true } & T;

type DownloadLinkRow = {
  id: string;
  title: string;
  url: string;
  note: string | null;
  enabled: boolean;
  created_at: string;
};

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function RentDownloadLinksPanel(props: { authToken: string }) {
  const { authToken } = props;
  const { toast } = useToast();
  const qc = useQueryClient();

  const downloadsQ = useQuery({
    queryKey: ["rent-admin", "downloads", "customer-setup-page"],
    enabled: !!authToken,
    queryFn: async () => {
      const res = await postFunction<ApiOk<{ items: DownloadLinkRow[] }>>(
        "/admin-rent",
        { action: "list_downloads" },
        { authToken },
      );
      return res.items;
    },
  });

  const toggleDownloadM = useMutation({
    mutationFn: async (payload: { id: string; enabled: boolean }) => {
      await postFunction<ApiOk<Record<string, never>>>(
        "/admin-rent",
        { action: "toggle_download", ...payload },
        { authToken },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rent-admin", "downloads"] });
      qc.invalidateQueries({ queryKey: ["rent-admin", "downloads", "customer-setup-page"] });
    },
    onError: (error: any) => {
      toast({ title: "Lỗi bật/tắt file tải", description: getErrorMessage(error), variant: "destructive" });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Files / Downloads</CardTitle>
        <CardDescription>
          Mục tải file cho khách ở portal thuê. Bật Enabled để khách thấy trong tab API & Tải xuống.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {downloadsQ.isLoading ? (
          <div className="text-sm text-muted-foreground">Đang tải danh sách file...</div>
        ) : null}

        {(downloadsQ.data ?? []).map((item) => (
          <div key={item.id} className="rounded-lg border p-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="font-medium">{item.title}</div>
                {item.note ? <div className="text-sm text-muted-foreground">{item.note}</div> : null}
                <div className="mt-1 break-all font-mono text-xs text-muted-foreground">{item.url}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">{item.enabled ? "Đang hiện" : "Đang ẩn"}</span>
                <Switch
                  checked={item.enabled}
                  onCheckedChange={(checked) => toggleDownloadM.mutate({ id: item.id, enabled: checked })}
                  disabled={toggleDownloadM.isPending}
                />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  const ok = await copyText(item.url);
                  toast({ title: ok ? "Đã copy URL" : "Không copy được" });
                }}
              >
                Copy URL
              </Button>
              <Button size="sm" variant="soft" asChild>
                <a href={item.url} target="_blank" rel="noreferrer">Tải thử</a>
              </Button>
            </div>
          </div>
        ))}

        {(downloadsQ.data ?? []).length === 0 && !downloadsQ.isLoading ? (
          <div className="text-sm text-muted-foreground">Chưa có item download nào. Nếu cần thêm/sửa link, dùng trang admin rent đầy đủ.</div>
        ) : null}
      </CardContent>
    </Card>
  );
}
