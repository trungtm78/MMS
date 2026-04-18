# BUSINESS FLOW — MilitianApp (Flutter Native)

Feature: Mobile app quản lý dân quân tự vệ (DQTV) — MilitianApp
Task ID: TASK-2026-001
Version: v2.0 (Flutter Rewrite)
Date: 2026-03-08
Subsystem: MilitianApp (militia role only)
Platform: Flutter (Android + iOS)

---

## ACTORS

| Actor | Vai trò |
|---|---|
| Militia User (DQTV) | Người dùng chính — đăng nhập với 2FA, nhận nhiệm vụ, điểm danh GPS, báo cáo, nghỉ phép, SOS, chat |
| Police Officer (CA) | Giao nhiệm vụ (qua Web/PoliceApp), phê duyệt đơn nghỉ, nhận cảnh báo SOS, chat với DQTV |
| System Admin | Quản lý tài khoản, xem audit log (qua Web) |
| Core Backend API | Nguồn dữ liệu trung tâm — mọi request mobile đều qua BFF proxy port 3003 → core API port 3001 |

---

## HAPPY PATH

### Luồng chính của DQTV trong một ngày làm việc:

#### 1. Đăng nhập với 2FA TOTP
1. User mở app → kiểm tra Flutter Secure Storage cho access token
2. Nếu chưa có session → hiển thị màn Login (gradient vàng + viền đỏ)
3. Nhập username + password → Submit
4. Backend verify credentials → trả về `mfa_required: true` + `mfa_session_token` (TTL 5 phút)
5. App chuyển sang màn Nhập OTP
6. User mở Microsoft Authenticator → nhập 6 số OTP vào app
7. Backend verify TOTP → trả về `accessToken` (15min) + `refreshToken` (7 days)
8. App lưu tokens vào Flutter Secure Storage → điều hướng về Home

#### 2. Setup 2FA lần đầu (first-time login)
1. User login lần đầu → backend detect chưa có `totp_secret`
2. Backend generate TOTP secret → trả về `otpauth://totp/...` URI
3. App hiển thị QR code → user scan với Microsoft Authenticator
4. User nhập first OTP để confirm setup
5. Backend generate 10 recovery codes → app hiển thị cho user lưu lại
6. User hoàn thành setup → chuyển về Home

#### 3. Trang chủ (Home Dashboard)
1. Vào Home → gọi API lấy stats
2. Quick Stats: Ngày công (18/22), Chỉ tiêu (92%)
3. Quick Actions: Báo cáo, Điểm danh, Nghỉ phép, Khẩn cấp
4. Today's Overview: Hoàn thành / Đang làm / Chưa làm
5. Today's Schedule: Timeline công việc
6. Notifications preview
7. Weather widget (optional)
8. FAB: SOS khẩn cấp

#### 4. Điểm danh GPS (Check-In)
1. User tap tab "Điểm danh"
2. App lấy vị trí GPS hiện tại qua `geolocator`
3. Validate GPS accuracy ≤ 15m
4. Hiển thị khoảng cách đến khu vực điểm danh + bản đồ
5. User tap "ĐIỂM DANH NGAY" → App gửi GPS + timestamp lên server
6. Server validate GPS → lưu → trả về status (on_time / late)
7. App hiển thị success animation + thông tin điểm danh

#### 5. Điểm danh ra (Check-Out)
1. Nếu đã check-in → hiện nút "ĐIỂM DANH RA"
2. User tap → GPS validation → submit
3. Server tính total_hours → trả về

#### 6. Nhiệm vụ của tôi (My Tasks)
1. Vào tab Nhiệm vụ → GET `/tasks` với filter
2. Tabs: Đang làm | Chờ tiếp nhận | Đã hoàn thành | Quá hạn
3. Card hiển thị: code, title, priority badge, location, deadline, status
4. Tap card → Task Detail: mô tả, địa điểm, timeline, progress
5. Actions: Tiếp nhận / Cập nhật tiến độ / Gửi giải trình (quá hạn)

#### 7. Cập nhật tiến độ nhiệm vụ
1. Vào Task Detail → tap "Cập nhật tiến độ"
2. Nhập progress % + note + GPS location (optional)
3. POST `/tasks/:id/progress`
4. Progress = 100% → task auto complete

#### 8. Đăng ký nghỉ phép (Leave Request)
1. Home → "Nghỉ phép" hoặc Profile → "Đăng ký nghỉ phép"
2. Form: Loại nghỉ | Thời gian (from/to) | Lý do (≥20 chars) | Người thay thế | File đính kèm
3. Preview summary → Submit
4. Success screen với mã đơn

#### 9. SOS & Báo cáo sự cố
1. Tap FAB SOS hoặc Home → "Khẩn cấp"
2. **Tab 1: Báo cáo sự cố**
   - Loại sự cố (Mất AN, Hỏa hoạn, Y tế, Tai nạn, Sự cố điện nước, Khác)
   - Mức độ nghiêm trọng (Thấp/Trung bình/Cao/Khẩn cấp)
   - Vị trí GPS + mô tả
   - Bằng chứng (ảnh/video/âm thanh)
   - Người liên quan
3. **Tab 2: SOS khẩn cấp**
   - Hold button 2s → tự động gọi CA KV + gửi vị trí
   - Emergency contacts list

#### 10. Chat với CA KV
1. Tab Chat → list conversations
2. Tap conversation → chat screen
3. Gửi/nhận tin nhắn text + ảnh
4. Real-time qua WebSocket

#### 11. Thông báo
1. Tap Bell icon hoặc vào Notifications
2. Tabs: Tất cả | Nhiệm vụ | Chấm công | Hệ thống
3. Unread indicator + swipe to delete
4. Mark all as read

#### 12. Profile & Settings
1. Tab Cá nhân → Profile card
2. Quick stats: Thâm niên, Điểm chỉ tiêu, Xếp hạng
3. Personal info: Phone, Email, DOB, Address, CCCD
4. Work info: Khu phố, CA KV, Ngày vào lực lượng
5. Emergency contact
6. Settings: Notifications, Biometric, Security, Language (chỉ VN)

#### 13. Biometric Login
1. Sau login lần đầu → hỏi "Bật Face ID / vân tay?"
2. Enable → lần sau dùng biometric thay password
3. Biometric fail → fallback về password
4. Vẫn cần OTP 2FA sau biometric

#### 14. Push Notifications
1. Firebase FCM init
2. Nhận push khi: task mới, leave approved, SOS alert, new message
3. Tap notification → navigate đến actionUrl

#### 15. Đăng xuất
1. Profile → "Đăng xuất"
2. Clear Flutter Secure Storage
3. Về màn Login

---

## EXCEPTIONS

| EX | Điều kiện | Xử lý |
|---|---|---|
| EX-01 | Sai username/password 3 lần | Lock account 15 phút, hiện message |
| EX-02 | OTP sai 3 lần | Invalidate mfa_session_token → quay lại login |
| EX-03 | GPS accuracy > 15m | Warning "Di chuyển đến gần khu vực hơn", không cho điểm danh |
| EX-04 | Mất mạng khi submit | Lưu locally → retry khi có mạng |
| EX-05 | Refresh token hết hạn | Force logout → về màn Login |
| EX-06 | Task quá hạn | Badge đỏ, action "Gửi giải trình" bắt buộc |
| EX-07 | Nghỉ phép > số ngày còn lại | Backend reject, hiện error |
| EX-08 | SOS nhưng không có GPS | Yêu cầu bật GPS hoặc nhập địa chỉ text |
| EX-09 | Session hết hạn giữa chừng | Dio interceptor auto-refresh hoặc logout |
| EX-10 | App crash | Lần sau mở → check pending local data → sync |
| EX-11 | Biometric không hỗ trợ | Ẩn option biometric |
| EX-12 | Push notification permission denied | Chỉ in-app notifications |

---

## BUSINESS RULES

| BR-ID | Quy tắc | Điều kiện | Kết quả |
|---|---|---|---|
| BR-001 | Điểm danh đúng giờ | Check-in trước 08:30 (ca sáng) | status = on_time |
| BR-002 | Điểm danh trễ | Check-in sau 08:30 | status = late, ghi nhận |
| BR-003 | GPS threshold | accuracy ≤ 15m | Cho phép điểm danh |
| BR-004 | Task quá hạn | deadline < now && status != completed | Badge đỏ, require giải trình |
| BR-005 | OTP timeout | mfa_session_token TTL = 5 phút | Hết hạn → quay lại login |
| BR-006 | Access token TTL | 15 phút | Auto-refresh bằng refresh token |
| BR-007 | Refresh token TTL | 7 ngày | Hết hạn → force logout |
| BR-008 | KPI calculation | Cuối tháng | Tính điểm từ attendance + tasks + discipline |
| BR-009 | SOS severity = urgent | Gửi ngay + notify CA KV + gọi hotline | Priority xử lý |
| BR-010 | Biometric login | Device hỗ trợ + user enabled | Thay thế password, vẫn cần OTP |
| BR-011 | Recovery codes | 10 codes, mỗi code 1 lần | Fallback khi mất authenticator |
| BR-012 | Chat real-time | WebSocket connection | Tin nhắn real-time |

---

## ASSUMPTIONS

- [x] Backend tại `http://localhost:3001` đã implement endpoints: auth, tasks, attendance, leave, incidents, notifications
- [ ] **Backend cần implement mới**: `/auth/verify-mfa`, `/auth/setup-mfa`, `/auth/verify-recovery`
- [ ] **Database cần migration**: thêm `totp_secret`, `mfa_enabled` vào users table, tạo `recovery_codes` table
- [x] BFF proxy tại port 3003 forward toàn bộ `/api/*` → core API
- [x] GPS accuracy threshold = 15m
- [x] TOTP RFC 6238 (Microsoft Authenticator compatible)
- [x] Flutter Secure Storage cho tokens (Keychain iOS / Keystore Android)
- [ ] Firebase project cần setup cho push notifications
- [ ] WebSocket server cho real-time chat

---

## SCOPE

### In Scope (v1.0)
- Login + 2FA TOTP (Microsoft Authenticator)
- 2FA Setup (QR code + recovery codes)
- Biometric login (Face ID / Touch ID)
- Push notifications (Firebase)
- Home Dashboard
- Check-In/Out GPS
- My Tasks (list + detail + actions)
- Profile + Settings
- Leave Request
- SOS & Incident Report
- Notifications
- Chat/messaging với CA KV

### Out of Scope (v1.0)
- KPI Dashboard → v1.1
- Leave history → v1.1
- Offline cache → v1.1
- Dark mode → v1.1
- Multi-language (chỉ tiếng Việt)
- Full offline CRUD → v1.1
