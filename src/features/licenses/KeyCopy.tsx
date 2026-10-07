import {useEffect,useRef,useState} from 'react';
import {Check,Copy,Eye,EyeOff,Loader2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {customsChecked,customsDb} from '@/features/customs/customs-api';

export function KeyCopy({value,compact=false}:{value:string;compact?:boolean}) {
 const [state,setState]=useState<'idle'|'pending'|'copied'|'error'>('idle');
 const attempt=useRef(0),timer=useRef<ReturnType<typeof setTimeout>>();
 useEffect(()=>{attempt.current++;setState('idle');return()=>{attempt.current++;clearTimeout(timer.current);};},[value]);
 async function copy(){if(!value||state==='pending')return;const id=++attempt.current;clearTimeout(timer.current);setState('pending');
  try {if(!navigator.clipboard?.writeText)throw Error('Clipboard unavailable');await navigator.clipboard.writeText(value);
   if(id!==attempt.current)return;setState('copied');timer.current=setTimeout(()=>setState('idle'),2500);
  }catch{if(id===attempt.current)setState('error');}
 }
 const Icon=state==='copied'?Check:state==='pending'?Loader2:Copy;
 return <span className={compact?'inline-flex shrink-0 flex-col items-end gap-1':'grid gap-1'}>
  <Button type="button" variant="outline" size={compact?'icon':'default'} disabled={!value||state==='pending'} onClick={()=>void copy()} aria-label={state==='copied'?'Đã sao chép key':'Sao chép key'} className={state==='copied'?'border-green-600 text-green-700':''}>
   <Icon size={16} className={state==='pending'?'animate-spin':''}/>{!compact&&<span className="ml-2">{state==='copied'?'Đã sao chép':state==='pending'?'Đang sao chép…':'Sao chép key'}</span>}
  </Button>
  <span role="status" aria-live="polite" className="text-xs">{state==='copied'?'Đã sao chép key.':state==='error'?'Không sao chép được. Hãy chọn mã key để chép thủ công.':''}</span>
 </span>;
}

export function SavedKey({id,engine='customs',hint}:{id:string;engine?:string;hint?:string}) {
 const [value,setValue]=useState(''),[visible,setVisible]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{let active=true;setValue('');setVisible(false);setError('');setLoading(true);
  customsChecked(customsDb.rpc('license_key_reveal',{p_engine:engine,p_id:id})).then(r=>{if(active)setValue(r?.key||'');}).catch(()=>{if(active)setError('Không tải được mã key. Hãy thử mở lại thông tin key.');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};
 },[id,engine]);
 return <div className="grid min-w-0 gap-2 rounded-xl border bg-muted/30 p-3">
  <span className="text-sm font-medium">Mã key</span>
  {loading?<p role="status" className="text-sm">Đang tải mã key…</p>:error?<p role="alert" className="text-sm text-destructive">{error}</p>:value?<div className="flex min-w-0 items-start gap-2">
   <code className="min-w-0 flex-1 break-all py-2 text-sm select-text">{visible?value:(hint||value.split('-')[0]+'-••••••••')}</code>
   <Button type="button" variant="ghost" size="icon" aria-label={visible?'Ẩn key':'Xem key'} onClick={()=>setVisible(v=>!v)}>{visible?<EyeOff size={16}/>:<Eye size={16}/>}</Button>
   <KeyCopy value={value} compact/>
  </div>:<p className="text-sm text-muted-foreground">Key cũ chỉ lưu hash, chưa có bản lưu để xem lại. Dùng mã key đã lưu lúc tạo.</p>}
 </div>;
}
