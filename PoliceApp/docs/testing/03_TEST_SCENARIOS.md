# TEST SCENARIOS — PoliceApp
Task ID: TASK-2026-002 | Version: v1.0 | Date: 2026-03-10

---

## LEGEND

| Symbol | Meaning |
|---|---|
| ✅ | Pass criterion |
| ❌ | Fail / Error expected |
| 🔑 | Pre-condition required |
| 📱 | Mobile action |

---

## TS-001: AUTHENTICATION FLOW

### TS-001-01: Đăng nhập thành công — CA (không MFA)
🔑 user ca001 tồn tại, không có MFA bật  
📱 Nhập username: `ca001`, password: `123456` → Tap [ĐĂNG NHẬP]  
✅ Điều hướng đến `/ca/home`  
✅ Header hiển thị "Trang chủ"  
✅ Bottom nav có 5 tabs: Trang chủ, DQTV, Bản đồ, Nhiệm vụ, Cá nhân  

### TS-001-02: Đăng nhập thành công — DQTV (không MFA)
🔑 user dqtv001 tồn tại, không có MFA bật  
📱 Nhập username: `dqtv001`, password: `123456` → Tap [ĐĂNG NHẬP]  
✅ Điều hướng đến `/dqtv/home`  
✅ Bottom nav có 5 tabs: Trang chủ, Nhiệm vụ, Chấm công, Báo cáo, Cá nhân  

### TS-001-03: Đăng nhập sai mật khẩu
📱 Nhập username: `ca001`, password: `wrong` → Tap [ĐĂNG NHẬP]  
✅ Snackbar/Toast hiển thị "Sai tên đăng nhập hoặc mật khẩu"  
✅ Không điều hướng  
✅ Form vẫn hiển thị, không clear password  

### TS-001-04: Đăng nhập thiếu username
📱 Để trống username, nhập password → Tap [ĐĂNG NHẬP]  
✅ Hiển thị "Tên đăng nhập không được để trống" dưới field  
✅ Không gọi API  

### TS-001-05: Đăng nhập có MFA → OTP screen
🔑 user có MFA bật  
📱 Đăng nhập thành công  
✅ Điều hướng đến OTP screen  
✅ Field OTP hiển thị  

### TS-001-06: OTP đúng → vào app
📱 Nhập đúng OTP 6 số  
✅ Điều hướng đến home tương ứng role  

### TS-001-07: OTP sai
📱 Nhập OTP sai  
✅ Hiển thị "Mã OTP không hợp lệ hoặc đã hết hạn"  
✅ Không điều hướng  

### TS-001-08: Đăng xuất
📱 Profile screen → Tap [ĐĂNG XUẤT]  
✅ Clear access_token, refresh_token, user_id, user_role từ secure storage  
✅ Điều hướng về `/login`  

---

## TS-002: GPS CHECK-IN (DQTV)

### TS-002-01: Check-in hợp lệ (distance ≤ 15m)
🔑 DQTV đã đăng nhập, chưa check-in hôm nay, vị trí trong bán kính 15m  
📱 Vào CheckIn screen → Tap [CHECK IN]  
✅ Button ENABLED (distance ≤ 15m)  
✅ POST /attendance/check-in gọi thành công  
✅ Hiển thị ✅ "Đã check-in: HH:MM"  
✅ Button đổi sang [CHECK OUT]  

### TS-002-02: Check-in ngoài phạm vi (distance > 15m)
🔑 Vị trí thực tế > 15m so với đơn vị  
📱 Vào CheckIn screen  
✅ Button [CHECK IN] bị disabled  
✅ Hiển thị "Bạn đang ngoài phạm vi (X.Xm)" màu #EF4444  

### TS-002-03: Biên giới — đúng 15m
🔑 distance = 15.0m (mock GPS)  
✅ Button ENABLED  

### TS-002-04: Biên giới — 15.1m
🔑 distance = 15.1m  
✅ Button DISABLED  

### TS-002-05: Check-in muộn (sau 08:30)
🔑 Thời điểm = 08:31  
📱 Check-in  
✅ POST thành công  
✅ SnackBar vàng "Bạn đã check-in muộn"  
✅ Core lưu status = 'late', is_late = true  

### TS-002-06: Đúng 08:30 — không muộn
🔑 Thời điểm = 08:30  
✅ Check-in status = 'checked_in', is_late = false  

### TS-002-07: Check-out hợp lệ (≥ 17:00)
🔑 Đã check-in, thời điểm ≥ 17:00  
📱 Tap [CHECK OUT]  
✅ POST /attendance/check-out thành công  
✅ Hiển thị ✅ "Đã check-out: HH:MM · X.X giờ"  

### TS-002-08: Check-out sớm (< 17:00)
🔑 Thời điểm = 16:59  
✅ Core lưu status = 'early_leave'  
✅ SnackBar thông báo về giờ check-out sớm  

### TS-002-09: Check-in 2 lần trong ngày
📱 Check-in lần 2 trong cùng ngày  
✅ Core trả về 400 "Bạn đã điểm danh hôm nay rồi"  
✅ SnackBar red hiển thị message  

---

## TS-003: GPS TRACKING (CA)

### TS-003-01: CA xem bản đồ GPS
🔑 CA đăng nhập, có DQTV đang online  
📱 Tap tab [Bản đồ]  
✅ GET /gps/team gọi thành công  
✅ flutter_map hiển thị markers của DQTV  
✅ DQTV online: marker xanh #10B981  
✅ DQTV offline: marker xám #94A3B8  

### TS-003-02: DQTV gửi GPS update — CA nhận realtime
🔑 CA đang xem Bản đồ, DQTV gửi location  
✅ Socket.IO event `location_update` nhận được  
✅ Marker trên map cập nhật vị trí mới  
✅ Không cần refresh thủ công  

### TS-003-03: DQTV GPS update — foreground 30s
🔑 DQTV đã check-in, app foreground  
✅ Timer.periodic 30 giây gọi POST /gps/update  
✅ gps_latest được upsert  

### TS-003-04: Tap marker DQTV — xem thông tin
📱 Tap vào marker trên bản đồ  
✅ Bottom sheet xuất hiện  
✅ Hiển thị: tên, mã, vị trí, tốc độ, battery, task đang làm  

### TS-003-05: DQTV chuyển trạng thái moving
🔑 speed > 0.5 m/s  
✅ Marker màu vàng #F59E0B  

---

## TS-004: TASKS

### TS-004-01: CA tạo nhiệm vụ thành công
🔑 CA đăng nhập, có DQTV trong hệ thống  
📱 Tab Nhiệm vụ → điền đầy đủ form  
✅ POST /tasks thành công  
✅ SnackBar "Đã giao nhiệm vụ thành công"  
✅ Screen pop  
✅ Task xuất hiện trong danh sách DQTV  

### TS-004-02: CA tạo task — thiếu type
📱 Không chọn loại nhiệm vụ → Tap [GIAO]  
✅ Hiển thị "Vui lòng chọn loại nhiệm vụ"  
✅ Không gọi API  

### TS-004-03: CA tạo task — deadline quá khứ
📱 Chọn deadline = hôm qua  
✅ Hiển thị "Hạn hoàn thành phải sau thời điểm hiện tại"  

### TS-004-04: CA tạo task — không chọn người thực hiện
📱 Không chọn assignee  
✅ Hiển thị "Vui lòng chọn ít nhất 1 người thực hiện"  

### TS-004-05: DQTV xem danh sách nhiệm vụ
🔑 DQTV có task được giao  
📱 Tab Nhiệm vụ  
✅ GET /tasks hiển thị chỉ task của DQTV này  
✅ Filter tabs hoạt động  

### TS-004-06: DQTV tiếp nhận nhiệm vụ
📱 Tap task status=assigned → Tap [TIẾP NHẬN]  
✅ POST /tasks/:id/accept  
✅ Status chuyển sang 'accepted'  
✅ Badge màu thay đổi  

### TS-004-07: DQTV cập nhật tiến độ
📱 Task detail → kéo slider → Tap [CẬP NHẬT]  
✅ POST /tasks/:id/progress  
✅ Progress bar cập nhật  

### TS-004-08: DQTV nộp báo cáo hoàn thành
📱 Tap [NỘP BÁO CÁO HOÀN THÀNH] → xác nhận  
✅ POST /tasks/:id/report  
✅ Task status = 'completed'  
✅ Hiển thị ✅ trên danh sách  

---

## TS-005: LEAVE REQUESTS (CA)

### TS-005-01: CA duyệt đơn nghỉ phép
🔑 Có đơn status=pending  
📱 Tab Approvals → Tap [DUYỆT]  
✅ POST /leave-requests/:id/decision { action: 'approved' }  
✅ Đơn chuyển sang tab "Đã duyệt"  
✅ SnackBar "Đã duyệt đơn nghỉ phép"  

### TS-005-02: CA từ chối đơn — nhập lý do
📱 Tap [TỪ CHỐI] → Dialog xuất hiện → nhập lý do → Tap [XÁC NHẬN]  
✅ POST /leave-requests/:id/decision { action: 'rejected', reason: '...' }  
✅ Đơn chuyển sang tab "Từ chối"  

### TS-005-03: CA từ chối — thiếu lý do
📱 Tap [TỪ CHỐI] → để trống lý do → Tap [XÁC NHẬN]  
✅ Hiển thị "Vui lòng nhập lý do từ chối"  
✅ Không gọi API  

### TS-005-04: Duyệt đơn đã được xử lý
🔑 Đơn đã approved hoặc rejected  
📱 Cố tình call API lần 2  
✅ Core trả 400 "Không thể xử lý đơn này"  
✅ SnackBar red hiển thị  

---

## TS-006: WORK REPORTS (DQTV)

### TS-006-01: DQTV gửi báo cáo hàng ngày
📱 Tab Báo cáo → tab "Hàng ngày" → nhập nội dung → Tap [GỬI]  
✅ POST /reports thành công  
✅ Báo cáo xuất hiện trong danh sách "Đã gửi"  
✅ Status: Chờ duyệt #F59E0B  

### TS-006-02: Gửi báo cáo — thiếu nội dung
📱 Để trống content → Tap [GỬI]  
✅ Hiển thị "Nội dung báo cáo không được để trống"  

### TS-006-03: Gửi báo cáo có ảnh
📱 Chọn 2 ảnh (≤ 5MB mỗi ảnh) → Tap [GỬI]  
✅ Ảnh được gửi kèm  
✅ Hiển thị thumbnail trong danh sách đã gửi  

### TS-006-04: Quá 5 ảnh
📱 Chọn ảnh thứ 6  
✅ Hiển thị "Tối đa 5 ảnh"  
✅ Không thể thêm ảnh thứ 6  

### TS-006-05: Ảnh quá 5MB
📱 Chọn ảnh > 5MB  
✅ Hiển thị "Ảnh quá lớn (tối đa 5MB mỗi ảnh)"  
✅ Ảnh không được thêm vào  

### TS-006-06: Voice input
📱 Tap [🎤] → nói → dừng  
✅ Text được append vào content field  

---

## TS-007: ALERTS (CA)

### TS-007-01: CA xem danh sách cảnh báo
🔑 Có alerts trong hệ thống  
📱 Tab Home → Cảnh báo hoặc màn hình Alerts  
✅ GET /alerts?status=active  
✅ Hiển thị severity badge màu đúng  
✅ Unread count hiển thị  

### TS-007-02: CA xử lý cảnh báo
📱 Tap [XỬ LÝ] → nhập ghi chú → Xác nhận  
✅ POST /alerts/:id/resolve  
✅ Alert chuyển tab "Đã xử lý"  
✅ SnackBar "Đã xử lý cảnh báo"  

### TS-007-03: Xử lý cảnh báo — ghi chú tùy chọn
📱 Tap [XỬ LÝ] → để trống ghi chú → Xác nhận  
✅ Vẫn gọi API thành công (ghi chú là optional)  

---

## TS-008: DQTV MANAGEMENT (CA)

### TS-008-01: CA xem danh sách DQTV
📱 Tab DQTV  
✅ GET /users?role=militia  
✅ Mỗi card hiển thị: tên, mã, KPI, status GPS  

### TS-008-02: CA tìm kiếm DQTV
📱 Nhập tên vào search box (debounce 500ms)  
✅ GET /users?role=militia&search=keyword  
✅ Danh sách lọc  

### TS-008-03: CA xem hồ sơ DQTV
📱 Tap vào card DQTV  
✅ Điều hướng đến `/ca/dqtv/:id`  
✅ Hiển thị đầy đủ thông tin profile  

### TS-008-04: CA filter DQTV theo status
📱 Tap [Đang trực ●]  
✅ GET /users?role=militia&status=active  
✅ Chỉ hiện DQTV online  

---

## TS-009: REPORTS TEAM (CA)

### TS-009-01: CA xem báo cáo đội tháng hiện tại
📱 Tab Home → Reports  
✅ GET /reports/team?year=2026&month=3  
✅ Hiển thị task stats, attendance stats, kpi stats  
✅ Completion rate = completedTasks/totalTasks * 100  

### TS-009-02: CA đổi tháng xem báo cáo
📱 Tap dropdown [Tháng 3/2026] → chọn tháng 2  
✅ GET /reports/team?year=2026&month=2  
✅ Data cập nhật  

---

## TS-010: TOKEN REFRESH

### TS-010-01: Token hết hạn — auto refresh
🔑 Access token hết hạn (15 min)  
📱 Thực hiện bất kỳ action nào  
✅ AuthInterceptor intercept 401  
✅ POST /auth/refresh với refresh_token  
✅ Lưu access_token mới  
✅ Retry request gốc  
✅ User không thấy gì xảy ra  

### TS-010-02: Refresh token hết hạn — logout
🔑 Cả access và refresh token đều hết hạn  
📱 Thực hiện bất kỳ action nào  
✅ AuthInterceptor nhận 401 từ /auth/refresh  
✅ Clear storage  
✅ Điều hướng về /login  
✅ Hiển thị "Phiên đăng nhập hết hạn"  

---

## TS-011: NOTIFICATIONS

### TS-011-01: Xem thông báo
📱 Tap 🔔 bell icon  
✅ GET /notifications  
✅ Unread có dot xanh  

### TS-011-02: Đánh dấu đã đọc 1
📱 Tap vào notification  
✅ POST /notifications/:id/read  
✅ Dot xanh biến mất  

### TS-011-03: Đọc tất cả
📱 Tap [Đọc tất cả]  
✅ POST /notifications/read-all  
✅ Tất cả đã đọc, count = 0  

---

## TS-012: ERROR HANDLING

### TS-012-01: Mất mạng
🔑 Tắt WiFi/mobile data  
📱 Thực hiện bất kỳ action nào  
✅ DioException: ConnectionTimeout hoặc NetworkError  
✅ SnackBar "Lỗi kết nối mạng. Kiểm tra internet."  
✅ Retry button xuất hiện  

### TS-012-02: 500 Server Error
🔑 Server gặp lỗi  
✅ Dialog hoặc Snackbar "Lỗi hệ thống, vui lòng thử lại sau"  

### TS-012-03: 403 Forbidden
🔑 Gọi endpoint không có quyền  
✅ Snackbar "Không có quyền thực hiện thao tác này"  

### TS-012-04: 404 Not Found
🔑 Task/user bị xóa  
✅ Navigate back + Snackbar "Không tìm thấy dữ liệu"  

---

## TS-013: NAVIGATION

### TS-013-01: Deep link redirect khi chưa login
🔑 Chưa đăng nhập  
📱 Mở app trực tiếp  
✅ GoRouter redirect về /login  

### TS-013-02: Redirect sau login theo role
✅ CA → /ca/home  
✅ DQTV → /dqtv/home  

### TS-013-03: Back button từ detail screen
📱 Tap ← back từ TaskDetail  
✅ Pop về danh sách, data không bị mất  

---

## TEST DATA

| User | Role | Password | MFA | Notes |
|---|---|---|---|---|
| ca001 | police_area | 123456 | optional | Trung úy Võ Văn Tân |
| dqtv001 | militia | 123456 | optional | Nguyễn Văn An |
| dqtv002 | militia | 123456 | optional | Trần Thị Bình |
| dqtv003 | militia | 123456 | optional | Lê Văn C |

**GPS test coordinates (Phú Định, TP.HCM):**
- Unit location: 10.8231, 106.6297
- In-range (10m): 10.82319, 106.62971
- Out-of-range (20m): 10.82328, 106.62972
