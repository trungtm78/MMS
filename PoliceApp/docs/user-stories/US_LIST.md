# US_LIST — PoliceApp
Task ID: TASK-2026-002 | Version: v1.0 | Locked: 2026-03-10

---

## US-001: Đăng nhập CA (Công an khu vực)
```
Actor: CA | Goal: Đăng nhập vào app, xác thực 2 bước TOTP
Priority: Must | Size: M | BR-ref: BR-003, BR-004
UAT Risk: 🔴 HIGH

AC-1 (Happy):      Nhập đúng username/password + OTP 6 số hợp lệ
                   → accessToken + refreshToken lưu Secure Storage
                   → role='police_area' lưu storage
                   → Router vào CA Shell (5 tabs CA)
AC-2 (Sai pass):   Nhập sai password → "Sai tên đăng nhập hoặc mật khẩu"
                   → form không reset, cho nhập lại
AC-3 (MFA setup):  Lần đầu login chưa setup MFA → requiresMfaSetup=true
                   → redirect MfaSetupScreen (QR code + recovery codes)
                   → confirm OTP → vào CA Shell
AC-4 (OTP sai):    Nhập sai OTP → "Mã OTP không hợp lệ hoặc đã hết hạn"
                   → cho retry, không clear tempToken
AC-5 (Recovery):   Nhấn "Dùng mã khôi phục" → nhập recovery code
                   → POST /auth/verify-recovery → vào CA Shell
AC-6 (Auto refresh): Token 401 mid-session → AuthInterceptor silent refresh
                   → nếu refresh fail → clearAll + force re-login
```

---

## US-002: Đăng nhập DQTV
```
Actor: DQTV | Goal: Đăng nhập vào app, xác thực 2 bước TOTP
Priority: Must | Size: M | BR-ref: BR-003, BR-005
UAT Risk: 🔴 HIGH

AC-1 (Happy):      Nhập đúng username/password + OTP
                   → tokens lưu storage, role='militia'
                   → Router vào DQTV Shell (5 tabs DQTV)
AC-2 (Sai pass):   → "Sai tên đăng nhập hoặc mật khẩu"
AC-3 (MFA setup):  Chưa setup MFA → MfaSetupScreen → confirm → vào DQTV Shell
AC-4 (OTP sai):    → "Mã OTP không hợp lệ hoặc đã hết hạn"
AC-5 (Auto refresh): Token hết hạn → silent refresh; fail → force logout
```

---

## US-003: CA xem Dashboard tổng quan
```
Actor: CA | Goal: Xem nhanh tình trạng đội DQTV, tasks, cảnh báo
Priority: Must | Size: M | BR-ref: BR-011
UAT Risk: 🟢 LOW

AC-1 (Happy):      Dashboard load thành công:
                   - Stats 2-col: DQTV đang làm việc (xanh) + Chỉ tiêu TB (đỏ)
                   - Quick Actions 3×2: Giao việc/DQTV/GPS/Duyệt đơn/Báo cáo/Cảnh báo
                   - Status Overview horizontal scroll (Online/Nghỉ phép/Offline)
                   - Tasks Summary donut chart (SVG) + 3 legend
                   - Urgent Alerts list (border-l-4 đỏ, buttons Xem/Gọi)
                   - Recent Activity timeline
                   - FAB #366092 bottom-right
AC-2 (No data):    Chưa có task/alert → empty state icon + message tương ứng
AC-3 (API fail):   Bất kỳ API nào fail → snackbar "Lỗi tải dữ liệu" + Thử lại
AC-4 (Refresh):    Pull-to-refresh → reload tất cả API song song
```

---

## US-004: CA quản lý danh sách DQTV
```
Actor: CA | Goal: Xem, tìm kiếm, lọc danh sách DQTV trong đơn vị
Priority: Must | Size: M | BR-ref: BR-009
UAT Risk: 🟡 MED

AC-1 (Happy):      List cards DQTV: avatar circle, tên, mã số, phone,
                   status dot (xanh=online/vàng=away/đỏ=offline),
                   KPI score màu: ≥90=#10B981 / ≥80=#3B82F6 / ≥70=#F59E0B / <70=#EF4444
                   4 action buttons: Gọi / Nhắn tin / GPS / Hồ sơ
AC-2 (Search):     Nhập text → filter realtime client-side theo tên/mã số
AC-3 (Filter):     Chips Tổng/Hoạt động/Nghỉ phép/Offline → filter list
AC-4 (Detail):     Tap "Hồ sơ" → DQTVDetailScreen: GET /users/:id/militia-profile
AC-5 (Call):       Tap "Gọi" → launch tel:phoneNumber
AC-6 (GPS):        Tap "GPS" → navigate MapScreen highlight marker DQTV đó
AC-7 (Auth):       Thiếu permission militia:view → 403 → "Không có quyền truy cập"
AC-8 (Empty):      Không có DQTV nào → "Chưa có dân quân nào trong đơn vị"
```

---

## US-005: CA theo dõi GPS real-time
```
Actor: CA | Goal: Xem vị trí tất cả DQTV trên bản đồ real-time
Priority: Must | Size: L | BR-ref: BR-012
UAT Risk: 🟡 MED

AC-1 (Happy):      flutter_map OSM load, GET /gps/team → markers đúng vị trí
                   Màu marker: xanh=online / vàng=moving / xám=offline
AC-2 (Real-time):  Socket.IO listen 'location_update' → marker di chuyển smooth
AC-3 (Tap marker): Popup: tên, địa chỉ, tốc độ, % pin, nhiệm vụ đang làm
                   3 buttons: Gọi / Nhắn tin / Chi tiết
AC-4 (Filter):     Chips All/On Duty/Moving/Offline → show/hide markers
AC-5 (WS mất):     Disconnect → auto reconnect 3s, indicator "Đang kết nối lại..."
AC-6 (No GPS):     DQTV chưa share → marker xám "Không có dữ liệu GPS"
AC-7 (Bottom sheet): Swipe up → list DQTV đang online với tên + status
```

---

## US-006: CA giao nhiệm vụ cho DQTV
```
Actor: CA | Goal: Tạo và giao nhiệm vụ mới cho 1 hoặc nhiều DQTV
Priority: Must | Size: L | BR-ref: BR-006, BR-011
UAT Risk: 🟡 MED

AC-1 (Happy):      Chọn loại NV (4 types) → title + mô tả → priority →
                   địa điểm (map picker) → thời gian → assign ≥1 DQTV
                   → POST /tasks → success snackbar → navigate back
AC-2 (Voice):      Nhấn mic icon → speech_to_text → điền vào textarea mô tả
AC-3 (Validation-title): Title rỗng → highlight đỏ + "Tiêu đề không được để trống"
AC-4 (Validation-assignee): Không chọn DQTV → "Vui lòng chọn ít nhất 1 người thực hiện"
AC-5 (Validation-deadline): Deadline ≤ now → "Hạn hoàn thành phải sau thời điểm hiện tại"
AC-6 (Draft):      Nhấn "Lưu nháp" → lưu SharedPreferences local, không POST API
AC-7 (Auth):       Thiếu tasks:create → 403 → "Không có quyền tạo nhiệm vụ"
```

---

## US-007: CA duyệt đơn nghỉ phép
```
Actor: CA | Goal: Xem và phê duyệt / từ chối đơn nghỉ của DQTV
Priority: Must | Size: M | BR-ref: BR-007
UAT Risk: 🔴 HIGH

AC-1 (Approve):    Tab "Chờ duyệt" → tap đơn → bottom sheet modal
                   (info DQTV, loại nghỉ, ngày, lý do, phép còn lại progress bar)
                   → "Phê duyệt" → POST /leave-requests/:id/decision {action:'approved'}
                   → đơn chuyển tab "Đã duyệt", FCM đến DQTV
AC-2 (Reject):     "Từ chối" → dialog nhập lý do (required)
                   → POST {action:'rejected', reason:'...'}
                   → đơn chuyển tab "Từ chối"
AC-3 (Validation): Từ chối không nhập lý do → "Vui lòng nhập lý do từ chối"
AC-4 (Empty):      Không có đơn chờ → "Không có đơn nào chờ duyệt"
AC-5 (Auth):       Thiếu leave:approve → 403 → "Không có quyền duyệt đơn"
AC-6 (History):    Tab Đã duyệt + Từ chối → read-only list, không có action
```

---

## US-008: CA xem báo cáo & thống kê đội
```
Actor: CA | Goal: Xem báo cáo KPI, chấm công, nhiệm vụ toàn đội
Priority: Must | Size: M | BR-ref: BR-011
UAT Risk: 🟢 LOW

AC-1 (Happy):      Horizontal scroll 3 metric cards (Nhiệm vụ/Chấm công/Chỉ tiêu TB)
                   → Task Completion Trend (SVG line chart 3 lines)
                   → Attendance Breakdown (stacked bar theo tuần)
                   → KPI Distribution (horizontal bar theo range)
                   → Top 5 xuất sắc (ranked list + medals)
                   → Cần chú ý list (warning)
AC-2 (Filter):     Chọn tháng/năm → reload GET /reports/team?month=X&year=Y
AC-3 (No data):    Chưa có data kỳ này → charts empty state
AC-4 (Export):     Nhấn "Xuất PDF" → snackbar "Tính năng đang phát triển"
AC-5 (Auth):       Thiếu reports:team → 403 → "Không có quyền xem báo cáo"
```

---

## US-009: CA xem & xử lý cảnh báo
```
Actor: CA | Goal: Nhận và xử lý cảnh báo về DQTV
Priority: Must | Size: M | BR-ref: BR-011
UAT Risk: 🟡 MED

AC-1 (Happy):      Tabs Tất cả / Chưa đọc (badge đỏ) / Đã đọc
                   Cards border-l-4: đỏ=urgent / cam=important / xanh=normal
                   Icon theo category (absence/deadline/kpi/gps/violation/task)
                   Unread dot indicator góc phải card
AC-2 (Resolve):    Tap card → bottom sheet modal: mô tả, DQTV info, suggested actions
                   → "Đánh dấu đã xử lý" → POST /alerts/:id/resolve
                   → status=resolved, tab Chưa đọc count giảm
AC-3 (Badge):      Bell icon header = unread alert count
AC-4 (Empty):      Không có cảnh báo → "Không có cảnh báo nào"
```

---

## US-010: CA xem hồ sơ & cài đặt
```
Actor: CA | Goal: Xem thông tin cá nhân, cài đặt, đăng xuất
Priority: Must | Size: S | BR-ref: —
UAT Risk: 🟢 LOW

AC-1 (Happy):      Header gradient + avatar border-4 đỏ + tên + mã hiệu + đơn vị + edit
                   Stats 3-col: DQTV quản lý / Chỉ tiêu TB đội / Kinh nghiệm
                   Sections: Thông tin cá nhân / Thông tin công tác /
                   Cài đặt ứng dụng / Quản lý thông báo / Bảo mật / Về ứng dụng
                   Toggle switches (green #10B981)
AC-2 (Logout):     Nhấn "Đăng xuất" → confirm dialog → POST /auth/logout
                   → clearAll storage → navigate /login
AC-3 (Edit):       Nhấn edit icon → form chỉnh sửa tên/email/phone
                   → PATCH /users/me → cập nhật UI
```

---

## US-011: DQTV xem Dashboard
```
Actor: DQTV | Goal: Xem tổng quan công việc hôm nay, thông báo
Priority: Must | Size: M | BR-ref: BR-005, BR-010
UAT Risk: 🟢 LOW

AC-1 (Happy):      Header gradient + avatar + tên + badge "DQTV - CA Khu vực 1" + bell
                   Stats 2-col: Nhiệm vụ hôm nay (xanh) + Chỉ tiêu tháng (đỏ)
                   Quick Actions 2×2: Nhiệm vụ(đỏ)/Chấm công(xanh)/Báo cáo(amber)/Hồ sơ(blue)
                   Today's tasks list: cards border-l-4 màu theo status
                   Notifications list: icon circle màu + title + time
AC-2 (Tap task):   → TaskDetailScreen (read + accept/update)
AC-3 (Refresh):    Pull-to-refresh → reload tất cả
```

---

## US-012: DQTV xem & thực hiện nhiệm vụ
```
Actor: DQTV | Goal: Xem danh sách, tiếp nhận, cập nhật, hoàn thành nhiệm vụ
Priority: Must | Size: M | BR-ref: BR-010
UAT Risk: 🟡 MED

AC-1 (Happy):      Filter tabs: Tất cả / Chưa bắt đầu / Đang làm / Hoàn thành
                   Stats 3-col: Hoàn thành(xanh) / Đang làm(amber) / Chưa làm(gray)
                   Task cards border-l-4: high=đỏ / medium=amber / low=gray
                   Card content: title, date, MapPin(đỏ), Clock(amber), action buttons
AC-2 (Accept):     Tap "Tiếp nhận" → POST /tasks/:id/accept
                   → status pending→in_progress, card border xanh
AC-3 (Progress):   Tap "Cập nhật" → bottom sheet: slider 0-100% + note input
                   → POST /tasks/:id/progress
AC-4 (Complete):   Slider 100% → POST {progress:100} → status completed, border xanh
AC-5 (Report):     Tap "Nộp báo cáo" → POST /tasks/:id/report {content}
AC-6 (Empty):      Không có task → icon + "Không có nhiệm vụ nào"
```

---

## US-013: DQTV chấm công GPS
```
Actor: DQTV | Goal: Check-in / Check-out xác thực vị trí GPS
Priority: Must | Size: M | BR-ref: BR-001, BR-002, BR-014, BR-015
UAT Risk: 🔴 HIGH

AC-1 (Check-in):   Date card + Calendar icon đỏ
                   Card gradient đỏ (from-[#DC2626] to-[#B91C1C]) + big clock
                   → "Xác định vị trí" → Geolocator → tính distance
                   Distance ≤ 15m: indicator xanh → "Check-in ngay" enabled
                   → POST /attendance/check-in → "Đã check-in lúc HH:MM"
                   → card chuyển state: hiển thị giờ vào + info panel trắng mờ
AC-2 (Check-out):  Nút "Check-out" trắng → POST /attendance/check-out
                   → hiển thị giờ ra + số giờ làm việc
AC-3 (Far):        Distance > 15m → indicator đỏ "Vị trí quá xa đơn vị (X.Xm)"
                   → nút check-in disabled
AC-4 (GPS off):    → dialog "Vui lòng bật GPS để điểm danh"
AC-5 (Permission): → dialog hướng dẫn vào Settings
AC-6 (Duplicate):  Đã check-in + check-in lại → 400 → "Bạn đã điểm danh hôm nay rồi"
AC-7 (Stats):      3-col: Ngày công(xanh) / Đi muộn(amber) / Vắng mặt(đỏ)
AC-8 (History):    List cards border-l-4 xanh (đúng giờ) / đỏ (muộn/vắng)
```

---

## US-014: DQTV gửi báo cáo công việc
```
Actor: DQTV | Goal: Gửi báo cáo hàng ngày / sự vụ / tháng
Priority: Must | Size: M | BR-ref: BR-013
UAT Risk: 🟡 MED

AC-1 (Happy):      Type tabs: Hàng ngày / Sự vụ / Tháng (active=#DC2626)
                   Form card border-2 border-[#FDE047]
                   Location input + MapPin đỏ
                   Textarea + char counter + Mic button
                   Image grid 4-col + add button dashed border đỏ
                   → POST /reports → success snackbar
AC-2 (Validation): Content rỗng → "Nội dung báo cáo không được để trống"
AC-3 (Image):      Chọn từ gallery/camera → preview, tối đa 5 ảnh
AC-4 (Image size): Ảnh > 5MB → "Ảnh quá lớn (tối đa 5MB mỗi ảnh)"
AC-5 (History):    Recent reports list: border-l-4 xanh (approved) / amber (pending)
                   GET /reports/my
```

---

## US-015: DQTV xem hồ sơ & đăng xuất
```
Actor: DQTV | Goal: Xem thông tin cá nhân, KPI, đăng xuất
Priority: Must | Size: S | BR-ref: —
UAT Risk: 🟢 LOW

AC-1 (Happy):      Header gradient + avatar border-4 đỏ + tên + badges (DQTV + cấp bậc)
                   Stats 3-col negative margin overlap header:
                   Chỉ tiêu(xanh) / Ngày công(đỏ) / Nhiệm vụ(amber)
                   Personal info rows: Phone(amber)/Email(blue)/Address(red)/
                   JoinDate(green)/Award(amber) với icon circles
                   Settings: Cài đặt / Đổi MK / Điều khoản / Đăng xuất(đỏ)
AC-2 (KPI):        Stats từ GET /kpi/current + GET /attendance/stats
AC-3 (Logout):     Nhấn "Đăng xuất" → modal confirm icon đỏ
                   → POST /auth/logout → clearAll → /login
```

---

## US-016: DQTV cập nhật vị trí GPS (background)
```
Actor: DQTV | Goal: Tự động gửi vị trí GPS để CA theo dõi khi đang on duty
Priority: Must | Size: S | BR-ref: BR-012
UAT Risk: 🟡 MED

AC-1 (Foreground): Sau check-in, app foreground → mỗi 30s:
                   POST /gps/update {lat, lng, accuracy, speed, battery}
                   → Core upsert gps_latest + emit Socket.IO 'location_update'
AC-2 (Background): App background → Flutter background fetch mỗi 5 phút
AC-3 (Stop):       Sau check-out → dừng timer, không gửi vị trí
AC-4 (No perm):    Location permission denied → skip silently (đã handle ở check-in)
```

---

## US-017: Phân quyền & Route guard
```
Actor: System | Goal: CA không vào màn DQTV và ngược lại
Priority: Must | Size: S | BR-ref: BR-004, BR-005
UAT Risk: 🔴 HIGH

AC-1 (CA routes):  role=police_area → chỉ access /ca/* routes
AC-2 (DQTV routes): role=militia → chỉ access /dqtv/* routes
AC-3 (Cross CA):   CA cố vào /dqtv/* → redirect /ca/home
AC-4 (Cross DQTV): DQTV cố vào /ca/* → redirect /dqtv/home
AC-5 (Unauth):     Chưa login → redirect /login
AC-6 (Unknown):    Role không xác định → logout + "Tài khoản không hợp lệ"
```

---

## US-018: Push Notification (FCM)
```
Actor: System → CA/DQTV | Goal: Nhận push notification về task, đơn, cảnh báo
Priority: Should | Size: S | BR-ref: —
UAT Risk: 🟡 MED

AC-1 (Register):   App start → POST /notifications/fcm-token {token, platform}
AC-2 (Task mới):   CA tạo task → DQTV nhận FCM "Nhiệm vụ mới: [title]"
AC-3 (Duyệt đơn): CA approve/reject → DQTV nhận FCM kết quả
AC-4 (Alert CA):   Hệ thống tạo alert → CA nhận FCM
AC-5 (Tap):        Tap notification background → open đúng màn hình liên quan
```

---

## US-019: Error Recovery & Session
```
Actor: CA/DQTV | Goal: Xử lý mất mạng, token hết hạn gracefully
Priority: Must | Size: S | BR-ref: BR-008
UAT Risk: 🟡 MED

AC-1 (Mất mạng):   Dio timeout/no connection → snackbar "Lỗi kết nối mạng" + Retry
AC-2 (401 refresh): AuthInterceptor POST /auth/refresh → retry request gốc
AC-3 (Refresh fail): clearAll → /login + "Phiên đăng nhập hết hạn"
AC-4 (App reopen): Mở lại app → đọc token + role từ storage
                   → nếu còn hợp lệ vào thẳng đúng Shell
```

---

## SCOPE LOCK

```
IN_SCOPE (Must — 19 US):
  US-001 🔴  US-002 🔴  US-003 🟢  US-004 🟡  US-005 🟡
  US-006 🟡  US-007 🔴  US-008 🟢  US-009 🟡  US-010 🟢
  US-011 🟢  US-012 🟡  US-013 🔴  US-014 🟡  US-015 🟢
  US-016 🟡  US-017 🔴  US-018 🟡  US-019 🟡

OUT_OF_SCOPE:
  - Tạo/sửa/xóa user account (Web admin)
  - DQTV tạo đơn nghỉ phép trong PoliceApp
  - Xuất PDF thực sự
  - Payroll / lương
  - Offline queue
  - Chat UI mới (dùng Core WS sẵn có)

ACCEPTANCE CRITERIA TỔNG THỂ:
  [ ] US 🔴 (001,002,007,013,017): 100% AC có Flutter integration_test PASS
  [ ] US 🟡: Happy path + ≥1 error path integration_test PASS
  [ ] US 🟢: Happy path integration_test PASS
  [ ] Unit test coverage ≥ 80%
  [ ] flutter analyze: 0 errors, 0 warnings
  [ ] EXECUTION_RETURN.md: không có banned patterns
```
