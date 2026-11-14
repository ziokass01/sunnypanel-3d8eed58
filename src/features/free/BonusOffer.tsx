import {Flame,Sparkles,Clock3} from 'lucide-react';
import {bonusPresentation,type BonusKey} from './bonus-presentation';
export function BonusTag({item}:{item:BonusKey}) {const p=bonusPresentation(item);return p?<span className="free-bonus-tag"><Flame aria-hidden="true" size={14}/>{p.tag}</span>:null;}
export function BonusOffer({item}:{item:BonusKey}) {const p=bonusPresentation(item);return p?<section className="free-bonus-offer" aria-label="Ưu đãi Bonus" role="status">
 <div className="free-bonus-offer__top"><span className="free-bonus-offer__eyebrow"><Sparkles size={13} aria-hidden="true"/> ƯU ĐÃI ĐANG DIỄN RA</span><span className="free-bonus-live">BONUS</span></div>
 <div className="free-bonus-offer__body"><div className="free-bonus-flame" aria-hidden="true"><Flame size={36}/><span/></div><div className="free-bonus-offer__copy"><h3>{p.extra?<>Tặng thêm <strong>{p.extra}</strong></>:'Key Bonus đặc biệt'}<span className="free-bonus-offer__sub">{p.extra?'Thời gian tặng được cộng khi nhận key.':'Chương trình Bonus đang mở cho key này.'}</span></h3></div></div>
 <div className="free-bonus-offer__footer"><span><Clock3 size={14} aria-hidden="true"/>{p.extra?<>Thời lượng gốc <b>{p.base}</b></>:'Thời lượng key'}</span><strong>{p.total}<small>{p.extra?' sau ưu đãi':''}</small></strong></div>
 </section>:null;}
