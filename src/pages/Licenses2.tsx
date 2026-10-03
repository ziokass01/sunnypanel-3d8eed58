import {Navigate,useLocation} from 'react-router-dom';
export function Licenses2Page({create=false}:{create?:boolean}){const {search}=useLocation();const params=new URLSearchParams(search);if(create&&!params.has('timing'))params.set('timing','first_use');const query=params.toString();return <Navigate replace to={'/licenses'+(create?'/new':'')+(query?'?'+query:'')}/>;}
