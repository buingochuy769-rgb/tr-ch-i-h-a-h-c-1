import {useCallback,useEffect,useState} from 'react'
import {createClient} from '@supabase/supabase-js'
const sb=createClient(import.meta.env.VITE_SUPABASE_URL,import.meta.env.VITE_SUPABASE_ANON_KEY)
const LBL:Record<string,string>={lobby:'Phòng chờ',guide:'Hướng dẫn',task:'Làm nhiệm vụ',review:'Kiểm tra & sửa sai',confirm:'Xác nhận',done:'Tổng kết'}
const NEXT:Record<string,string>={lobby:'Bắt đầu hướng dẫn',guide:'Bắt đầu nhiệm vụ',task:'Chuyển sang kiểm tra',review:'Sang xác nhận',confirm:'Kết thúc & xem tổng kết'}
const SUP='⁰¹²³⁴⁵⁶⁷⁸⁹'; const sup=(n:number)=>String(n).split('').map(c=>SUP[+c]).join('')
const card='rounded-2xl bg-white/5 border border-violet-400/20 p-4 backdrop-blur'
const btn='rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 px-4 py-2 font-semibold'
const inp='w-full rounded-xl bg-slate-900 border border-violet-400/30 px-3 py-2 text-lg'
type S=any

function useRoom(id:string|null){
  const [s,setS]=useState<S>(null); const [off,setOff]=useState(0); const [err,setErr]=useState('')
  const load=useCallback(async()=>{ if(!id) return
    const {data,error}=await sb.rpc('summary',{p_room:id})
    if(error){setErr(error.message);return}; setErr(''); setS(data); setOff(Date.parse(data.now)-Date.now())},[id])
  useEffect(()=>{ if(!id) return; load()
    const ch=sb.channel('room-'+id)
      .on('postgres_changes',{event:'*',schema:'public',table:'rooms',filter:`id=eq.${id}`},load)
      .on('postgres_changes',{event:'*',schema:'public',table:'players',filter:`room_id=eq.${id}`},load).subscribe()
    const t=setInterval(load,5000); const v=()=>document.visibilityState==='visible'&&load()
    document.addEventListener('visibilitychange',v); window.addEventListener('online',load)
    return()=>{sb.removeChannel(ch);clearInterval(t);document.removeEventListener('visibilitychange',v);window.removeEventListener('online',load)}},[id,load])
  return {s,off,err,load}}

function parse(t:string){const m:Record<string,number>={}
  for(const x of t.toLowerCase().matchAll(/(\d[sp])\s*\^?\s*([0-9⁰¹²³⁴⁵⁶⁷⁸⁹]+)/g)) m[x[1]]=+x[2].split('').map(c=>SUP.includes(c)?SUP.indexOf(c):c).join('');return m}
const SUBS=['1s','2s','2p','3s','3p','4s']
function ConfigBuilder({v,set,off}:{v:string;set:(s:string)=>void;off:boolean}){
  const c=parse(v); const fmt=(m:Record<string,number>)=>SUBS.filter(k=>m[k]>0).map(k=>k+sup(m[k])).join(' ')
  const bump=(k:string,d:number)=>{const cap=k[1]==='s'?2:6; set(fmt({...c,[k]:Math.max(0,Math.min(cap,(c[k]||0)+d))}))}
  return <div className="space-y-2">
    <input className={inp} value={v} disabled={off} onChange={e=>set(e.target.value)} placeholder="vd: 1s² 2s² 2p⁴ (hoặc 1s2 2s2 2p4)"/>
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{SUBS.map(k=>{const e=c[k]||0,o=k[1]==='s'?1:3,cap=o*2
      return <div key={k} className={card+' !p-2'}><div className="flex justify-between items-center"><b>{k}</b>
        <span><button disabled={off} onClick={()=>bump(k,-1)} className="px-2">−</button><span className={e>cap?'text-red-400':''}>{e}/{cap}</span><button disabled={off} onClick={()=>bump(k,1)} className="px-2">+</button></span></div>
        <div className="flex gap-1 mt-1">{Array.from({length:o},(_,i)=><div key={i} className="w-9 h-9 border border-cyan-300/60 rounded flex items-center justify-center text-cyan-200">
          {e>i?'↑':''}{e>o+i?'↓':''}</div>)}</div></div>})}</div>
    <p className="text-xs text-slate-400">Mỗi orbital tối đa 2 electron, spin ngược chiều (↑↓). Điền orbital trống trước khi ghép đôi.</p></div>}

function Task({room,s,task,left}:{room:string;s:S;task:S;left:number}){
  const me=s.me; const open=['task','review'].includes(s.room.phase)&&left>0
  const [parts,setParts]=useState<string[]>(()=>(me.last_answer||'').split(',')); const [cfg,setCfg]=useState(me.last_answer||'')
  const [msg,setMsg]=useState(''); const [hint,setHint]=useState(me.hint_text||'')
  const ans=task.kind==='config'?cfg:parts.join(',')
  const send=async()=>{const {data,error}=await sb.rpc('submit',{p_room:room,p_answer:ans}); setMsg(error?error.message:data?'✔ Chính xác':'✘ Chưa đúng, hãy kiểm tra lại')}
  const help=async()=>{const {data,error}=await sb.rpc('use_hint',{p_room:room}); error?setMsg(error.message):setHint(data)}
  return <div className={card+' space-y-3'}><div className="text-sm text-cyan-300">Nhiệm vụ {task.no}: {task.title}</div><p className="text-lg">{task.prompt}</p>
    {task.kind==='config'?<ConfigBuilder v={cfg} set={setCfg} off={!open}/>:
      (task.labels as string[]).map((l,i)=><label key={i} className="block text-sm">{l}<input inputMode="numeric" className={inp} disabled={!open} value={parts[i]||''}
        onChange={e=>{const p=[...parts];p[i]=e.target.value.replace(/\D/g,'');setParts(p)}}/></label>)}
    <div className="flex gap-2 flex-wrap"><button className={btn} disabled={!open||!ans.trim()} onClick={send}>Nộp bài</button>
      <button className={btn+' !bg-cyan-700'} disabled={!open||me.attempts<1||me.hint_used&&!hint} onClick={help}>Quyền hỗ trợ (1 lần)</button></div>
    {msg&&<p className={msg.startsWith('✔')?'text-emerald-300':'text-amber-300'}>{msg}</p>}
    {hint&&<p className="text-cyan-200">💡 {hint}</p>}{s.explain&&<p className="text-emerald-200">📘 {s.explain}</p>}
    <p className="text-xs text-slate-400">Số lần nộp: {me.attempts}{me.hint_used&&' · đã dùng hỗ trợ'}</p></div>}

function Results({s}:{s:S}){const show=s.done!==null&&s.done!==undefined
  return <div className={card}><div className="text-xl font-bold mb-2">{show?`${s.done}/${s.n} đúng · cần ≥ ${s.required} · ${Math.round(100*s.done/Math.max(1,s.n))}%`:`${s.n} điều tra viên · cần ≥ ${s.required} đúng`}
    {show&&<span className={'ml-3 '+(s.passed?'text-emerald-300':'text-amber-300')}>{s.passed?'ĐẠT':'CHỜ XÁC MINH BỔ SUNG'}</span>}</div>
    <table className="w-full text-sm"><tbody>{s.players.map((p:S)=><tr key={p.task_no} className="border-t border-white/10"><td className="py-1">NV{p.task_no}</td><td>{p.name}</td><td>{p.attempts} lần{p.hint&&' · hỗ trợ'}</td>
      <td className="text-right">{p.correct===null?'…':p.correct?'✔':'✘'}</td></tr>)}</tbody></table></div>}

function Room({id,leave}:{id:string;leave:()=>void}){
  const {s,off,err,load}=useRoom(id); const [tasks,setTasks]=useState<S[]>([]); const [now,setNow]=useState(Date.now())
  useEffect(()=>{sb.from('tasks').select('*').order('no').then(r=>setTasks(r.data||[]))},[])
  useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),250);return()=>clearInterval(t)},[])
  if(!s) return <p>{err||'Đang tải…'} {err&&<button className="underline" onClick={leave}>Thoát</button>}</p>
  const ph=s.room.phase, left=s.room.phase_ends_at?Math.max(0,Math.ceil((Date.parse(s.room.phase_ends_at)-(now+off))/1000)):0
  const rpc=async(f:string,a:S)=>{const {error}=await sb.rpc(f,a); if(error) alert(error.message); load()}
  const link=`${location.origin}/?code=${s.room.code}`
  return <div className="space-y-3">
    <div className="flex justify-between items-center flex-wrap gap-2"><div><span className="text-slate-400">Mã phòng</span> <b className="text-2xl tracking-widest text-cyan-300">{s.room.code}</b></div>
      <div className="text-lg">{LBL[ph]} {s.room.phase_ends_at&&ph!=='done'&&<b className="font-mono text-violet-300">{Math.floor(left/60)}:{String(left%60).padStart(2,'0')}</b>}</div></div>
    {err&&<p className="text-amber-300">⚠ Mất kết nối, đang thử lại…</p>}
    {s.is_teacher&&<div className={card+' space-y-2'}><div className="flex gap-2 flex-wrap items-center">
      {NEXT[ph]&&<button className={btn} onClick={()=>rpc('advance',{p_room:id})}>{NEXT[ph]}</button>}
      <label className="text-sm">Số người cần đúng <select className="bg-slate-900 rounded p-1" value={s.room.pass_count||''} onChange={e=>rpc('set_pass',{p_room:id,p_n:+e.target.value})}>
        <option value="">70% (tự động)</option>{[...Array(10)].map((_,i)=><option key={i} value={i+1}>{i+1}</option>)}</select></label>
      <button className={btn+' !bg-slate-700'} onClick={()=>rpc('reset_room',{p_room:id})}>Chơi lại (cùng phòng)</button>
      <button className={btn+' !bg-slate-700'} onClick={leave}>Tạo phòng mới</button></div>
      <div className="text-sm break-all">Link: <button className="underline" onClick={()=>navigator.clipboard.writeText(link)}>{link} (sao chép)</button></div></div>}
    {ph==='lobby'&&<div className={card}>Đã có {s.n}/10 điều tra viên: {s.players.map((p:S)=>p.name).join(', ')||'—'}<p className="text-slate-400 text-sm">Đợi giáo viên bắt đầu…</p></div>}
    {ph==='guide'&&<div className={card}><h3 className="font-bold">Hướng dẫn</h3><ul className="list-disc ml-5"><li>s: 1 orbital · p: 3 orbital; mỗi orbital tối đa 2 electron (↑↓).</li><li>Lớp n chứa tối đa 2n² electron.</li><li>Điền theo thứ tự 1s 2s 2p 3s 3p 4s…</li></ul></div>}
    {!s.is_teacher&&s.me&&['task','review','confirm'].includes(ph)&&tasks.length>0&&<Task key={ph==='confirm'?'c':'t'} room={id} s={s} task={tasks.find(t=>t.no===s.me.task_no)} left={left}/>}
    {(s.is_teacher&&ph!=='lobby'||['review','confirm','done'].includes(ph)||ph==='lobby'&&false)&&<Results s={s}/>}
    {ph==='done'&&!s.is_teacher&&<button className={btn} onClick={leave}>Chơi lại / Vào phòng khác</button>}</div>}

export default function App(){
  const [ready,setReady]=useState(false); const [room,setRoom]=useState<string|null>(localStorage.getItem('room'))
  const [code,setCode]=useState(new URLSearchParams(location.search).get('code')||''); const [name,setName]=useState(''); const [pass,setPass]=useState('')
  useEffect(()=>{(async()=>{const {data}=await sb.auth.getSession(); if(!data.session) await sb.auth.signInAnonymously(); setReady(true)})()},[])
  const go=(id:string|null)=>{id?localStorage.setItem('room',id):localStorage.removeItem('room'); setRoom(id); history.replaceState(null,'','/')}
  const create=async()=>{const {data,error}=await sb.rpc('create_room',{p_pass:pass?+pass:null}); error?alert(error.message):go(data.id)}
  const join=async()=>{const {data,error}=await sb.rpc('join_room',{p_code:code,p_name:name}); error?alert(error.message):go(data)}
  return <div className="min-h-screen bg-gradient-to-b from-slate-950 via-indigo-950 to-slate-950 text-slate-100 p-4"><div className="max-w-3xl mx-auto space-y-4">
    <h1 className="text-2xl sm:text-3xl font-black text-cyan-300">⚛ TRUY VẾT DẤU VẾT ELECTRON</h1>
    {!ready?<p>Đang kết nối…</p>:room?<Room id={room} leave={()=>go(null)}/>:
    <div className="grid sm:grid-cols-2 gap-4"><div className={card+' space-y-2'}><h2 className="font-bold">Giáo viên: tạo phòng</h2>
      <select className={inp} value={pass} onChange={e=>setPass(e.target.value)}><option value="">Số người cần đúng: 70% tự động</option>{[...Array(10)].map((_,i)=><option key={i} value={i+1}>{i+1} người</option>)}</select>
      <button className={btn+' w-full'} onClick={create}>Tạo phòng</button></div>
     <div className={card+' space-y-2'}><h2 className="font-bold">Học sinh: tham gia</h2><input className={inp+' uppercase'} placeholder="Mã phòng" value={code} onChange={e=>setCode(e.target.value)}/>
      <input className={inp} placeholder="Tên / mã điều tra viên" maxLength={30} value={name} onChange={e=>setName(e.target.value)}/>
      <button className={btn+' w-full'} disabled={!code||!name.trim()} onClick={join}>Vào phòng</button></div></div>}</div></div>}
