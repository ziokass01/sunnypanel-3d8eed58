import {usePanelRole} from '@/hooks/use-panel-role';
import {useQuery} from '@tanstack/react-query';
import {walletBalance} from './wallet-api';
export function ModeratorBalance(){const {userId}=usePanelRole();const q=useQuery({queryKey:['moderator-balance',userId],queryFn:walletBalance,refetchInterval:30000});return <span className="shrink-0 rounded-xl border bg-yellow-50 px-3 py-2 text-sm font-semibold" title={q.error?'Không tải được số dư':''}>{q.isError?'Xu: lỗi':q.isLoading?'Xu: …':Number(q.data).toLocaleString('vi-VN')+' Xu'}</span>;}
