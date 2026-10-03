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
 return <section className="space-y-5 rounded-xl border p-4">
  <div><h3 className="text-lg font-semibold">Customs · Key riêng cho app, tool và menu</h3><p className="text-sm text-muted-foreground">Dùng cùng bộ login Customs; mỗi sản phẩm đặt một mã riêng. Thời hạn bắt đầu từ lần đăng nhập thành công đầu tiên.</p></div>
  {error&&<p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
  <div className="grid gap-3 sm:grid-cols-2"><Input aria-label="Mã sản phẩm" placeholder="Chữ ký / mã sản phẩm: TOOLA" value={signature} onChange={e=>setSignature(e.target.value.toUpperCase())}/><Input aria-label="Tên sản phẩm" placeholder="Tên app / tool / menu" value={name} onChange={e=>setName(e.target.value)}/></div>
  <Button disabled={busy} onClick={addProduct}>Thêm sản phẩm Customs</Button>
  <div className="flex flex-wrap items-center gap-3"><label htmlFor="customs-product">Sản phẩm</label><select disabled={busy} id="customs-product" className="rounded-md border bg-background p-2" value={selected} onChange={e=>{setSelected(e.target.value);setPage(0);setRaw("");}}><option value="">Chọn sản phẩm</option>{products.map(p=><option key={p.signature} value={p.signature}>{p.name} · {p.signature}{p.enabled?"":" · Đang tắt"}</option>)}</select>
  {selected&&<Button variant="outline" disabled={busy} onClick={()=>run(async()=>{await checked(db.from("customs_products").update({enabled:!products.find(p=>p.signature===selected)?.enabled}).eq("signature",selected));})}>{products.find(p=>p.signature===selected)?.enabled?"Tắt sản phẩm":"Bật sản phẩm"}</Button>}</div>
  {selected&&<><div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-sm">Thời hạn (giờ)<Input type="number" min="0.017" max="8760" step="any" value={hours} onChange={e=>setHours(e.target.value)}/></label><label className="space-y-1 text-sm">Số thiết bị<Input type="number" min="1" max="20" value={devices} onChange={e=>setDevices(e.target.value)}/></label></div><Button disabled={busy} onClick={mint}>Tạo key {selected}</Button>
  {raw&&<div className="space-y-2 rounded-lg border bg-muted p-3"><p className="text-sm">Key mới · Sao chép và lưu lại, server chỉ lưu hash.</p><code className="block break-all">{raw}</code><Button variant="outline" onClick={()=>run(async()=>{await navigator.clipboard.writeText(raw);})}>Sao chép key</Button></div>}
  <div className="space-y-2">{keys.map(k=><div key={k.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"><div><p className="font-mono">{k.id.slice(0,8)} · {k.signature}</p><p>{k.duration_seconds/3600} giờ · {k.max_devices} thiết bị · {k.enabled?"Đang bật":"Đã khóa"}</p><p>{k.expires_at?`Hết hạn: ${new Date(k.expires_at).toLocaleString()}`:"Chưa kích hoạt"}</p></div><Button variant="outline" disabled={busy} onClick={()=>run(async()=>{await checked(db.from("customs_keys").update({enabled:!k.enabled}).eq("id",k.id).eq("signature",selected));})}>{k.enabled?"Khóa key":"Bật key"}</Button></div>)}</div>
  <div className="flex items-center gap-3"><Button variant="outline" disabled={!page||busy} onClick={()=>setPage(p=>p-1)}>Trước</Button><span>Trang {page+1}</span><Button variant="outline" disabled={keys.length<20||busy} onClick={()=>setPage(p=>p+1)}>Sau</Button><Button variant="outline" disabled={busy} onClick={()=>setRevision(r=>r+1)}>Tải lại</Button></div></>}
 </section>;
}
