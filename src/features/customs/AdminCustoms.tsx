import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Product = { signature: string; name: string; enabled: boolean };
type Key = { id: string; signature: string; enabled: boolean; created_at: string; expires_at: string | null; duration_seconds: number; max_devices: number };
const db = supabase as any; // Add these additive Customs tables to generated DB types after migration.
async function checked(query: any) { const result = await query; if (result.error) throw new Error(result.error.message); return result.data; }
export function AdminCustoms() {
 const [products,setProducts]=useState<Product[]>([]),[selected,setSelected]=useState("");
 const [signature,setSignature]=useState(""),[name,setName]=useState("");
 const [hours,setHours]=useState("24"),[devices,setDevices]=useState("1");
 const [keys,setKeys]=useState<Key[]>([]),[page,setPage]=useState(0),[raw,setRaw]=useState("");
 const [error,setError]=useState(""),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
 useEffect(()=>{let live=true;checked(db.from("customs_products").select("signature,name,enabled").order("signature")).then((data:Product[])=>{if(live)setProducts(data||[]);}).catch((e:Error)=>{if(live)setError(e.message);});return()=>{live=false;};},[revision]);
 useEffect(()=>{let live=true;setKeys([]);if(selected)checked(db.from("customs_keys").select("id,signature,enabled,created_at,expires_at,duration_seconds,max_devices").eq("signature",selected).order("created_at",{ascending:false}).range(page*20,page*20+19)).then((data:Key[])=>{if(live)setKeys(data||[]);}).catch((e:Error)=>{if(live)setError(e.message);});return()=>{live=false;};},[selected,page,revision]);
 async function run(action:()=>Promise<void>){if(busy)return;setBusy(true);setError("");try{await action();setRevision(r=>r+1);}catch(e){setError(e instanceof Error?e.message:"Thao tác thất bại");}finally{setBusy(false);}}
 async function addProduct(){await run(async()=>{if(!/^[A-Z][A-Z0-9]{2,23}$/.test(signature)||!name.trim())throw new Error("Mã phải có 3–24 ký tự A–Z, 0–9 và bắt đầu bằng chữ.");await checked(db.from("customs_products").insert({signature,name:name.trim()}));setSelected(signature);setPage(0);setName("");setSignature("");});}
 async function mint(){await run(async()=>{
  const seconds=Number(hours)*3600,maxDevices=Number(devices);if(!selected||!Number.isInteger(seconds)||seconds<60||seconds>31536000||!Number.isInteger(maxDevices)||maxDevices<1||maxDevices>20)throw new Error("Thời hạn 1 phút–365 ngày, số thiết bị 1–20.");
  if(!products.find(p=>p.signature===selected)?.enabled)throw new Error("Sản phẩm đang tắt.");
  const hex=(bytes:Uint8Array)=>Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
  const key=selected+"-"+hex(crypto.getRandomValues(new Uint8Array(16))).toUpperCase();
  const hash=hex(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(key))));
  await checked(db.from("customs_keys").insert({signature:selected,key_hash:hash,duration_seconds:seconds,max_devices:maxDevices}));setRaw(key);setPage(0);
 });}
 return <section className="customs-panel">
  <style>{`
   .customs-panel { width:100%; min-width:0; display:grid; gap:16px; }
   .customs-panel * { box-sizing:border-box; min-width:0; }
   .customs-panel h3 { font-size:20px; line-height:1.4; margin:0 0 6px; }
   .customs-panel p { overflow-wrap:anywhere; }
   .customs-panel .customs-card { border:1px solid hsl(var(--border)); border-radius:16px; padding:16px; display:grid; gap:14px; background:hsl(var(--background)); }
   .customs-panel .customs-fields { display:grid; grid-template-columns:minmax(0,1fr); gap:12px; }
   .customs-panel label { display:grid; gap:6px; font-size:14px; font-weight:500; }
   .customs-panel input,.customs-panel select { width:100%; max-width:100%; height:46px!important; padding:10px 12px!important; font-size:16px!important; border:1px solid hsl(var(--border)); border-radius:10px; background:hsl(var(--background)); }
   .customs-panel button { max-width:100%; min-height:44px; height:auto!important; padding:10px 14px!important; white-space:normal!important; overflow-wrap:anywhere; font-size:14px!important; line-height:1.4!important; }
   .customs-panel .customs-action { width:100%; }
   .customs-panel .customs-key { display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:12px; border:1px solid hsl(var(--border)); border-radius:12px; padding:12px; }
   .customs-panel .customs-pager { display:flex; flex-wrap:wrap; justify-content:center; align-items:center; gap:8px; }
   @media(min-width:768px) { .customs-panel .customs-fields { grid-template-columns:repeat(2,minmax(0,1fr)); } .customs-panel .customs-action { width:fit-content; } }
  `}</style>
  <header><h3 className="font-semibold">Customs</h3><p className="text-sm text-muted-foreground">Key riêng cho từng app, tool và menu. Thời hạn bắt đầu khi đăng nhập thành công lần đầu.</p></header>
  {error&&<p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
  <div className="customs-card">
   <h4 className="font-semibold">Thêm sản phẩm</h4>
   <div className="customs-fields">
    <label htmlFor="customs-signature">Chữ ký / mã sản phẩm<Input id="customs-signature" placeholder="Ví dụ: TOOLA" maxLength={24} value={signature} onChange={e=>setSignature(e.target.value.toUpperCase())}/></label>
    <label htmlFor="customs-name">Tên sản phẩm<Input id="customs-name" placeholder="Tên app, tool hoặc menu" value={name} onChange={e=>setName(e.target.value)}/></label>
   </div>
   <p className="text-xs text-muted-foreground">Mã gồm 3–24 ký tự A–Z, 0–9 và bắt đầu bằng chữ.</p>
   <Button className="customs-action" disabled={busy} onClick={addProduct}>Thêm sản phẩm</Button>
  </div>
  <div className="customs-card">
   <h4 className="font-semibold">Tạo key</h4>
   <label htmlFor="customs-product">Sản phẩm<select disabled={busy} id="customs-product" value={selected} onChange={e=>{setSelected(e.target.value);setPage(0);setRaw("");}}><option value="">Chọn sản phẩm</option>{products.map(p=><option key={p.signature} value={p.signature}>{p.name} · {p.signature}{p.enabled?"":" · Đang tắt"}</option>)}</select></label>
   {selected?<>
    <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm text-muted-foreground">{products.find(p=>p.signature===selected)?.enabled?"Sản phẩm đang bật":"Sản phẩm đang tắt"}</span><Button variant="outline" disabled={busy} onClick={()=>run(async()=>{await checked(db.from("customs_products").update({enabled:!products.find(p=>p.signature===selected)?.enabled}).eq("signature",selected));})}>{products.find(p=>p.signature===selected)?.enabled?"Tắt sản phẩm":"Bật sản phẩm"}</Button></div>
    <div className="customs-fields"><label htmlFor="customs-hours">Thời hạn (giờ)<Input id="customs-hours" type="number" min="0.017" max="8760" step="any" value={hours} onChange={e=>setHours(e.target.value)}/></label><label htmlFor="customs-devices">Số thiết bị<Input id="customs-devices" type="number" min="1" max="20" value={devices} onChange={e=>setDevices(e.target.value)}/></label></div>
    <Button className="customs-action" disabled={busy} onClick={mint}>Tạo key {selected}</Button>
   </>:<p className="text-sm text-muted-foreground">Chọn sản phẩm để đặt thời hạn và tạo key.</p>}
   {raw&&<div className="space-y-3 rounded-lg border bg-muted p-3"><p className="text-sm">Key mới chỉ hiển thị tại đây. Sao chép và lưu lại.</p><code className="block break-all text-sm">{raw}</code><Button className="customs-action" variant="outline" disabled={busy} onClick={()=>run(async()=>{await navigator.clipboard.writeText(raw);})}>Sao chép key</Button></div>}
  </div>
  {selected&&<div className="customs-card">
   <h4 className="font-semibold">Danh sách key · {selected}</h4>
   {!keys.length&&<p className="text-sm text-muted-foreground">Chưa có key trên trang này.</p>}
   {keys.map(k=><div key={k.id} className="customs-key text-sm"><div><p className="font-mono">{k.id.slice(0,8)} · {k.signature}</p><p>{k.duration_seconds/3600} giờ · {k.max_devices} thiết bị · {k.enabled?"Đang bật":"Đã khóa"}</p><p className="text-muted-foreground">{k.expires_at?`Hết hạn: ${new Date(k.expires_at).toLocaleString()}`:"Chưa kích hoạt"}</p></div><Button variant="outline" disabled={busy} onClick={()=>run(async()=>{await checked(db.from("customs_keys").update({enabled:!k.enabled}).eq("id",k.id).eq("signature",selected));})}>{k.enabled?"Khóa key":"Bật key"}</Button></div>)}
   <div className="customs-pager"><Button variant="outline" disabled={!page||busy} onClick={()=>setPage(p=>p-1)}>Trước</Button><span className="text-sm">Trang {page+1}</span><Button variant="outline" disabled={keys.length<20||busy} onClick={()=>setPage(p=>p+1)}>Sau</Button><Button variant="outline" disabled={busy} onClick={()=>setRevision(r=>r+1)}>Tải lại</Button></div>
  </div>}
 </section>;
}
