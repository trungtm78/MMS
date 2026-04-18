# BUSINESS FLOW — PoliceApp
Task ID: TASK-2026-002 | Version: v1.0 | Date: 2026-03-10

---

## ACTORS

| Actor | Vai trò |
|---|---|
| **CA (Công an khu vực)** — role `police_area` | Quản lý DQTV, giao nhiệm vụ, theo dõi GPS, duyệt đơn nghỉ phép, xem báo cáo & cảnh báo |
| **DQTV (Dân Quân Tự Vệ)** — role `militia` | Nhận & thực hiện nhiệm vụ, chấm công GPS, gửi báo cáo công việc, xem hồ sơ |
| **Core Backend** (port 3001) | Xử lý auth/JWT/MFA, RBAC, lưu trữ toàn bộ dữ liệu, push notification FCM |
| **PoliceApp BFF** (port 3004) | Proxy thuần túy — không có logic riêng, không có DB riêng |
| **Firebase FCM** | Push notification đến thiết bị Android/iOS |
| **Socket.IO** | GPS tracking real-time (dùng chung Socket.IO của Core) |

---

## HAPPY PATHS

### LUỒNG 1 — CA Đăng nhập & vào Dashboard
1. CA mở app → Login screen (yellow gradient header, police logo, border đỏ)
2. Nhập `username` / `password` → POST `/auth/login`
3. Core trả `requiresMfa: true` + `tempToken`
4. CA nhập TOTP 6 số từ Microsoft Authenticator → POST `/auth/verify-mfa`
5. Core trả `accessToken` + `refreshToken` + `user { roles: ['police_area'] }`
6. App lưu tokens vào Flutter Secure Storage, lưu `user_role = police_area`
7. Router detect role → vào **CA Shell** (5 tabs: Trang chủ | DQTV | Bản đồ | Nhiệm vụ | Cá nhân)
8. Dashboard CA load song song: GET `/tasks`, GET `/users?role=militia`, GET `/alerts`, GET `/notifications`

### LUỒNG 2 — CA Giao nhiệm vụ
1. Nhấn Quick Action "Giao việc" → CreateTaskScreen
2. Chọn loại NV: Tuần tra / Xử lý sự vụ / Tuyên truyền / Hỗ trợ dân
3. Nhập tiêu đề, mô tả (có mic voice-to-text), chọn priority
4. Chọn địa điểm qua flutter_map picker + address input
5. Chọn ngày giờ bắt đầu & hạn hoàn thành
6. Tìm kiếm & chọn DQTV (GET `/users?role=militia`), có thể chọn nhiều
7. Nhấn "Gửi nhiệm vụ" → POST `/tasks`
8. Core tạo task + task_assignments, gửi FCM đến DQTV được giao
9. Success snackbar → quay về Dashboard

### LUỒNG 3 — CA Duyệt đơn nghỉ phép
1. Vào tab "Duyệt đơn" → GET `/leave-requests?status=pending`
2. List đơn theo 3 tabs: Chờ duyệt | Đã duyệt | Từ chối
3. Tap đơn → bottom sheet modal: thông tin DQTV, loại nghỉ, ngày, lý do, phép còn lại
4. Nhấn "Phê duyệt" → POST `/leave-requests/:id/decision { action: 'approved' }`
5. Core cập nhật status → approved, gửi FCM đến DQTV
6. Hoặc "Từ chối" → dialog nhập lý do → POST với `action: 'rejected', reason: '...'`
7. List refresh tự động, đơn chuyển sang tab tương ứng

### LUỒNG 4 — CA Theo dõi GPS real-time
1. Vào tab "Bản đồ" → GET `/gps/team` lấy snapshot vị trí hiện tại
2. Kết nối Socket.IO, listen event `location_update`
3. flutter_map OSM render markers: xanh=online, vàng=moving, xám=offline
4. DQTV gửi vị trí mỗi 30s → Socket.IO emit → marker di chuyển real-time
5. Tap marker → popup: tên, địa chỉ, tốc độ, pin, nhiệm vụ, 3 buttons Gọi/Nhắn tin/Chi tiết
6. Filter chips All/On Duty/Moving/Offline → ẩn/hiện markers
7. Bottom sheet hiển thị list DQTV đang online

### LUỒNG 5 — DQTV Đăng nhập & vào Dashboard
1. DQTV mở app → cùng Login screen (không có màn hình chọn role)
2. Nhập username/password → MFA flow tương tự CA
3. Core trả `user { roles: ['militia'] }`
4. Router detect → vào **DQTV Shell** (5 tabs: Trang chủ | Nhiệm vụ | Chấm công | Báo cáo | Cá nhân)
5. Dashboard DQTV load: GET `/tasks` (filter assignee), GET `/attendance/today`, GET `/kpi/current`

### LUỒNG 6 — DQTV Chấm công GPS
1. Vào tab "Chấm công" → GET `/attendance/today` xem trạng thái
2. Nhấn "Xác định vị trí" → Geolocator lấy tọa độ GPS
3. App tính khoảng cách đến đơn vị (threshold: ≤ 15m)
4. ≤ 15m: indicator xanh "Vị trí hợp lệ" → nút check-in enabled
5. Nhấn "Check-in ngay" → POST `/attendance/check-in { location: {lat,lng,accuracy}, source: 'mobile' }`
6. Hiển thị "Đã check-in lúc HH:MM", card đỏ chuyển sang state đã check-in
7. Cuối ca: nhấn "Check-out" → POST `/attendance/check-out`
8. Sau check-in: app bắt đầu gửi vị trí GPS mỗi 30s → POST `/gps/update`

### LUỒNG 7 — DQTV Gửi báo cáo công việc
1. Vào tab "Báo cáo" → chọn loại: Hàng ngày | Sự vụ | Tháng
2. Nhập địa điểm, nội dung (có mic voice-to-text)
3. Đính kèm ảnh từ gallery/camera (tối đa 5 ảnh, mỗi ảnh ≤ 5MB)
4. Nhấn "Gửi báo cáo" → POST `/reports { report_type, content, location, images[] }`
5. Success → list báo cáo gần đây cập nhật (GET `/reports/my`)

---

## EXCEPTIONS

| EX-ID | Điều kiện | Xử lý |
|---|---|---|
| EX-01 | Sai username/password | "Sai tên đăng nhập hoặc mật khẩu" — không lockout phía app |
| EX-02 | OTP sai/hết hạn | "Mã OTP không hợp lệ hoặc đã hết hạn" — cho retry hoặc dùng recovery code |
| EX-03 | Access token hết hạn (15 phút) | AuthInterceptor silent refresh → retry request gốc, transparent |
| EX-04 | Refresh token hết hạn (7 ngày) | Clear storage → force re-login "Phiên đăng nhập hết hạn" |
| EX-05 | GPS permission bị từ chối | Dialog hướng dẫn bật trong Settings |
| EX-06 | GPS xa hơn 15m | Indicator đỏ, nút check-in disabled, hiển thị khoảng cách thực |
| EX-07 | Mất mạng khi gửi request | Snackbar "Lỗi kết nối mạng" + Retry button |
| EX-08 | 403 thiếu permission | "Không có quyền thực hiện thao tác này" |
| EX-09 | DQTV đã check-in, check-in lần 2 | Core 400 "Bạn đã điểm danh hôm nay rồi" → app hiển thị toast |
| EX-10 | WebSocket GPS mất kết nối | Auto reconnect sau 3s, indicator "Đang kết nối lại..." |
| EX-11 | Role không xác định trong JWT | Logout + "Tài khoản không hợp lệ" |
| EX-12 | Từ chối đơn không nhập lý do | "Vui lòng nhập lý do từ chối" |
| EX-13 | Ảnh báo cáo > 5MB | "Ảnh quá lớn (tối đa 5MB mỗi ảnh)" |

---

## BUSINESS RULES

| BR-ID | Quy tắc | Điều kiện | Kết quả |
|---|---|---|---|
| BR-001 | GPS check-in hợp lệ | Khoảng cách từ đơn vị ≤ 15m | Check-in được phép |
| BR-002 | GPS check-in từ chối | Khoảng cách > 15m | Nút check-in disabled |
| BR-003 | MFA bắt buộc | Tất cả user mobile | Không thể bỏ qua bước MFA |
| BR-004 | Role routing CA | JWT roles chứa `police_area` | Vào CA Shell |
| BR-005 | Role routing DQTV | JWT roles chứa `militia` | Vào DQTV Shell |
| BR-006 | Tạo task | Permission `tasks:create` | POST /tasks thành công |
| BR-007 | Duyệt đơn | Permission `leave:approve` | POST /leave-requests/:id/decision |
| BR-008 | Token refresh | 401 + refresh token còn hạn | Silent refresh + retry |
| BR-009 | Xem DQTV | Permission `militia:view` | GET /users?role=militia |
| BR-010 | DQTV task visibility | API filter `assignee_id = currentUser.id` | Chỉ thấy task của mình |
| BR-011 | CA task visibility | Không filter by assignee | Thấy tất cả task trong unit |
| BR-012 | GPS update frequency | Sau check-in, app foreground | POST /gps/update mỗi 30 giây |
| BR-013 | Report image limit | Tối đa 5 ảnh, mỗi ảnh ≤ 5MB | Validate trước khi upload |
| BR-014 | Late check-in | Check-in sau 08:30 | Status = 'late' |
| BR-015 | Early check-out | Check-out trước 17:00 | Status = 'early_leave' |

---

## ASSUMPTIONS (đã confirm)

- [x] Core Backend port 3001 đang chạy với migrations 001–009
- [x] BFF PoliceApp/backend port 3004 — proxy thuần, không có logic/DB riêng
- [x] 1 Flutter app duy nhất, detect role từ JWT — không chọn role thủ công
- [x] flutter_map + OpenStreetMap (không cần API key)
- [x] Auth/login/MFA dùng nguyên Core API — không tạo endpoint riêng
- [x] CA cần KPI tổng hợp đội trong Reports screen
- [x] Chat dùng Core Socket.IO sẵn có — không build UI chat mới trong scope này
- [x] DQTV không tạo đơn nghỉ phép — CA chỉ duyệt đơn từ hệ thống khác

---

## SCOPE

**IN SCOPE:**
- Core Backend: migration 010 (work_reports) + routes mới (gps, alerts, reports, users list) + seed police_area role + user ca001
- PoliceApp BFF: Express proxy port 3004
- Flutter app: 2 role (CA + DQTV), 14+ screens, real API calls, GPS real-time, FCM

**OUT OF SCOPE:**
- Web admin panel, tạo/sửa/xóa user account
- DQTV tạo đơn nghỉ phép trong PoliceApp
- Xuất PDF báo cáo thực sự
- Payroll / lương
- Offline queue (chỉ retry thủ công qua snackbar)
- Chat UI (dùng Core có sẵn, không build UI trong scope)
