import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Save, ArrowUp, ArrowDown, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CommunityBanner, SupportLinks } from "@/features/support/SupportViews";
import {
  supportDb,
  useSupport,
  validateSupport,
  type SupportConfig,
  type SupportLink,
  type SupportRecord,
} from "@/features/support/config";

export function AdminSupportMemberPage() {
  const q = useSupport();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<SupportConfig | null>(null);
  const [revision, setRevision] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (q.data && !draft) {
      setDraft(structuredClone(q.data.config));
      setRevision(q.data.revision);
    }
  }, [q.data, draft]);
  const field = (key: keyof SupportConfig, value: unknown) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  const updateLink = (index: number, patch: Partial<SupportLink>) =>
    setDraft((d) =>
      d
        ? {
            ...d,
            links: d.links.map((l, i) =>
              i === index ? { ...l, ...patch } : l,
            ),
          }
        : d,
    );
  const move = (index: number, delta: number) => {
    if (!draft) return;
    const links = [...draft.links];
    [links[index], links[index + delta]] = [links[index + delta], links[index]];
    field("links", links);
  };
  async function save() {
    if (!draft || revision === null || busy) return;
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      const config = validateSupport(draft);
      const { data, error } = await supportDb.rpc("save_sunny_support", {
        p_config: config,
        p_expected_revision: revision,
      });
      if (error)
        throw new Error(
          error.code === "40001"
            ? "Cấu hình đã được thay đổi ở phiên khác. Tải lại trang và kiểm tra trước khi lưu."
            : "Lưu thất bại. Kiểm tra quyền admin, migration và kết nối.",
        );
      const result = data as SupportRecord;
      if (!result || typeof result.revision !== "number")
        throw new Error("Máy chủ chưa xác nhận lưu. Tải lại để kiểm tra.");
      setRevision(result.revision);
      qc.setQueryData(["sunny-support"], result);
      setMessage(
        "Đã lưu. Trang public nhận cấu hình mới sau khi tải lại (cache tối đa 5 phút).",
      );
    } catch (e) {
      setFailed(true);
      setMessage(e instanceof Error ? e.message : "Lưu thất bại");
    } finally {
      setBusy(false);
    }
  }
  if (!draft)
    return (
      <div className="space-y-3 p-4">
        <h1 className="text-2xl font-semibold">Support Member</h1>
        <p>{q.isError ? q.error.message : "Đang tải cấu hình…"}</p>
        {q.isError && <Button onClick={() => void q.refetch()}>Thử lại</Button>}
      </div>
    );
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Support Member</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Quản lý nhóm cộng đồng và liên hệ ở bong bóng SunnyMod. Thay link,
            thêm mục, bật/tắt và sắp xếp ngay tại đây.
          </p>
        </div>
        <Button disabled={busy} onClick={() => void save()}>
          <Save className="mr-2 h-4 w-4" />
          {busy ? "Đang lưu…" : "Lưu thay đổi"}
        </Button>
      </div>
      {message && (
        <p
          role="status"
          className={`rounded-xl border p-3 text-sm ${failed ? "border-red-300 bg-red-50 text-red-800" : "border-emerald-300 bg-emerald-50 text-emerald-800"}`}
        >
          {message}
        </p>
      )}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <fieldset
          disabled={busy}
          className="min-w-0 space-y-5 disabled:opacity-70"
        >
          <section className="rounded-2xl border bg-white p-5">
            <h2 className="mb-4 font-semibold">Nội dung hiển thị</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {(
                [
                  "title",
                  "notice",
                  "community_title",
                  "community_description",
                ] as const
              ).map((k, i) => (
                <label key={k} className="block text-sm font-medium">
                  {
                    [
                      "Tiêu đề liên hệ",
                      "Lời nhắc bong bóng",
                      "Tiêu đề nhóm",
                      "Mô tả nhóm",
                    ][i]
                  }
                  <textarea
                    className="mt-2 w-full rounded-xl border bg-background p-3 text-sm"
                    rows={2}
                    maxLength={500}
                    value={draft[k]}
                    onChange={(e) => field(k, e.target.value)}
                  />
                </label>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-5">
              {(["banner_enabled", "bubble_enabled"] as const).map((k, i) => (
                <label key={k} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft[k]}
                    onChange={(e) => field(k, e.target.checked)}
                  />
                  {i === 0 ? "Hiện banner nhóm" : "Hiện bong bóng liên hệ"}
                </label>
              ))}
            </div>
          </section>
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">
                Các mục hỗ trợ ({draft.links.length}/20)
              </h2>
              <Button
                variant="outline"
                disabled={draft.links.length >= 20}
                onClick={() =>
                  field("links", [
                    ...draft.links,
                    {
                      id: crypto.randomUUID(),
                      label: "Mục mới",
                      description: "",
                      url: "",
                      platform: "link",
                      placement: "other",
                      enabled: true,
                    },
                  ])
                }
              >
                <Plus className="mr-2 h-4 w-4" />
                Thêm mục
              </Button>
            </div>
            {draft.links.map((l, i) => (
              <article
                key={l.id}
                className="space-y-3 rounded-2xl border bg-white p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-sm font-semibold">
                    <input
                      type="checkbox"
                      checked={l.enabled}
                      onChange={(e) =>
                        updateLink(i, { enabled: e.target.checked })
                      }
                    />
                    Mục {i + 1}
                  </label>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Đưa lên"
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Đưa xuống"
                      disabled={i === draft.links.length - 1}
                      onClick={() => move(i, 1)}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Xóa ${l.label}`}
                      onClick={() =>
                        field(
                          "links",
                          draft.links.filter((_, n) => n !== i),
                        )
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(["label", "description", "url"] as const).map((k) => (
                    <label
                      key={k}
                      className={`text-sm ${k === "url" ? "sm:col-span-2" : ""}`}
                    >
                      {k === "label"
                        ? "Tên mục"
                        : k === "description"
                          ? "Mô tả"
                          : "Link chuyển hướng"}
                      <input
                        className="mt-1 w-full rounded-xl border p-3"
                        type={k === "url" ? "url" : "text"}
                        maxLength={
                          k === "url" ? 2048 : k === "label" ? 100 : 500
                        }
                        value={l[k]}
                        onChange={(e) => updateLink(i, { [k]: e.target.value })}
                      />
                    </label>
                  ))}
                  <label className="text-sm">
                    Biểu tượng
                    <select
                      className="mt-1 w-full rounded-xl border p-3"
                      value={l.platform}
                      onChange={(e) =>
                        updateLink(i, {
                          platform: e.target.value as SupportLink["platform"],
                        })
                      }
                    >
                      <option value="telegram">Telegram</option>
                      <option value="zalo">Zalo</option>
                      <option value="youtube">YouTube</option>
                      <option value="link">Liên kết</option>
                    </select>
                  </label>
                  <label className="text-sm">
                    Vị trí
                    <select
                      className="mt-1 w-full rounded-xl border p-3"
                      value={l.placement}
                      onChange={(e) =>
                        updateLink(i, {
                          placement: e.target.value as SupportLink["placement"],
                        })
                      }
                    >
                      <option value="community">Nhóm (hiện cả banner)</option>
                      <option value="contact">Liên hệ admin</option>
                      <option value="other">Mục khác</option>
                    </select>
                  </label>
                </div>
              </article>
            ))}
          </section>
        </fieldset>
        <aside className="space-y-4 xl:sticky xl:top-24">
          <h2 className="font-semibold">Xem trước</h2>
          <CommunityBanner preview={draft} />
          <div className="rounded-3xl border bg-white p-4">
            <h3 className="mb-3 font-semibold">{draft.title}</h3>
            <SupportLinks config={draft} />
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            Mục bật và link hợp lệ mới hiển thị. Đổi admin sang Telegram: sửa
            link thành https://t.me/tên_admin, đổi biểu tượng và mô tả, rồi lưu.
          </p>
        </aside>
      </div>
    </div>
  );
}
