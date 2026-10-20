-- TRUY VẾT DẤU VẾT ELECTRON. Chạy toàn bộ file trong Supabase SQL Editor.
create table rooms(id uuid primary key default gen_random_uuid(), code text unique not null, teacher_id uuid not null,
  phase text not null default 'lobby' check (phase in ('lobby','guide','task','review','confirm','done')),
  phase_ends_at timestamptz, pass_count int check (pass_count between 1 and 10), created_at timestamptz default now());
create table players(id uuid primary key default gen_random_uuid(), room_id uuid not null references rooms on delete cascade,
  user_id uuid not null, name text not null check (char_length(name) between 1 and 30), task_no int not null,
  attempts int not null default 0, last_answer text, hint_used boolean not null default false, hint_text text,
  joined_at timestamptz default now(), unique(room_id,user_id), unique(room_id,task_no));
create table tasks(no int primary key, title text, prompt text, kind text, labels text[]);
create table task_answers(no int primary key references tasks, answer text not null, hint text, explain text); -- KHÔNG có policy => client không đọc được
create table submissions(id bigserial primary key, room_id uuid not null references rooms on delete cascade,
  player_id uuid not null references players on delete cascade, answer text, correct boolean, after_hint boolean, created_at timestamptz default now());

insert into tasks values
(1,'Phân lớp s','Phân lớp s có bao nhiêu orbital và tối đa bao nhiêu electron?','pair','{"Số orbital","Số electron tối đa"}'),
(2,'Phân lớp p','Phân lớp p có bao nhiêu orbital và tối đa bao nhiêu electron?','pair','{"Số orbital","Số electron tối đa"}'),
(3,'Lớp thứ hai','Lớp thứ hai (n=2) chứa tối đa bao nhiêu electron theo công thức 2n²?','single','{"Số electron tối đa"}'),
(4,'Lớp thứ ba','Lớp thứ ba (n=3) chứa tối đa bao nhiêu electron theo công thức 2n²?','single','{"Số electron tối đa"}'),
(5,'Cấu hình O','Viết cấu hình electron của O (Z = 8).','config',null),
(6,'Cấu hình Na','Viết cấu hình electron của Na (Z = 11).','config',null),
(7,'Cấu hình Cl','Viết cấu hình electron của Cl (Z = 17).','config',null),
(8,'Cấu hình Ca','Viết cấu hình electron của Ca (Z = 20).','config',null),
(9,'Cấu hình 3p¹','Cấu hình 1s² 2s² 2p⁶ 3s² 3p¹. Tính tổng electron và số electron lớp ngoài cùng.','pair','{"Tổng electron","Electron lớp ngoài cùng"}'),
(10,'Cấu hình 3p⁵','Cấu hình 1s² 2s² 2p⁶ 3s² 3p⁵. Tính tổng electron và số electron lớp ngoài cùng.','pair','{"Tổng electron","Electron lớp ngoài cùng"}');
insert into task_answers values
(1,'1,2','Số electron tối đa của một orbital là 2 (spin ngược chiều).','Phân lớp s: 1 orbital × 2 = 2 electron.'),
(2,'3,6','Phân lớp p có 3 orbital; mỗi orbital chứa tối đa 2 electron.','Phân lớp p: 3 orbital × 2 = 6 electron.'),
(3,'8','Thay n = 2 vào 2n².','2·2² = 8.'),
(4,'18','Thay n = 3 vào 2n².','2·3² = 18.'),
(5,'1s2 2s2 2p4','Điền theo thứ tự 1s, 2s, 2p; 2p chứa tối đa 6.','8 electron: 2+2+4.'),
(6,'1s2 2s2 2p6 3s1','Sau 2p⁶ (đầy) là 3s.','11 electron: 2+2+6+1.'),
(7,'1s2 2s2 2p6 3s2 3p5','Điền 3s trước 3p.','17 electron: 2+2+6+2+5.'),
(8,'1s2 2s2 2p6 3s2 3p6 4s2','Mức năng lượng 4s thấp hơn 3d, nên 4s được điền trước.','20 electron: 2+2+6+2+6+2.'),
(9,'13,3','Tổng electron = cộng số mũ; lớp ngoài cùng là lớp n lớn nhất.','Tổng 2+2+6+2+1 = 13; lớp 3 có 2+1 = 3.'),
(10,'17,7','Tổng electron = cộng số mũ; lớp ngoài cùng là lớp n lớn nhất.','Tổng 2+2+6+2+5 = 17; lớp 3 có 2+5 = 7.');

create function norm(t text) returns text language sql immutable as
$$ select translate(lower(coalesce(t,'')),'⁰¹²³⁴⁵⁶⁷⁸⁹^ ','0123456789') $$;
create function is_member(r uuid) returns boolean language sql security definer stable set search_path=public as
$$ select exists(select 1 from players where room_id=r and user_id=auth.uid()) or exists(select 1 from rooms where id=r and teacher_id=auth.uid()) $$;
create function is_teacher(r uuid) returns boolean language sql security definer stable set search_path=public as
$$ select exists(select 1 from rooms where id=r and teacher_id=auth.uid()) $$;

alter table rooms enable row level security; alter table players enable row level security;
alter table tasks enable row level security; alter table task_answers enable row level security; alter table submissions enable row level security;
create policy rooms_read on rooms for select to authenticated using (is_member(id));
create policy players_read on players for select to authenticated using (is_member(room_id));
create policy tasks_read on tasks for select to authenticated using (true);
create policy subs_read on submissions for select to authenticated using (is_teacher(room_id) or player_id in (select id from players where user_id=auth.uid()));
-- Không có policy insert/update/delete: mọi thay đổi đi qua RPC security definer bên dưới.
alter publication supabase_realtime add table rooms, players;

create function create_room(p_pass int default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare c text; r uuid; begin
 loop c:=upper(substr(translate(encode(gen_random_bytes(6),'base64'),'+/=OI01',''),1,6));
  exit when length(c)=6 and not exists(select 1 from rooms where code=c); end loop;
 insert into rooms(code,teacher_id,pass_count) values(c,auth.uid(),p_pass) returning id into r;
 return jsonb_build_object('id',r,'code',c); end $$;

create function join_room(p_code text, p_name text) returns uuid language plpgsql security definer set search_path=public as $$
declare r rooms; t int; begin
 select * into r from rooms where code=upper(trim(p_code)) for update;
 if r.id is null then raise exception 'Không tìm thấy phòng'; end if;
 if exists(select 1 from players where room_id=r.id and user_id=auth.uid()) then return r.id; end if; -- kết nối lại
 if r.phase<>'lobby' then raise exception 'Phòng đã bắt đầu'; end if;
 select min(g) into t from generate_series(1,10) g where g not in (select task_no from players where room_id=r.id);
 if t is null then raise exception 'Phòng đã đủ 10 người'; end if;
 insert into players(room_id,user_id,name,task_no) values(r.id,auth.uid(),left(trim(p_name),30),t);
 return r.id; end $$;

create function advance(p_room uuid) returns void language plpgsql security definer set search_path=public as $$
declare r rooms; nx text; begin
 select * into r from rooms where id=p_room and teacher_id=auth.uid() for update;
 if r.id is null then raise exception 'forbidden'; end if;
 nx:=case r.phase when 'lobby' then 'guide' when 'guide' then 'task' when 'task' then 'review' when 'review' then 'confirm' when 'confirm' then 'done' end;
 if nx is null then return; end if;
 if nx='guide' and not exists(select 1 from players where room_id=p_room) then raise exception 'Chưa có người chơi'; end if;
 update rooms set phase=nx, phase_ends_at=case nx when 'guide' then now()+interval '30 s' when 'task' then now()+interval '180 s'
   when 'review' then now()+interval '90 s' when 'confirm' then now()+interval '60 s' end where id=p_room; end $$;

create function set_pass(p_room uuid, p_n int) returns void language plpgsql security definer set search_path=public as $$
begin update rooms set pass_count=p_n where id=p_room and teacher_id=auth.uid(); end $$;

create function reset_room(p_room uuid) returns void language plpgsql security definer set search_path=public as $$
begin if not is_teacher(p_room) then raise exception 'forbidden'; end if;
 delete from submissions where room_id=p_room;
 update players set attempts=0,last_answer=null,hint_used=false,hint_text=null where room_id=p_room;
 update rooms set phase='lobby',phase_ends_at=null where id=p_room; end $$;

create function submit(p_room uuid, p_answer text) returns boolean language plpgsql security definer set search_path=public as $$
declare r rooms; p players; ok boolean; last text; begin
 select * into r from rooms where id=p_room;
 select * into p from players where room_id=p_room and user_id=auth.uid() for update;
 if p.id is null then raise exception 'forbidden'; end if;
 if r.phase not in ('task','review') or r.phase_ends_at<now() then raise exception 'Đã hết thời gian nộp'; end if;
 if length(p_answer)>100 then raise exception 'Đáp án quá dài'; end if;
 select norm(answer) into last from submissions where player_id=p.id order by id desc limit 1;
 ok:=norm(p_answer)=(select norm(answer) from task_answers where no=p.task_no);
 if last is not distinct from norm(p_answer) then return ok; end if; -- nộp lặp: bỏ qua
 insert into submissions(room_id,player_id,answer,correct,after_hint) values(p_room,p.id,p_answer,ok,p.hint_used);
 update players set attempts=attempts+1,last_answer=p_answer where id=p.id; return ok; end $$;

create function use_hint(p_room uuid) returns text language plpgsql security definer set search_path=public as $$
declare p players; h text; r rooms; begin
 select * into r from rooms where id=p_room;
 select * into p from players where room_id=p_room and user_id=auth.uid() for update;
 if p.id is null or p.hint_used or p.attempts=0 or r.phase not in ('task','review') then raise exception 'Chưa thể dùng hỗ trợ'; end if;
 select hint into h from task_answers where no=p.task_no;
 update players set hint_used=true,hint_text=h where id=p.id; return h; end $$;

create function summary(p_room uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare r rooms; me players; show boolean; n int; d int; req int; begin
 select * into r from rooms where id=p_room;
 if r.id is null or not is_member(p_room) then raise exception 'forbidden'; end if;
 show:=r.teacher_id=auth.uid() or r.phase in ('review','confirm','done');
 select * into me from players where room_id=p_room and user_id=auth.uid();
 select count(*) into n from players where room_id=p_room;
 select count(*) into d from players p where room_id=p_room and coalesce((select s.correct from submissions s where s.player_id=p.id order by s.id desc limit 1),false);
 req:=coalesce(r.pass_count, ceil(0.7*n)::int);
 return jsonb_build_object('room',to_jsonb(r)-'teacher_id','now',now(),'is_teacher',r.teacher_id=auth.uid(),
  'me',case when me.id is null then null else to_jsonb(me)-'user_id' end,'n',n,'required',req,
  'done',case when show then d end,'passed',case when show then n>0 and d>=req end,
  'explain',case when me.id is not null and r.phase in ('review','confirm','done') then (select explain from task_answers where no=me.task_no) end,
  'players',(select coalesce(jsonb_agg(jsonb_build_object('name',p.name,'task_no',p.task_no,'attempts',p.attempts,'hint',p.hint_used,
    'correct',case when show then coalesce((select s.correct from submissions s where s.player_id=p.id order by s.id desc limit 1),false) end) order by p.task_no),'[]')
    from players p where p.room_id=p_room)); end $$;
