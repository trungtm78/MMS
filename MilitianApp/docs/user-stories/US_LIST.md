# US_LIST — MilitianApp (Flutter Native)
Task ID: TASK-2026-001 | Version: v2.0 | Locked: 2026-03-08
Subsystem: MilitianApp (militia/DQTV role)
Platform: Flutter (Android + iOS)

---

## US-001: Đăng nhập với 2FA TOTP
**Actor:** DQTV | **Goal:** Đăng nhập an toàn bằng username/password + OTP từ Microsoft Authenticator  
**Reason:** Bảo mật tài khoản theo chuẩn ANTT | **Priority:** Must | **Size:** M  
**BR-ref:** BR-005, BR-006, BR-007  
**UAT Risk:** 🔴 HIGH (auth liên quan)

- AC-1 (Happy): Khi nhập đúng username + password + OTP → đăng nhập thành công → về Home
- AC-2 (Validation): Khi nhập sai password → hiện "Mật khẩu không chính xác"
- AC-3 (Edge case): Khi nhập sai OTP 3 lần → invalidate session → về Login
- AC-4 (Auth): Khi không có account → hiện "Tài khoản không tồn tại"

---

## US-002: Setup 2FA lần đầu
**Actor:** DQTV | **Goal:** Thiết lập TOTP với Microsoft Authenticator lần đầu đăng nhập  
**Reason:** Bắt buộc enable 2FA trước khi dùng app | **Priority:** Must | **Size:** M  
**BR-ref:** BR-005, BR-011  
**UAT Risk:** 🔴 HIGH (auth liên quan)

- AC-1 (Happy): Khi login lần đầu → hiện QR code → user scan → nhập OTP confirm → setup thành công
- AC-2 (Validation): Khi OTP confirm sai → hiện "Mã OTP không đúng, vui lòng thử lại"
- AC-3 (Edge case): Khi user cancel setup → không cho dùng app → logout
- AC-4 (Auth): Sau setup → generate 10 recovery codes → hiển thị cho user lưu

---

## US-003: Sử dụng Recovery Codes
**Actor:** DQTV | **Goal:** Đăng nhập bằng recovery code khi mất điện thoại Authenticator  
**Reason:** Fallback khi không có OTP | **Priority:** Must | **Size:** S  
**BR-ref:** BR-011  
**UAT Risk:** 🔴 HIGH (auth liên quan)

- AC-1 (Happy): Khi không có OTP → tap "Dùng recovery code" → nhập 1 code → đăng nhập thành công
- AC-2 (Validation): Khi nhập code đã dùng → hiện "Code đã sử dụng"
- AC-3 (Edge case): Khi hết 10 codes → hiện "Liên hệ admin để reset"
- AC-4 (Auth): Mỗi code chỉ dùng 1 lần → mark as used

---

## US-004: Trang chủ Dashboard
**Actor:** DQTV | **Goal:** Xem tổng quan ngày công, chỉ tiêu, lịch trình, thông báo  
**Reason:** Landing page sau login | **Priority:** Must | **Size:** M  
**BR-ref:** BR-008  
**UAT Risk:** 🟢 LOW (read-only)

- AC-1 (Happy): Khi vào Home → hiện stats, quick actions, schedule, notifications
- AC-2 (Validation): N/A (read-only)
- AC-3 (Edge case): Khi không có data → hiện empty states
- AC-4 (Auth): Khi token hết hạn → auto-refresh hoặc logout

---

## US-005: Điểm danh GPS Check-in
**Actor:** DQTV | **Goal:** Điểm danh vào bằng GPS với accuracy ≤ 15m  
**Reason:** Chấm công hàng ngày | **Priority:** Must | **Size:** L  
**BR-ref:** BR-001, BR-002, BR-003  
**UAT Risk:** 🟡 MED (data mutation, GPS validation)

- AC-1 (Happy): Khi GPS accuracy ≤ 15m → tap "Điểm danh" → success → record checkin_at
- AC-2 (Validation): Khi GPS accuracy > 15m → warning "Di chuyển đến gần khu vực hơn"
- AC-3 (Edge case): Khi mất mạng → lưu locally → sync khi có mạng
- AC-4 (Auth): Khi đã check-in → hiện trạng thái "Đã điểm danh" + nút "Điểm danh ra"

---

## US-006: Điểm danh GPS Check-out
**Actor:** DQTV | **Goal:** Điểm danh ra khi kết thúc ca  
**Reason:** Tính giờ công | **Priority:** Must | **Size:** M  
**BR-ref:** BR-001, BR-002, BR-003  
**UAT Risk:** 🟡 MED (data mutation)

- AC-1 (Happy): Khi đã check-in → tap "Điểm danh ra" → success → record checkout_at + total_hours
- AC-2 (Validation): Khi chưa check-in → không hiện nút check-out
- AC-3 (Edge case): Khi quên check-out → hệ thống auto check-out 23:59 với status "missing_checkout"
- AC-4 (Auth): Chỉ cho check-out 1 lần/ngày

---

## US-007: Xem lịch sử điểm danh
**Actor:** DQTV | **Goal:** Xem lịch sử check-in/out theo ngày/tháng  
**Reason:** Theo dõi công | **Priority:** Should | **Size:** S  
**BR-ref:** N/A  
**UAT Risk:** 🟢 LOW (read-only)

- AC-1 (Happy): Vào tab Lịch sử → hiện list với filter theo tháng
- AC-2 (Validation): N/A
- AC-3 (Edge case): Khi không có data → hiện "Chưa có dữ liệu"
- AC-4 (Auth): Chỉ xem được data của chính mình

---

## US-008: Xem danh sách nhiệm vụ
**Actor:** DQTV | **Goal:** Xem tasks được giao với filter theo status  
**Reason:** Quản lý công việc | **Priority:** Must | **Size:** M  
**BR-ref:** BR-004  
**UAT Risk:** 🟢 LOW (read-only)

- AC-1 (Happy): Vào tab Nhiệm vụ → hiện list với tabs (Đang làm/Chờ/HT/Quá hạn)
- AC-2 (Validation): Badge số lượng tasks trên mỗi tab
- AC-3 (Edge case): Khi không có task → empty state "Không có nhiệm vụ"
- AC-4 (Auth): Chỉ hiện tasks assigned cho user

---

## US-009: Chi tiết nhiệm vụ
**Actor:** DQTV | **Goal:** Xem chi tiết task + timeline progress  
**Reason:** Hiểu rõ yêu cầu | **Priority:** Must | **Size:** S  
**BR-ref:** N/A  
**UAT Risk:** 🟢 LOW (read-only)

- AC-1 (Happy): Tap task card → hiện detail: title, desc, location, deadline, assigned_by, progress
- AC-2 (Validation): N/A
- AC-3 (Edge case): Task không tồn tại → "Nhiệm vụ không tìm thấy"
- AC-4 (Auth): Chỉ xem được task của mình

---

## US-010: Tiếp nhận nhiệm vụ
**Actor:** DQTV | **Goal:** Accept task từ status pending → in-progress  
**Reason:** Xác nhận thực hiện | **Priority:** Must | **Size:** S  
**BR-ref:** BR-004  
**UAT Risk:** 🟡 MED (status change)

- AC-1 (Happy): Tap "Tiếp nhận" → status = in-progress → hiện timeline entry
- AC-2 (Validation): Chỉ accept được khi status = pending
- AC-3 (Edge case): Task đã được assign cho người khác → error "Nhiệm vụ không còn khả dụng"
- AC-4 (Auth): Chỉ assigned user mới accept được

---

## US-011: Cập nhật tiến độ nhiệm vụ
**Actor:** DQTV | **Goal:** Update progress + note + location  
**Reason:** Báo cáo tiến độ | **Priority:** Must | **Size:** M  
**BR-ref:** N/A  
**UAT Risk:** 🟡 MED (data mutation)

- AC-1 (Happy): Tap "Cập nhật tiến độ" → nhập progress % + note + GPS → submit → add to timeline
- AC-2 (Validation): Progress phải 0-100
- AC-3 (Edge case): Mất mạng → lưu local → sync
- AC-4 (Auth): Chỉ assigned user mới update

---

## US-012: Hoàn thành nhiệm vụ
**Actor:** DQTV | **Goal:** Mark task = completed khi xong  
**Reason:** Đóng task | **Priority:** Must | **Size:** S  
**BR-ref:** BR-004  
**UAT Risk:** 🟡 MED (status change)

- AC-1 (Happy): Tap "Hoàn thành" → status = completed → tính vào KPI
- AC-2 (Validation): Progress phải = 100% mới cho complete
- AC-3 (Edge case): Complete sau deadline → flag "completed_late"
- AC-4 (Auth): Chỉ assigned user mới complete

---

## US-013: Gửi giải trình task quá hạn
**Actor:** DQTV | **Goal:** Submit explanation cho task overdue  
**Reason:** Bắt buộc giải trình | **Priority:** Should | **Size:** S  
**BR-ref:** BR-004  
**UAT Risk:** 🟡 MED (data mutation)

- AC-1 (Happy): Tap "Gửi giải trình" → nhập lý do → submit → gửi đến CA KV
- AC-2 (Validation): Lý do ≥ 20 chars
- AC-3 (Edge case): N/A
- AC-4 (Auth): Chỉ assigned user mới gửi

---

## US-014: Đăng ký nghỉ phép
**Actor:** DQTV | **Goal:** Submit leave request với type, dates, reason, replacement  
**Reason:** Xin nghỉ | **Priority:** Must | **Size:** L  
**BR-ref:** BR-007  
**UAT Risk:** 🟡 MED (data mutation, workflow)

- AC-1 (Happy): Điền form đầy đủ → Submit → Tạo đơn với status = pending → hiện success + mã đơn
- AC-2 (Validation): Lý do ≥ 20 chars, ngày kết thúc ≥ ngày bắt đầu, phải chọn người thay thế
- AC-3 (Edge case): Hết ngày phép còn lại → error "Không đủ ngày phép"
- AC-4 (Auth): Chỉ tạo cho chính mình

---

## US-015: Xem Profile
**Actor:** DQTV | **Goal:** Xem thông tin cá nhân + công tác  
**Reason:** Quản lý hồ sơ | **Priority:** Should | **Size:** S  
**BR-ref:** N/A  
**UAT Risk:** 🟢 LOW (read-only)

- AC-1 (Happy): Vào tab Cá nhân → hiện profile card + personal/work info + emergency contact
- AC-2 (Validation): N/A
- AC-3 (Edge case): N/A
- AC-4 (Auth): Chỉ xem profile của mình

---

## US-016: SOS Khẩn cấp
**Actor:** DQTV | **Goal:** Hold button 2s → tự động gọi CA KV + gửi vị trí  
**Reason:** Báo động nguy hiểm | **Priority:** Must | **Size:** M  
**BR-ref:** BR-009  
**UAT Risk:** 🔴 HIGH (emergency, data không rollback)

- AC-1 (Happy): Hold SOS button 2s → tạo incident severity=urgent → trigger call + notify CA KV
- AC-2 (Validation): N/A
- AC-3 (Edge case): Không có GPS → yêu cầu bật hoặc nhập text
- AC-4 (Auth): Phải đã login

---

## US-017: Báo cáo sự cố
**Actor:** DQTV | **Goal:** Submit incident report với type, severity, location, description, evidence  
**Reason:** Báo cáo tình huống | **Priority:** Must | **Size:** L  
**BR-ref:** BR-009  
**UAT Risk:** 🟡 MED (data mutation)

- AC-1 (Happy): Điền form → Submit → Tạo incident → hiện success + mã báo cáo
- AC-2 (Validation): Description ≥ 20 chars, phải chọn type + severity
- AC-3 (Edge case): Upload evidence fail → vẫn cho submit nhưng warning
- AC-4 (Auth): Phải đã login

---

## US-018: Xem Notifications
**Actor:** DQTV | **Goal:** Xem danh sách thông báo với filter  
**Reason:** Không bỏ lỡ tin quan trọng | **Priority:** Should | **Size:** M  
**BR-ref:** N/A  
**UAT Risk:** 🟢 LOW (read-only)

- AC-1 (Happy): Vào Notifications → list với tabs + unread indicator
- AC-2 (Validation): N/A
- AC-3 (Edge case): Không có notification → empty state
- AC-4 (Auth): Chỉ xem notifications của mình

---

## US-019: Mark notification as read
**Actor:** DQTV | **Goal:** Đánh dấu đã đọc 1 hoặc tất cả  
**Reason:** Quản lý trạng thái | **Priority:** Should | **Size:** S  
**BR-ref:** N/A  
**UAT Risk:** 🟢 LOW (status change)

- AC-1 (Happy): Tap notification → mark read + navigate to actionUrl
- AC-2 (Validation): N/A
- AC-3 (Edge case): N/A
- AC-4 (Auth): Chỉ mark được notifications của mình

---

## US-020: Đổi mật khẩu
**Actor:** DQTV | **Goal:** Thay đổi password trong Settings  
**Reason:** Bảo mật | **Priority:** Should | **Size:** S  
**BR-ref:** N/A  
**UAT Risk:** 🔴 HIGH (auth liên quan)

- AC-1 (Happy): Nhập current + new password → Submit → Success → yêu cầu login lại
- AC-2 (Validation): New password ≥ 6 chars, khác current
- AC-3 (Edge case): Current password sai → error
- AC-4 (Auth): Phải đã login

---

## US-021: Đăng xuất
**Actor:** DQTV | **Goal:** Logout + xóa tokens local  
**Reason:** Kết thúc session | **Priority:** Must | **Size:** S  
**BR-ref:** BR-007  
**UAT Risk:** 🔴 HIGH (auth liên quan)

- AC-1 (Happy): Tap "Đăng xuất" → xóa tokens → về Login
- AC-2 (Validation): N/A
- AC-3 (Edge case): Network fail → vẫn logout local (offline logout)
- AC-4 (Auth): N/A

---

## US-022: Auto-refresh token
**Actor:** System | **Goal:** Tự động refresh access token khi hết hạn  
**Reason:** UX seamless | **Priority:** Must | **Size:** S  
**BR-ref:** BR-006, BR-007  
**UAT Risk:** 🔴 HIGH (auth liên quan)

- AC-1 (Happy): Khi access token hết hạn → interceptor dùng refresh token → get new tokens → continue request
- AC-2 (Validation): N/A
- AC-3 (Edge case): Refresh token hết hạn → force logout
- AC-4 (Auth): Transparent to user

---

## US-023: Biometric Login
**Actor:** DQTV | **Goal:** Đăng nhập bằng Face ID / vân tay thay vì password  
**Reason:** Tiện lợi + bảo mật | **Priority:** Must | **Size:** M  
**BR-ref:** BR-010  
**UAT Risk:** 🔴 HIGH (auth)

- AC-1 (Happy): Sau login lần đầu → hỏi "Bật Face ID / vân tay?" → Enable → lần sau dùng biometric
- AC-2 (Validation): Biometric fail → fallback về password
- AC-3 (Edge case): Device không hỗ trợ → ẩn option
- AC-4 (Auth): Biometric chỉ thay thế password, vẫn cần OTP 2FA

---

## US-024: Push Notifications
**Actor:** DQTV | **Goal:** Nhận notification khi có task mới, leave approved, SOS alert  
**Reason:** Không bỏ lỡ tin quan trọng | **Priority:** Must | **Size:** M  
**BR-ref:** N/A  
**UAT Risk:** 🟡 MED (external dependency)

- AC-1 (Happy): Khi có task mới → push notification → tap → mở app vào task detail
- AC-2 (Validation): Khi leave approved → push "Đơn nghỉ đã được duyệt"
- AC-3 (Edge case): Khi SOS từ DQTV khác trong cùng khu phố → push alert
- AC-4 (Auth): Phải grant permission → nếu deny → chỉ in-app notification

---

## US-025: Chat List
**Actor:** DQTV | **Goal:** Xem danh sách conversations với CA KV  
**Reason:** Liên lạc nhanh | **Priority:** Should | **Size:** M  
**BR-ref:** BR-012  
**UAT Risk:** 🟢 LOW (read-only list)

- AC-1 (Happy): Vào tab Chat → list conversations với CA KV + unread badge
- AC-2 (Validation): N/A
- AC-3 (Edge case): Không có conversation → "Chưa có tin nhắn"
- AC-4 (Auth): Chỉ chat với CA KV được assign

---

## US-026: Send/Receive Message
**Actor:** DQTV | **Goal:** Gửi/nhận tin nhắn text + ảnh với CA KV  
**Reason:** Trao đổi thông tin | **Priority:** Should | **Size:** L  
**BR-ref:** BR-012  
**UAT Risk:** 🟡 MED (real-time, data mutation)

- AC-1 (Happy): Mở chat → nhập text → gửi → hiện trong conversation
- AC-2 (Validation): Tin nhắn rỗng → không gửi
- AC-3 (Edge case): Mất mạng → queue tin nhắn → gửi khi có mạng
- AC-4 (Auth): Chỉ gửi đến CA KV được phép

---

## US-027: Push Notification for New Message
**Actor:** DQTV | **Goal:** Nhận push khi có tin nhắn mới  
**Reason:** Không bỏ lỡ | **Priority:** Should | **Size:** S  
**BR-ref:** BR-012  
**UAT Risk:** 🟡 MED (external dependency)

- AC-1 (Happy): CA KV gửi tin → DQTV nhận push → tap → mở chat
- AC-2 (Validation): N/A
- AC-3 (Edge case): App background → push hiển thị
- AC-4 (Auth): N/A

---

## SCOPE LOCK

```
IN_SCOPE (v1.0):
  🔴 Must: US-001, US-002, US-003, US-004, US-005, US-006, US-008, US-009, US-010, US-011, US-012, US-014, US-016, US-017, US-021, US-022, US-023, US-024
  🟡 Should: US-007, US-013, US-015, US-018, US-019, US-020, US-025, US-026, US-027

OUT_OF_SCOPE (v1.0):
  - KPI Dashboard → v1.1
  - Leave history → v1.1
  - Offline cache → v1.1
  - Dark mode → v1.1
  - Multi-language (chỉ tiếng Việt)
  - Full offline CRUD → v1.1
```

## ACCEPTANCE CRITERIA TỔNG THỂ

- [ ] Tất cả US 🔴: 100% AC có Flutter integration test pass
- [ ] Tất cả US 🟡: Happy path + ≥1 error path test pass
- [ ] Biometric login hoạt động trên iOS (Face ID) + Android (fingerprint)
- [ ] Push notifications nhận được khi có task mới, leave approved, SOS alert, new message
- [ ] Chat real-time hoạt động
- [ ] Unit coverage ≥ 80%
- [ ] Lint: 0 errors (flutter analyze)
- [ ] Security: 0 HIGH/CRITICAL vulnerabilities
- [ ] Backend 2FA endpoints implemented + tested
- [ ] Toàn bộ UI/UX text tiếng Việt

## UAT RISK SUMMARY

| Risk Level | Count | User Stories |
|------------|-------|--------------|
| 🔴 HIGH | 10 | US-001, US-002, US-003, US-016, US-020, US-021, US-022, US-023 |
| 🟡 MED | 10 | US-005, US-006, US-010, US-011, US-012, US-013, US-014, US-017, US-024, US-026, US-027 |
| 🟢 LOW | 9 | US-004, US-007, US-008, US-009, US-015, US-018, US-019, US-025 |
