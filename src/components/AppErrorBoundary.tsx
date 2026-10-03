import { Component,type ReactNode } from 'react';
export class AppErrorBoundary extends Component<{children:ReactNode},{failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 render(){if(!this.state.failed)return this.props.children;return <main role="alert" style={{maxWidth:560,margin:'48px auto',padding:24,fontFamily:'system-ui',lineHeight:1.6}}><h1 style={{fontSize:24}}>Trang chưa tải được</h1><p>Mã lỗi: APP_RENDER. Thử tải lại phiên bản mới.</p><button onClick={()=>{const url=new URL(window.location.href);url.searchParams.set('_reload',String(Date.now()));window.location.replace(url.href);}} style={{padding:'12px 20px',background:'#fbbf24',border:0,borderRadius:12,fontSize:16}}>Tải lại trang</button><p><a href="/free">Lấy key</a> · <a href="/reset-key">Reset key</a></p></main>;}
}
