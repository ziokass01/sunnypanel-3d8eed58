import {Coins} from 'lucide-react';
import {usePanelRole} from '@/hooks/use-panel-role';
import {useQuery} from '@tanstack/react-query';
import {walletBalance} from './wallet-api';
export function ModeratorBalance(){const {userId}=usePanelRole();const q=useQuery({queryKey:['moderator-balance',userId],queryFn:walletBalance,refetchInterval:30000});const value=q.isError?'Lỗi':q.isLoading?'…':Number(q.data).toLocaleString('vi-VN');return <span className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-amber-200 bg-yellow-50 px-3 py-2 text-sm font-semibold tabular-nums" aria-label={'Số dư Xu: '+value} title={q.isError?'Không tải được số dư':'Số dư Xu'}><Coins aria-hidden="true" className="h-5 w-5 shrink-0 text-amber-500"/><span>{value}</span></span>;}
