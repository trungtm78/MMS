# BUSINESS FLOW — Smart Select (FK Lookup Component)
Task ID: TASK-SS-2026-001 | Version: v1.0 | Date: 2026-03-08

---

## ACTORS

| Actor | Vai trò |
|---|---|
| **office_staff** | Nhập liệu chấm công, KPI — dùng SmartSelect chọn militia, period |
| **police_area** | Giao việc, duyệt nghỉ phép — dùng SmartSelect chọn militia assignee |
| **police_ward** | Quản lý toàn phường — dùng SmartSelect không bị filter unitScope |
| **system_admin** | Tạo/sửa user — dùng SmartSelect chọn role và unitScope |
| **dqtv** | Xem nhiệm vụ — không dùng SmartSelect tạo mới |
| **MMS Backend** | Cung cấp search API, thực thi RBAC, unaccent SQL |
| **PostgreSQL** | Thực thi unaccent/ILIKE, index lookup, trả kết quả |

---

## HAPPY PATH

**Bước 1 — Focus field:**
User click hoặc Tab vào field FK (ví dụ: `assigneeId` trong form Giao việc)
→ SmartSelect focus → dropdown mở
→ Gọi `searchFn("")` → backend trả top 20 records
→ Dropdown hiển thị list với format: `[Code] — Tên` + sub-line thông tin bổ sung

**Bước 2 — Search:**
User gõ keyword tự do (ví dụ: "nguyen van", "T12-001", "0909123")
→ Frontend debounce 300ms
→ Gọi `GET /militia/search?q=nguyen+van&unitScope=PHU_DINH_KP1&limit=20`
→ Backend: `unaccent(LOWER(full_name)) ILIKE unaccent(LOWER('%nguyen van%'))`
→ Kết quả được rank: exact code → startsWith → contains
→ Dropdown update realtime với list mới

**Bước 3 — Navigate:**
User nhấn ArrowDown/ArrowUp hoặc hover mouse
→ Item active highlight với nền blue-50, border blue-500
→ Index active thay đổi theo chiều nhấn

**Bước 4 — Select:**
User nhấn Enter hoặc click item
→ `onChange(record.id, record)` được gọi
→ Input hiển thị label của record đã chọn
→ Dropdown đóng
→ Form nhận UUID làm value

**Bước 5 — Submit:**
User submit form
→ Form gửi `assigneeId: "uuid-của-militia"` lên backend
→ Backend tạo task/attendance/payroll record với FK hợp lệ

---

## EXCEPTIONS

| EX-ID | Điều kiện | Xử lý |
|---|---|---|
| EX-01 | Search trả 0 kết quả | Hiện "Không tìm thấy dữ liệu phù hợp" + button "Tạo mới" (nếu `canCreate=true`) |
| EX-02 | Click "Tạo mới" | Radix Dialog mở, form prefill keyword, user tạo record mới |
| EX-03 | Tạo mới thành công | Modal đóng, SmartSelect tự động chọn record vừa tạo, `onChange` gọi |
| EX-04 | API lỗi / timeout | Hiện "Không thể tải dữ liệu, thử lại" trong dropdown, form không crash |
| EX-05 | Blur ra ngoài, chưa chọn record, `required=true` | Clear text, hiện lỗi "Vui lòng chọn [placeholder]" |
| EX-06 | Nhấn Esc | Đóng dropdown, restore text của record cũ (hoặc rỗng nếu chưa chọn) |
| EX-07 | Nhấn Tab | Chấp nhận item đang active (nếu có), focus chuyển field kế tiếp |
| EX-08 | Context field chưa chọn | SmartSelect child disabled, placeholder "Vui lòng chọn đơn vị trước" |
| EX-09 | Record đang chọn bị inactive | Hiện badge "Không hoạt động" màu amber bên cạnh tên |
| EX-10 | `canCreate=false` + search rỗng | Chỉ hiện "Không tìm thấy", không có button tạo mới |
| EX-11 | Modal tạo mới: submit thiếu field | Lỗi inline trong modal, không đóng modal |
| EX-12 | Modal tạo mới: trùng militia_code / cccd | Hiện lỗi E002 conflict trong modal |

---

## BUSINESS RULES

| BR-ID | Quy tắc | Điều kiện | Logic | Kết quả |
|---|---|---|---|---|
| BR-SS-01 | Required guard | `required=true` + blur + không có record hợp lệ | Hiện error message, block submit | User thấy "Vui lòng chọn [placeholder]" |
| BR-SS-02 | Bind id only | User chọn item | `onChange(record.id, record)` | Form nhận UUID, không phải free text |
| BR-SS-03 | RBAC unit filter | JWT có `unitScope != null` | Backend WHERE `unit.code = $unitScope` | Chỉ thấy record thuộc đơn vị |
| BR-SS-04 | canCreate gate | `canCreate` prop derived từ `useRbac().can.*` | Button "Tạo mới" render/không render | RBAC-controlled |
| BR-SS-05 | Debounce search | User đang gõ | clearTimeout + setTimeout 300ms | Chỉ 1 API call sau 300ms idle |
| BR-SS-06 | Limit kết quả | Mọi search | `LIMIT 20` SQL, API max 50, default 20 | Không bao giờ trả toàn bộ table |
| BR-SS-07 | Dependent reset | Context prop thay đổi | useEffect → reset value + re-fetch | Child SmartSelect cleared và refetch |
| BR-SS-08 | Server-side search | Tất cả entity FK | Không preload, gọi API mỗi keyword | Fresh data, không stale |
| BR-SS-09 | Militia-User mapping | Task giao cho militia | Service: `militia.user_id → task_assignments.assignee_id` | Guard: militia phải có user_id |
| BR-SS-10 | Unaccent matching | Search tiếng Việt | `unaccent(LOWER(field)) ILIKE unaccent(LOWER('%q%'))` | "nguyen" matches "Nguyễn" |

---

## ASSUMPTIONS (đã confirm)

- [x] **A1**: PostgreSQL `unaccent` extension sẽ được enable: `CREATE EXTENSION IF NOT EXISTS unaccent;`
- [x] **A2**: Backend tạo `MilitiaModule`, `UsersModule`, `TasksModule`, `AttendanceModule` mới — các stub dirs đã có
- [x] **A3**: Create new flow dùng **Quick-create inline modal** (Radix Dialog, đã cài sẵn)
- [x] **A4**: Demo screens: TaskCreateForm, AttendanceForm, UserForm, PayrollKpiFilter — tất cả trong 1 sprint
- [x] **A5**: Schema delta Task: `task_assignments.assignee_id` FK → `users.id` trong DB; mapping qua `militia.user_id` ở service layer
- [x] **A6**: Static options (role, unitScope, priority) dùng client-side filter với `normalizeVi()` — không cần API

---

## SCOPE SƠ BỘ

**In scope:**
- `SmartSelect` reusable component (Radix Popover-based, TypeScript generic)
- `useSmartSelect` hook (state machine: keyboard/mouse/debounce/loading)
- `search.ts` utilities (normalizeVi, toAcronym, rankStaticOptions)
- Backend: `/militia/search`, `/militia` (CRUD basic), `/users/search`
- Backend: `/tasks` (POST), `/attendance` (POST, GET /periods)
- 4 demo screens: TaskCreateForm, AttendanceForm, UserForm, PayrollKpiFilter
- Unit tests: SmartSelect, search.ts, useSmartSelect
- E2E: Playwright cho 🔴/🟡 US

**Out of scope:**
- Multi-select
- Virtual scroll (>500 items)
- Server-side acronym matching
- Offline cache / service worker
- Leave request form (militiaId từ session)
- GPS history form
- SOS form
- Audit/Report filters
