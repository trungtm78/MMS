# TEST SCENARIOS — MilitianApp Frontend
Task ID: TASK-2026-001
Version: v1.0
Date: 2026-03-08

---

## US-MA-001: Login + Session (🔴 HIGH)

| ID | Scenario | Input | Expected | Type |
|---|---|---|---|---|
| TS-001-01 | Happy login DQTV | username=dqtv001, pass=123456 | Access token saved, redirect Home | Happy |
| TS-001-02 | Submit button disabled khi empty | username='', password='' | Button disabled | Validation |
| TS-001-03 | Submit disabled khi chỉ có username | username='abc', password='' | Button disabled | Validation |
| TS-001-04 | Submit disabled khi chỉ có password | username='', password='123' | Button disabled | Validation |
| TS-001-05 | Sai password | username=dqtv001, pass=wrong | "Tên đăng nhập hoặc mật khẩu không đúng" | Negative |
| TS-001-06 | Username không tồn tại | username=notexist, pass=123456 | "Tên đăng nhập hoặc mật khẩu không đúng" | Negative |
| TS-001-07 | Loading state khi submit | — | Nút disabled + "Đang đăng nhập..." | State |
| TS-001-08 | Session restore khi có token | localStorage có token hợp lệ | Skip Login → Home trực tiếp | Edge |
| TS-001-09 | Session restore token hết hạn | localStorage có token hết hạn | Interceptor refresh → nếu fail → Login | Edge |
| TS-001-10 | Token persist sau close tab | Login → close → reopen | Vẫn ở Home, không cần login lại | Boundary |
| TS-001-11 | Device payload gửi kèm login | Bấm login | Request body có `device.name`, `device.platform` | BR-MA-11 |
| TS-001-12 | Password hiển thị khi toggle | Bấm icon eye | Password visible/hidden toggle | UI |

---

## US-MA-002: Home Dashboard (🟢 LOW)

| ID | Scenario | Input | Expected | Type |
|---|---|---|---|---|
| TS-002-01 | Load Home thành công | — | Render stats, schedule, notifications | Happy |
| TS-002-02 | Skeleton loading | API chậm | Skeleton hiển thị trong khi fetch | Loading |
| TS-002-03 | Bấm quick action Báo cáo | — | Mở TaskReport overlay | Navigation |
| TS-002-04 | Bấm quick action Điểm danh | — | Switch tab CheckIn | Navigation |
| TS-002-05 | Bấm quick action Nghỉ phép | — | Mở LeaveRequest overlay | Navigation |
| TS-002-06 | Bấm quick action Khẩn cấp | — | Mở SOS overlay | Navigation |
| TS-002-07 | Bell icon hiển thị badge | Có 3 thông báo chưa đọc | Badge số 3 | UI |
| TS-002-08 | Không có nhiệm vụ hôm nay | API trả empty | Empty state "Chưa có nhiệm vụ" | Empty |

---

## US-MA-003: My Tasks (🟡 MED)

| ID | Scenario | Input | Expected | Type |
|---|---|---|---|---|
| TS-003-01 | Load danh sách nhiệm vụ | — | Danh sách filter theo tab active | Happy |
| TS-003-02 | Chuyển tab Đang làm | — | Chỉ hiện tasks status=in-progress | Filter |
| TS-003-03 | Chuyển tab Chờ tiếp nhận | — | Chỉ hiện tasks status=pending | Filter |
| TS-003-04 | Chuyển tab Đã hoàn thành | — | Tasks status=completed | Filter |
| TS-003-05 | Chuyển tab Quá hạn | — | Tasks status=overdue + badge đỏ | Filter |
| TS-003-06 | Bấm tiếp nhận task pending | Task in pending tab | POST /accept → task chuyển in-progress | Action |
| TS-003-07 | Bấm vào task → xem chi tiết | — | Màn hình detail với title, deadline, location | Navigation |
| TS-003-08 | Cập nhật tiến độ 60% | Task in-progress → progress=60, note="..." | POST /progress → toast success | Action |
| TS-003-09 | Cập nhật tiến độ 100% | progress=100 | Task complete, status updated | Boundary |
| TS-003-10 | Task quá hạn hiển thị đúng | Task overdue | Badge đỏ "Quá hạn", action "Giải trình" | UI |
| TS-003-11 | Danh sách trống | API trả empty | Empty state message | Empty |
| TS-003-12 | Priority badge màu đúng | urgent/high/medium/low | Màu tương ứng đỏ/vàng/xanh/xám | UI |

---

## US-MA-004: Check-in/Check-out GPS (🔴 HIGH)

| ID | Scenario | Input | Expected | Type |
|---|---|---|---|---|
| TS-004-01 | Check-in thành công | GPS ok, accuracy=8m | POST check-in → success screen | Happy |
| TS-004-02 | Accuracy đúng bằng threshold | accuracy=15.0 | ACCEPTED → check-in thành công | Boundary |
| TS-004-03 | Accuracy vượt threshold 0.01 | accuracy=15.01 | REJECTED → error badge | Boundary |
| TS-004-04 | Accuracy < threshold | accuracy=14.99 | ACCEPTED | Boundary |
| TS-004-05 | GPS permission denied | Deny GPS | Disable nút, error "Vui lòng cấp quyền GPS" | Error |
| TS-004-06 | GPS không khả dụng | GPS tắt | Nút disabled, error message | Error |
| TS-004-07 | GPS accuracy xấu | accuracy=50m | Block submit, show "GPS không đủ chính xác" | Validation |
| TS-004-08 | Retry GPS | Accuracy xấu → bấm retry | Gọi lại geolocation | Retry |
| TS-004-09 | Check-out sau check-in | Đã check-in → check-out | POST checkout → hiển thị tổng giờ | Happy |
| TS-004-10 | Hiển thị accuracy badge | GPS loaded | data-testid=gps-accuracy hiển thị ±Xm | UI |
| TS-004-11 | Hiển thị status sau check-in | Sau check-in | data-testid=attendance-status = "Đã điểm danh" | UI |
| TS-004-12 | Lịch sử điểm danh 5 ngày | — | List 5 ngày gần nhất từ API | Happy |
| TS-004-13 | Check-in offline | Không có mạng | Toast lỗi, manual retry | Offline |

---

## US-MA-005: Leave Request (🟡 MED)

| ID | Scenario | Input | Expected | Type |
|---|---|---|---|---|
| TS-005-01 | Submit đơn nghỉ thành công | from=20/3, to=21/3, reason="gia đình" | POST → "Đã gửi đơn thành công" | Happy |
| TS-005-02 | from_date = to_date (1 ngày) | from=20/3, to=20/3 | ACCEPTED → submit ok | Boundary |
| TS-005-03 | from_date > to_date | from=21/3, to=20/3 | REJECTED → error inline | Validation |
| TS-005-04 | Lý do trống | reason='' | Submit disabled | Validation |
| TS-005-05 | Lý do 500 ký tự | reason=500 chars | ACCEPTED | Boundary |
| TS-005-06 | Lý do 501 ký tự | reason=501 chars | REJECTED hoặc truncate | Boundary |
| TS-005-07 | Không chọn loại nghỉ | leaveTypeId=null | Submit disabled | Validation |
| TS-005-08 | Loading state khi submit | — | Button disabled + spinner | State |

---

## US-MA-006: SOS (🔴 HIGH)

| ID | Scenario | Input | Expected | Type |
|---|---|---|---|---|
| TS-006-01 | SOS thành công | severity=high, message="khẩn cấp", GPS ok | POST /incidents/sos → success screen | Happy |
| TS-006-02 | Confirm dialog bắt buộc | Bấm SOS button | Dialog xuất hiện trước khi gửi | BR-MA-12 |
| TS-006-03 | Hủy confirm | Bấm Hủy trong dialog | Dialog đóng, không gửi | Cancel |
| TS-006-04 | SOS không có GPS | GPS fail | Gửi được nhưng cảnh báo "Không có vị trí GPS" | Edge |
| TS-006-05 | SOS offline → queue | Không có mạng | Lưu queue, hiển thị "Đang chờ gửi" | Offline |
| TS-006-06 | Retry SOS khi online | Queue có SOS → kết nối lại | Tự động retry và gửi | Retry |
| TS-006-07 | Message trống | message='' | Submit disabled | Validation |
| TS-006-08 | Chọn severity medium | severity=medium | POST với severity=medium | Action |
| TS-006-09 | Nút SOS FAB trên Home | — | Mở SOS overlay | Navigation |

---

## US-MA-007: Task Report (🟡 MED)

| ID | Scenario | Input | Expected | Type |
|---|---|---|---|---|
| TS-007-01 | Cập nhật 60% thành công | task in-progress, progress=60, note | POST /progress → toast success | Happy |
| TS-007-02 | Progress = 0 | progress=0 | Submit disabled | Boundary |
| TS-007-03 | Progress = 1 | progress=1 | ACCEPTED | Boundary |
| TS-007-04 | Progress = 100 | progress=100 | POST → complete, toast "Nhiệm vụ hoàn thành" | Boundary |
| TS-007-05 | Progress = 101 | progress=101 | REJECTED (validation) | Boundary |
| TS-007-06 | Không chọn task | — | Submit disabled hoặc error | Validation |

---

## US-MA-008: KPI (🟢 LOW)

| ID | Scenario | Input | Expected | Type |
|---|---|---|---|---|
| TS-008-01 | Load KPI hiện tại | — | Điểm tổng, breakdown, rank | Happy |
| TS-008-02 | KPI chưa có dữ liệu | API trả null | Empty state | Empty |
| TS-008-03 | Chart lịch sử 6 tháng | — | Bar chart render | UI |

---

## US-MA-009: Profile + Logout (🟡 MED)

| ID | Scenario | Input | Expected | Type |
|---|---|---|---|---|
| TS-009-01 | Xem thông tin profile | — | Tên, mã DQTV, đơn vị từ store | Happy |
| TS-009-02 | Đăng xuất | Bấm Logout → Confirm | Store cleared → Login screen | Action |
| TS-009-03 | Hủy đăng xuất | Bấm Hủy trong confirm | Ở lại Profile | Cancel |
| TS-009-04 | Đổi mật khẩu thành công | current=đúng, new=newpass, confirm=newpass | POST /change-password → success | Happy |
| TS-009-05 | Mật khẩu cũ sai | current=wrong | "Mật khẩu hiện tại không đúng" | Negative |
| TS-009-06 | New/confirm không khớp | new=abc, confirm=xyz | "Mật khẩu xác nhận không khớp" (frontend) | Validation |
| TS-009-07 | New password < 6 ký tự | new=12345 | Validation error | Validation |
| TS-009-08 | Vào My Requests từ Profile | — | Danh sách đơn nghỉ | Navigation |

---

## US-MA-010: Notifications (🟢 LOW)

| ID | Scenario | Input | Expected | Type |
|---|---|---|---|---|
| TS-010-01 | Load thông báo | — | Danh sách từ API | Happy |
| TS-010-02 | Mark 1 thông báo đã đọc | Bấm vào thông báo | POST /read → isRead=true | Action |
| TS-010-03 | Mark all đã đọc | Bấm "Đọc hết" | POST /read-all → tất cả isRead=true | Action |
| TS-010-04 | Filter tab Nhiệm vụ | — | Chỉ hiện type=task | Filter |
| TS-010-05 | Filter tab Chấm công | — | Chỉ hiện type=attendance | Filter |
| TS-010-06 | Không có thông báo | API trả empty | Empty state | Empty |

---

## US-MA-011: My Requests (🟢 LOW)

| ID | Scenario | Input | Expected | Type |
|---|---|---|---|---|
| TS-011-01 | Load danh sách đơn | — | List leave requests với status | Happy |
| TS-011-02 | Đơn pending | — | Badge vàng "Đang chờ" | UI |
| TS-011-03 | Đơn approved | — | Badge xanh "Đã duyệt" | UI |
| TS-011-04 | Đơn rejected | — | Badge đỏ "Từ chối" + lý do | UI |
| TS-011-05 | Không có đơn nào | API empty | Empty state | Empty |

---

## US-MA-012: Token Refresh (🔴 HIGH)

| ID | Scenario | Input | Expected | Type |
|---|---|---|---|---|
| TS-012-01 | Auto refresh khi 401 | Access token hết hạn → request → 401 | Interceptor refresh → retry → 200 | Happy |
| TS-012-02 | Refresh fail → logout | Refresh token hết hạn | Force logout → Login + toast | Error |
| TS-012-03 | Concurrent 401 | 3 requests cùng 401 | Chỉ 1 refresh call, 3 requests retry cùng token | Edge |
| TS-012-04 | Request sau refresh đúng | Sau refresh | Request dùng token mới, không dùng token cũ | Security |
