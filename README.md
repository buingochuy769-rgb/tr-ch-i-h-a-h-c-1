# Truy Vết Dấu Vết Electron: hướng dẫn triển khai
1. supabase.com → New project. Authentication → Providers → bật **Anonymous sign-ins**.
2. SQL Editor → dán toàn bộ `supabase/schema.sql` → Run (tạo bảng, RLS, RPC, bật Realtime cho rooms/players).
3. Project Settings → API: lấy URL và **anon key** (KHÔNG dùng service_role). `cp .env.example .env` rồi điền.
4. Chạy thử: `npm i && npm run dev`; mở 2 trình duyệt/thiết bị khác nhau (1 giáo viên, vài học sinh).
5. Xuất bản: đẩy lên GitHub → vercel.com → Import → thêm 2 biến VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY → Deploy. Link Vercel là link truy cập.
Bảo mật: đáp án/gợi ý/giải thích nằm trong `task_answers` (không có policy → client không đọc được); chấm bài, hỗ trợ, đổi giai đoạn đều qua RPC kiểm tra quyền giáo viên và giờ máy chủ.
