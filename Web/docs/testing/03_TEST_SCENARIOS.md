# TEST SCENARIOS — Smart Select Feature
Task ID: TASK-SS-2026-001 | Version: v1.0 | Date: 2026-03-08
Total: 156 scenarios | Risk distribution: 🔴 HIGH: 52 | 🟡 MED: 68 | 🟢 LOW: 36

---

## SECTION 1: SmartSelect Core Component (US-SS-01) 🔴 HIGH

### 1.1 Open/Close Behavior

| ID | Scenario | Input | Expected | Type |
|---|---|---|---|---|
| SS-01-001 | Focus opens dropdown | Tab vào field | Dropdown visible | Happy |
| SS-01-002 | Click opens dropdown | Click vào input | Dropdown visible | Happy |
| SS-01-003 | Click outside closes | Click ngoài dropdown | Dropdown hidden | Happy |
| SS-01-004 | Esc closes dropdown | Nhấn Esc | Dropdown hidden, value unchanged | Happy |
| SS-01-005 | Dropdown shows loading on open | Mở (searchFn async) | Spinner visible | Happy |
| SS-01-006 | Double click does not duplicate | Click field 2 lần | Dropdown mở 1 lần | Edge |
| SS-01-007 | Blur without select closes | Click ngoài chưa chọn | Dropdown đóng | Happy |

### 1.2 Keyboard Navigation

| ID | Scenario | Input | Expected | Type |
|---|---|---|---|---|
| SS-01-010 | ArrowDown từ closed | Closed + ↓ | Dropdown mở, item[0] active | Happy |
| SS-01-011 | ArrowDown di chuyển xuống | Open, item[0] active + ↓ | item[1] active | Happy |
| SS-01-012 | ArrowDown clamp ở cuối | Ở item cuối + ↓ | Vẫn ở item cuối (không wrap) | Boundary |
| SS-01-013 | ArrowUp di chuyển lên | item[1] active + ↑ | item[0] active | Happy |
| SS-01-014 | ArrowUp clamp ở đầu | item[0] active + ↑ | Vẫn ở item[0] | Boundary |
| SS-01-015 | Enter chọn item active | item[1] active + Enter | onChange gọi với item[1].id | Happy |
| SS-01-016 | Enter không có item active | No active + Enter | Không gọi onChange | Edge |
| SS-01-017 | Tab với item active | item[0] active + Tab | onChange gọi, focus chuyển | Happy |
| SS-01-018 | Tab không có item active | No active + Tab | Focus chuyển, value giữ nguyên | Happy |
| SS-01-019 | Esc restore text | Selected "Nguyễn Văn An", gõ "xyz", Esc | searchText = "Nguyễn Văn An" | Happy |
| SS-01-020 | Esc từ empty state | Chưa chọn, gõ "abc", Esc | searchText = "" | Happy |
| SS-01-021 | Rapid keystrokes | Gõ nhanh nhiều ký tự | Chỉ 1 API call sau 300ms | Performance |

### 1.3 Mouse Interaction

| ID | Scenario | Input | Expected | Type |
|---|---|---|---|---|
| SS-01-030 | Hover highlight | Hover item | Item bg-slate-50 | Happy |
| SS-01-031 | Click chọn item | Click item | onChange gọi, dropdown đóng | Happy |
| SS-01-032 | Hover không thay đổi value | Hover item[2] | activeIndex = 2, value chưa đổi | Happy |
| SS-01-033 | Click disabled item | Click item.disabled=true | Không gọi onChange | Edge |
| SS-01-034 | Scroll trong dropdown | List dài > 5 items, scroll | Dropdown scroll, không đóng | Happy |

### 1.4 Value Binding & Display

| ID | Scenario | Input | Expected | Type |
|---|---|---|---|---|
| SS-01-040 | Select item hiển thị label | Chọn "Nguyễn Văn An" | Input text = "HCM-PHD-T12-0001 — Nguyễn Văn An" | Happy |
| SS-01-041 | onChange nhận UUID | Chọn item | onChange(id) = UUID string | Happy |
| SS-01-042 | onChange nhận option object | Chọn item | onChange(id, option) với full meta | Happy |
| SS-01-043 | Pre-selected value mount | value prop = existing UUID | fetchByIdFn gọi, label hiển thị | Happy |
| SS-01-044 | Pre-selected value not found | value prop = UUID không tồn tại | fetchByIdFn → 404 → clear value | Edge |
| SS-01-045 | Clear button | Đã chọn, click × | onChange(null, null), input rỗng | Happy |
| SS-01-046 | Clear không hiện khi chưa chọn | value = null | × không visible | Happy |

### 1.5 Required Validation

| ID | Scenario | Input | Expected | Type |
|---|---|---|---|---|
| SS-01-050 | Required + blur without select | required=true, blur không chọn | Error "Vui lòng chọn..." | Validation |
| SS-01-051 | Required + select = no error | required=true, chọn item | Error ẩn | Happy |
| SS-01-052 | Not required + blur = no error | required=false, blur | Không có error | Happy |
| SS-01-053 | Error disappears after select | Error visible, chọn item | Error ẩn | Validation |
| SS-01-054 | External error prop hiển thị | error="custom error" | "custom error" visible | Happy |
| SS-01-055 | Form submit blocked | required, không chọn, submit | Form không submit | Validation |

### 1.6 Disabled State

| ID | Scenario | Input | Expected | Type |
|---|---|---|---|---|
| SS-01-060 | Disabled không mở dropdown | disabled=true, click | Dropdown không mở | Happy |
| SS-01-061 | Disabled style | disabled=true | opacity-50, cursor-not-allowed | Happy |
| SS-01-062 | Disabled không nhận keyboard | disabled=true, ArrowDown | Không xử lý | Happy |

---

## SECTION 2: Smart Search (US-SS-02) 🟡 MED

### 2.1 Server-Side Search (searchFn)

| ID | Scenario | Input | Expected | Type |
|---|---|---|---|---|
| SS-02-001 | Search by name | q="nguyen" | Trả records có fullName chứa "nguyen" (unaccent) | Happy |
| SS-02-002 | Search không dấu | q="nguyen van an" | Match "Nguyễn Văn An" | Happy |
| SS-02-003 | Search code prefix | q="HCM-PHD" | Match militiaCode ILIKE '%HCM-PHD%' | Happy |
| SS-02-004 | Search phone | q="0909123" | Match records có phone chứa "0909123" | Happy |
| SS-02-005 | Empty keyword | q="" | Trả top 20 theo fullName ASC | Happy |
| SS-02-006 | Keyword uppercase | q="NGUYEN" | Match case-insensitive | Happy |
| SS-02-007 | Partial match | q="binh" | Match "Trần Thị Bình" (unaccent: binh=Bình) | Happy |
| SS-02-008 | API error | Network fail | Hiện "Không thể tải dữ liệu" trong dropdown | Error |
| SS-02-009 | API 401 | Token expired | Axios interceptor → silent refresh → retry | Error |
| SS-02-010 | Debounce 300ms | Gõ "a", "ab", "abc" liên tục | Chỉ 1 API call sau 300ms từ "abc" | Performance |
| SS-02-011 | Cancel in-flight | Gõ "a" → ngay gõ "ab" | Request "a" bị cancel, chỉ "ab" thực hiện | Performance |

### 2.2 Ranking

| ID | Scenario | Input | Expected | Type |
|---|---|---|---|---|
| SS-02-020 | Exact code rank đầu | q="HCM-PHD-T12-0001" | Record đó ở vị trí 0 | Happy |
| SS-02-021 | Code startsWith rank 2 | q="HCM-PHD-T12" | Records startsWith ở trên | Happy |
| SS-02-022 | Name startsWith rank 3 | q="Nguyen" | startsWith name trước contains | Happy |
| SS-02-023 | Contains rank cuối | q="van" | Contains ở cuối | Happy |

### 2.3 Client-Side Search (static options)

| ID | Scenario | Input | Expected | Type |
|---|---|---|---|---|
| SS-02-030 | Filter static options | q="police" | Match "police_ward", "police_area" labels | Happy |
| SS-02-031 | normalizeVi match | q="cong an" | Match "Công an phường" | Happy |
| SS-02-032 | toAcronym match | q="CAP" | Match "Công an phường" (Công An Phường=CAP) | Happy |
| SS-02-033 | Case insensitive static | q="SYSTEM" | Match "system_admin" label | Happy |
| SS-02-034 | No match static | q="zzz" | Empty state | Happy |

---

## SECTION 3: Quick-Create Modal (US-SS-03) 🔴 HIGH

### 3.1 Empty State & Modal Trigger

| ID | Scenario | Input | Expected | Type |
|---|---|---|---|---|
| SS-03-001 | Empty state hiện khi 0 results | Search trả rỗng | "Không tìm thấy" message | Happy |
| SS-03-002 | "Tạo mới" hiện khi canCreate=true | 0 results + canCreate | Button "Tạo mới" visible | Happy |
| SS-03-003 | "Tạo mới" ẩn khi canCreate=false | 0 results + !canCreate | Button không visible | Auth |
| SS-03-004 | Modal mở khi click "Tạo mới" | Click button | Radix Dialog visible | Happy |
| SS-03-005 | Keyword prefill trong modal | q="Pham Thi", click Tạo mới | fullName input = "Pham Thi" | Happy |
| SS-03-006 | Partial results: vẫn hiện Tạo mới | 1-2 kết quả + canCreate | Cả kết quả VÀ button | Edge |

### 3.2 Modal Form Behavior

| ID | Scenario | Input | Expected | Type |
|---|---|---|---|---|
| SS-03-010 | Modal validation required | Submit thiếu fullName | Lỗi inline, modal không đóng | Validation |
| SS-03-011 | Modal validation CCCD format | CCCD = "123" (< 12 digits) | Lỗi "CCCD phải đúng 12 số" | Validation |
| SS-03-012 | Modal submit loading | Click "Tạo mới →" | Button disabled + spinner | Happy |
| SS-03-013 | Modal conflict 409 | militiaCode đã tồn tại | Lỗi "Mã hoặc CCCD đã tồn tại" inline | Error |
| SS-03-014 | Modal cancel | Click Hủy | Modal đóng, SmartSelect giữ nguyên state | Happy |
| SS-03-015 | Modal Esc | Nhấn Esc trong modal | Modal đóng | Happy |
| SS-03-016 | Modal click overlay | Click backdrop | Modal đóng | Happy |

### 3.3 Create Success & Bind-Back

| ID | Scenario | Input | Expected | Type |
|---|---|---|---|---|
| SS-03-020 | Create success bind | POST thành công | Modal đóng, SmartSelect chọn record mới | Happy |
| SS-03-021 | onChange gọi sau create | Create success | onChange(newId, newOption) gọi | Happy |
| SS-03-022 | New option hiển thị đúng | Create "Phạm Thị Dung" | Label = "HCM-PHD-T12-XXXX — Phạm Thị Dung" | Happy |
| SS-03-023 | Form không mất data | Đang điền Task form, create militia | Task form giữ nguyên các field khác | Happy |

---

## SECTION 4: Backend Search API Militia (US-SS-04) 🟡 MED

### 4.1 Happy Path

| ID | Scenario | Input | Expected | Type |
|---|---|---|---|---|
| SS-04-001 | Search trả kết quả | GET /militia/search?q=nguyen | 200, data array, total number | Happy |
| SS-04-002 | Response shape đúng | GET /militia/search?q= | data[0] có id, militiaCode, fullName, phone, unitCode, unitName | Happy |
| SS-04-003 | Default limit 20 | GET /militia/search | Không quá 20 records | Happy |
| SS-04-004 | Custom limit | GET /militia/search?limit=5 | Tối đa 5 records | Happy |
| SS-04-005 | Unaccent search | q=nguyen van an | Match fullName=Nguyễn Văn An | Happy |
| SS-04-006 | Phone search | q=0909123 | Match phone chứa chuỗi | Happy |
| SS-04-007 | Empty q | q= | Top 20 theo fullName ASC | Happy |
| SS-04-008 | UnitScope filter | unitScope=PHU_DINH_KP1 | Chỉ trả militia thuộc unit đó | Happy |

### 4.2 Validation & Errors

| ID | Scenario | Input | Expected | Type |
|---|---|---|---|---|
| SS-04-010 | Limit > 50 | limit=51 | 400 E001 | Validation |
| SS-04-011 | Không có token | No Authorization header | 401 E004 | Auth |
| SS-04-012 | Token invalid | Malformed JWT | 401 E004 | Auth |
| SS-04-013 | Token expired | Expired JWT | 401 E004 (FE auto-refresh) | Auth |
| SS-04-014 | Only active returned | Seed data has active records | status=inactive không trong kết quả | Happy |
| SS-04-015 | GET /militia/:id found | id = existing UUID | 200 với record | Happy |
| SS-04-016 | GET /militia/:id not found | id = random UUID | 404 E003 | Error |

### 4.3 POST /militia

| ID | Scenario | Input | Expected | Type |
|---|---|---|---|---|
| SS-04-020 | Create valid | Valid body | 201, new record với id | Happy |
| SS-04-021 | Create thiếu militiaCode | Missing militiaCode | 400 E001 | Validation |
| SS-04-022 | Create trùng CCCD | cccd đã tồn tại | 409 E002 | Error |
| SS-04-023 | Create trùng militiaCode | code đã tồn tại | 409 E002 | Error |
| SS-04-024 | RBAC: dqtv không được POST | role=dqtv + POST | 403 E004 | Auth |
| SS-04-025 | RBAC: office_staff được POST | role=office_staff + POST | 201 | Auth |

---

## SECTION 5: Static Options SmartSelect (US-SS-06) 🟢 LOW

| ID | Scenario | Input | Expected | Type |
|---|---|---|---|---|
| SS-06-001 | Hiển thị tất cả options khi mở | Focus, q="" | Tất cả static options visible | Happy |
| SS-06-002 | Filter theo label | q="cong an" | Chỉ hiện Công an phường, Công an khu vực | Happy |
| SS-06-003 | normalizeVi filter | q="quan tri" | Match "Quản trị hệ thống" | Happy |
| SS-06-004 | Acronym filter | q="QLTT" | Match có acronym | Happy |
| SS-06-005 | Không match | q="zzz" | Empty state | Happy |
| SS-06-006 | Select static option | Click "Công an phường" | onChange("police_ward", option) | Happy |
| SS-06-007 | Static không gọi API | Gõ vào static SmartSelect | Không có network request | Happy |

---

## SECTION 6: Dependent Context Filter (US-SS-07) 🟡 MED

| ID | Scenario | Input | Expected | Type |
|---|---|---|---|---|
| SS-07-001 | Context filter áp dụng | context={unitScope:"KP1"} | searchFn gọi với unitScope=KP1 | Happy |
| SS-07-002 | Context thay đổi reset child | Parent thay unitScope → child reset | Child value = null, re-fetch | Happy |
| SS-07-003 | Context null → disabled | context={unitScope:""} | Child disabled + placeholder | Happy |
| SS-07-004 | Context thay đổi nhiều lần | Parent thay đổi 3 lần | Child reset 3 lần, fetch cuối | Edge |
| SS-07-005 | Context không ảnh hưởng static | context truyền vào static SmartSelect | Không filter theo context | Edge |

---

## SECTION 7: Task Create Form (US-SS-08) 🟡 MED

| ID | Scenario | Input | Expected | Type |
|---|---|---|---|---|
| SS-08-001 | Form render | Open task form | Tất cả fields visible | Happy |
| SS-08-002 | SmartSelect militia hoạt động | Gõ "nguyen", chọn kết quả | assigneeId bound | Happy |
| SS-08-003 | Submit happy path | Điền đầy đủ, submit | POST /tasks, 201 | Happy |
| SS-08-004 | Submit thiếu assigneeId | Bỏ trống người thực hiện | Validation error visible | Validation |
| SS-08-005 | Submit thiếu title | Bỏ trống tiêu đề | Error "Vui lòng nhập tiêu đề" | Validation |
| SS-08-006 | Deadline quá khứ | deadline = hôm qua | Error "Hạn hoàn thành phải ở tương lai" | Validation |
| SS-08-007 | Quick create trong task form | 0 results, click Tạo mới | Militia modal mở | Happy |
| SS-08-008 | Quick create → bind | Create militia thành công | assigneeId = new militia id | Happy |
| SS-08-009 | RBAC: dqtv thấy readonly | Login dqtv, mở tasks | Form tạo ẩn | Auth |
| SS-08-010 | Militia no user_id | Chọn militia không có user_id | 400 "militia_no_user_account" | Error |

---

## SECTION 8: Attendance Form (US-SS-09) 🟡 MED

| ID | Scenario | Input | Expected | Type |
|---|---|---|---|---|
| SS-09-001 | Form render | Open attendance form | militia + period SmartSelect visible | Happy |
| SS-09-002 | Period SmartSelect | Mở period dropdown | Chỉ periods có status=open | Happy |
| SS-09-003 | Militia context filter | User unitScope=KP1 | searchFn gọi với unitScope=KP1 | Happy |
| SS-09-004 | Submit happy | Đầy đủ fields | POST /attendance, 201 | Happy |
| SS-09-005 | Submit trùng date | Ngày đã có record | 409 E002 | Error |
| SS-09-006 | CheckOut < CheckIn | Giờ ra < giờ vào | Error "Giờ ra phải sau giờ vào" | Validation |
| SS-09-007 | Absent không cần giờ | status=absent | checkIn/checkOut optional | Edge |

---

## SECTION 9: User Form (US-SS-10) 🟢 LOW

| ID | Scenario | Input | Expected | Type |
|---|---|---|---|---|
| SS-10-001 | Role SmartSelect hoạt động | Gõ "cong", chọn | onChange("police_ward",...) | Happy |
| SS-10-002 | unitScope disabled khi admin | role = system_admin | unitScope SmartSelect disabled | Happy |
| SS-10-003 | unitScope clear khi admin | Chọn role=police_area rồi system_admin | unitScope cleared | Happy |
| SS-10-004 | unitScope required khi police_area | role=police_area, submit thiếu unitScope | Error | Validation |

---

## SECTION 10: Payroll KPI Filter (US-SS-11) 🟢 LOW

| ID | Scenario | Input | Expected | Type |
|---|---|---|---|---|
| SS-11-001 | Period preload | Mở filter | Periods list từ /payroll/periods | Happy |
| SS-11-002 | Optional militia | Không chọn militia | Filter chỉ theo period | Happy |
| SS-11-003 | Chọn cả hai | period + militia | Filter theo cả hai | Happy |

---

## SECTION 11: search.ts Utilities (Unit Tests) 🔴 HIGH

| ID | Scenario | Input | Expected | Type |
|---|---|---|---|---|
| SS-U-001 | normalizeVi basic | "Nguyễn Văn An" | "nguyen van an" | Happy |
| SS-U-002 | normalizeVi tone marks | "Phòng Kinh Doanh" | "phong kinh doanh" | Happy |
| SS-U-003 | normalizeVi empty | "" | "" | Boundary |
| SS-U-004 | normalizeVi numbers | "KP1" | "kp1" | Happy |
| SS-U-005 | toAcronym basic | "Nguyễn Văn An" | "NVA" | Happy |
| SS-U-006 | toAcronym multi-word | "Công Ty Thiên Long" | "CTTL" | Happy |
| SS-U-007 | toAcronym single word | "Admin" | "A" | Boundary |
| SS-U-008 | toAcronym empty | "" | "" | Boundary |
| SS-U-009 | scoreOption exact match | q="police_ward", option.id="police_ward" | score = 4 | Happy |
| SS-U-010 | scoreOption startsWith | q="police", option.label starts "police_ward" | score = 3 | Happy |
| SS-U-011 | scoreOption contains | q="ward", option.label contains "ward" | score = 2 | Happy |
| SS-U-012 | scoreOption acronym | q="PW", option.label="Police Ward" | score = 1 | Happy |
| SS-U-013 | scoreOption no match | q="zzz", option.label="police" | score = 0 | Happy |
| SS-U-014 | rankStaticOptions sort | 3 options, mixed scores | Sorted highest score first | Happy |
| SS-U-015 | rankStaticOptions filter 0 | Options with score 0 | Excluded from results | Happy |
| SS-U-016 | rankStaticOptions empty q | q="" | All options returned | Boundary |

---

## SECTION 12: useSmartSelect Hook (Unit Tests) 🔴 HIGH

| ID | Scenario | Input | Expected | Type |
|---|---|---|---|---|
| SS-H-001 | Initial state | Mount hook | isOpen=false, activeIndex=-1 | Happy |
| SS-H-002 | Open sets isOpen | dispatch OPEN | isOpen=true | Happy |
| SS-H-003 | MOVE_DOWN from -1 | dispatch MOVE_DOWN | activeIndex=0 | Happy |
| SS-H-004 | MOVE_DOWN clamp | activeIndex=last, MOVE_DOWN | activeIndex unchanged | Boundary |
| SS-H-005 | MOVE_UP from 0 | activeIndex=0, MOVE_UP | activeIndex=0 | Boundary |
| SS-H-006 | SELECT_ACTIVE | activeIndex=1, SELECT_ACTIVE | selectedOption=options[1] | Happy |
| SS-H-007 | CLOSE restores text | Gõ "abc", CLOSE | searchText = selectedOption.label || "" | Happy |
| SS-H-008 | isTouched triggers | OPEN then CLOSE | isTouched=true | Happy |
| SS-H-009 | Debounce fires once | SET_SEARCH 5 lần nhanh | searchFn gọi 1 lần | Happy |
| SS-H-010 | Context change resets | context thay đổi | selectedOption=null, re-fetch | Happy |
