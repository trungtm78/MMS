# UAT CASES — Smart Select Feature
Task ID: TASK-SS-2026-001 | Version: v1.0 | Date: 2026-03-08

---

## UAT-SS-01: SmartSelect Core — Keyboard Navigation 🔴 HIGH

**Pre-condition:** User đã đăng nhập (role ≥ office_staff). Đang ở trang Task Create.

**Steps:**
1. Click vào field "Người thực hiện"
2. Verify dropdown mở, có danh sách militia
3. Nhấn ArrowDown 2 lần
4. Verify item thứ 2 được highlight (active)
5. Nhấn ArrowUp 1 lần
6. Verify item thứ 1 được highlight
7. Nhấn Enter
8. Verify item được chọn, dropdown đóng, input hiển thị tên

**Expected:** Keyboard navigation hoạt động chính xác, value được bind
**Screenshot:** `uat-ss01-keyboard-nav.png`

---

## UAT-SS-02: SmartSelect Core — Mouse Click 🔴 HIGH

**Pre-condition:** Như trên

**Steps:**
1. Click vào field "Người thực hiện"
2. Hover item "Nguyễn Văn An"
3. Verify item highlight màu xanh nhạt
4. Click vào item
5. Verify item được chọn, dropdown đóng
6. Verify input hiển thị "HCM-PHD-T12-0001 — Nguyễn Văn An"
7. Click vào X để clear
8. Verify input rỗng, value = null

**Expected:** Mouse interaction hoạt động đầy đủ
**Screenshot:** `uat-ss02-mouse-click.png`

---

## UAT-SS-03: Smart Search — Không Dấu 🟡 MED

**Pre-condition:** Có militia "Nguyễn Văn An" trong DB

**Steps:**
1. Click field "Người thực hiện"
2. Gõ "nguyen van an"
3. Chờ 300ms (debounce)
4. Verify dropdown hiện "Nguyễn Văn An"
5. Gõ "binh"
6. Verify hiện "Trần Thị Bình"
7. Gõ "T12-0001"
8. Verify hiện record có code HCM-PHD-T12-0001

**Expected:** Tìm kiếm không dấu và theo code hoạt động
**Screenshot:** `uat-ss03-unaccent-search.png`

---

## UAT-SS-04: Quick-Create Modal — Tạo Militia Mới 🔴 HIGH

**Pre-condition:** User role = office_staff. Search keyword không có kết quả.

**Steps:**
1. Click field "Người thực hiện"
2. Gõ "Pham Thi Dung Moi"
3. Verify dropdown hiện "Không tìm thấy" + button "Tạo mới"
4. Click "Tạo mới"
5. Verify modal mở, field "Họ và tên" prefilled với "Pham Thi Dung Moi"
6. Điền: militiaCode="HCM-PHD-T12-0099", cccd="079099099099", dob="2000-01-01", unitCode=KP1, joinDate=today
7. Click "Tạo mới →"
8. Verify modal đóng
9. Verify field "Người thực hiện" tự động chọn militia vừa tạo
10. Verify form Task có thể submit được

**Expected:** Quick-create hoàn chỉnh, bind-back đúng
**Screenshot:** `uat-ss04-quick-create.png`

---

## UAT-SS-05: Required Validation 🔴 HIGH

**Pre-condition:** Task Create Form mở

**Steps:**
1. Điền Title "Test task"
2. Không chọn "Người thực hiện"
3. Chọn Priority = Cao
4. Đặt deadline hợp lệ
5. Click "Giao nhiệm vụ"
6. Verify error "Vui lòng chọn người thực hiện" hiển thị dưới field
7. Verify form không submit
8. Chọn militia
9. Verify error biến mất
10. Submit lại → thành công

**Expected:** Required validation hoạt động đúng
**Screenshot:** `uat-ss05-required-validation.png`

---

## UAT-SS-06: Dependent Context Filter 🟡 MED

**Pre-condition:** Attendance Form có SmartSelect militia phụ thuộc user unitScope

**Steps:**
1. Login với user có unitScope=PHU_DINH_KP1
2. Mở Attendance Form
3. Click field "Dân quân"
4. Gõ keyword (hoặc để trống)
5. Verify chỉ hiện militia thuộc PHU_DINH_KP1

**Expected:** Filter đúng theo context
**Screenshot:** `uat-ss06-context-filter.png`

---

## UAT-SS-07: Static Options — Role SmartSelect 🟢 LOW

**Pre-condition:** Admin đang tạo user mới

**Steps:**
1. Mở User Form
2. Click field "Vai trò"
3. Gõ "cong an"
4. Verify hiện "Công an phường" và "Công an khu vực" (unaccent client-side)
5. Gõ "CA"
6. Verify match qua acronym
7. Chọn "Công an khu vực"
8. Verify "Đơn vị" field enable và required
9. Chọn role "Quản trị hệ thống"
10. Verify "Đơn vị" field disabled và cleared

**Expected:** Static SmartSelect hoạt động với normalize + conditional behavior
**Screenshot:** `uat-ss07-static-options.png`

---

## UAT-SS-08: API Error Handling 🟡 MED

**Pre-condition:** Network có thể điều khiển (DevTools → Network throttle)

**Steps:**
1. Open Network → Block request to /militia/search
2. Click field "Người thực hiện"
3. Gõ keyword
4. Verify dropdown hiện "Không thể tải dữ liệu, thử lại"
5. Unblock network
6. Click "Thử lại" (hoặc gõ lại)
7. Verify kết quả hiện đúng

**Expected:** Error handling không crash form, có retry
**Screenshot:** `uat-ss08-api-error.png`
