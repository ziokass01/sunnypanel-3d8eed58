// Only a gateway-authenticated IP may bind the Free Key bearer pair.
// This deliberately rejects direct Edge calls carrying spoofed IP headers.
export async function authenticateFreeIngress(req: Request, route: string, secret: string): Promise<Request> {
  if (!secret) throw new Error("FREE_GATEWAY_SECRET_MISSING");
  const ts = (req.headers.get("x-gateway-ts") ?? "").trim();
  const nonce = (req.headers.get("x-gateway-nonce") ?? "").trim();
  const ip = (req.headers.get("x-gateway-ip") ?? "").trim();
  const bodyHash = (req.headers.get("x-gateway-body-sha256") ?? "").trim();
  const signature = (req.headers.get("x-gateway-signature") ?? "").trim();
  if (!/^\d{10}$/.test(ts) || Math.abs(Date.now()/1000-Number(ts))>90 || !/^[a-f0-9]{32}$/.test(nonce)
    || !ip || ip.length>80 || !/^[a-f0-9:.]+$/i.test(ip) || !/^[a-f0-9]{64}$/.test(bodyHash)
    || !/^[a-f0-9]{64}$/.test(signature)) throw new Error("FREE_GATEWAY_REQUIRED");
  const hex = (data: ArrayBuffer) => Array.from(new Uint8Array(data),x=>x.toString(16).padStart(2,"0")).join("");
  const reader=req.clone().body?.getReader();
  const chunks: Uint8Array[]=[];let total=0;
  if(reader) for(;;){const {done,value}=await reader.read();if(done)break;if(value){
    total+=value.byteLength;if(total>16384){void reader.cancel();throw new Error("PAYLOAD_TOO_LARGE");}chunks.push(value);
  }}
  const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  if (hex(await crypto.subtle.digest("SHA-256",bytes))!==bodyHash) throw new Error("FREE_GATEWAY_BODY_INVALID");
  const canonical=["free-v1",req.method.toUpperCase(),route,ts,nonce,ip,req.headers.get("user-agent")??"",bodyHash].join("\n");
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
  const sig=Uint8Array.from(signature.match(/../g)!,x=>parseInt(x,16));
  if (!await crypto.subtle.verify("HMAC",key,sig,new TextEncoder().encode(canonical))) throw new Error("FREE_GATEWAY_SIGNATURE_INVALID");
  const headers=new Headers(req.headers);headers.set("cf-connecting-ip",ip);headers.set("x-real-ip",ip);headers.set("x-forwarded-for",ip);
  return new Request(req,{headers});
}
