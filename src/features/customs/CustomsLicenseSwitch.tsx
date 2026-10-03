import { ReactNode,useEffect,useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePanelRole } from '@/hooks/use-panel-role';
import { customsChecked,customsDb } from './customs-api';
import { CustomsLicenses } from './CustomsLicenses';
import { CustomsStyles } from './CustomsStyles';
import { NavLink } from '@/components/NavLink';
export function CustomsLicenseSwitch({children,mode='list',countdownOnly=false}:{children:ReactNode;mode?:'list'|'create'|'trash';countdownOnly?:boolean}){
 const [params,setParams]=useSearchParams(),[products,setProducts]=useState<any[]>([]),[error,setError]=useState('');const {isAdmin}=usePanelRole();const selected=params.get('customs')||'';
 useEffect(()=>{let live=true;if(isAdmin)customsChecked(customsDb.from('customs_products').select('signature,name,enabled').order('signature')).then(data=>{if(live)setProducts(data||[]);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[isAdmin]);
 const choose=(value:string)=>{const next=new URLSearchParams(params);if(value)next.set('customs',value);else next.delete('customs');setParams(next);};
 return <div className="space-y-4">{isAdmin&&<div className="customs-workspace"><CustomsStyles/><div className="customs-card"><label>Loại key / Sản phẩm<select value={selected} onChange={e=>choose(e.target.value)}><option value="">SUNNY · key hiện tại</option>{selected&&!products.some(p=>p.signature===selected)&&<option value={selected}>Customs · {selected}</option>}{products.map(p=><option key={p.signature} value={p.signature}>Customs · {p.name} · {p.signature}{p.enabled?'':' · Đang tắt'}</option>)}</select></label>{error&&<p className="text-sm text-destructive">Không tải được sản phẩm Customs: {error}</p>}{selected&&<div className="customs-actions customs-toolbar"><NavLink className="text-sm" to={'/licenses2/new?customs='+selected}>Tạo key</NavLink><NavLink className="text-sm" to={'/licenses2?customs='+selected}>Danh sách</NavLink><NavLink className="text-sm" to={'/licenses/trash?customs='+selected}>Thùng rác</NavLink></div>}</div></div>}{selected?(isAdmin?<CustomsLicenses key={selected+mode} signature={selected} mode={mode} countdownOnly={false}/>:<p>Customs chỉ dành cho quản trị viên.</p>):children}</div>;
}
