# US_LIST — Smart Select Feature
Task ID: TASK-SS-2026-001 | Version: v1.0 | Locked: 2026-03-08

---

## US-SS-01: SmartSelect Core Component
**Actor:** Developer (FE consumer) | **Goal:** Có 1 component reusable cho mọi FK field
**Reason:** Chuẩn hóa UX chọn dữ liệu liên kết toàn hệ thống
**Priority:** Must | **Size:** L | **BR-ref:** BR-SS-01, BR-SS-02, BR-SS-05, BR-SS-06
**UAT Risk:** 🔴 HIGH — Base component dùng ở mọi form; lỗi ảnh hưởng toàn hệ thống

- **AC-1 (Happy — open):** Khi user focus vào SmartSelect → dropdown mở, gọi `searchFn("")` → hiển thị top 20 records với label + sublabel
- **AC-2 (Keyboard ArrowDown):** Khi dropdown đang mở, nhấn ArrowDown → item đầu tiên active; nhấn tiếp → di chuyển xuống; wrap ở cuối list
- **AC-3 (Keyboard ArrowUp):** Khi đang ở item active, nhấn ArrowUp → di chuyển lên; ở item đầu → không wrap (stay)
- **AC-4 (Keyboard Enter):** Khi có item active, nhấn Enter → item được chọn, `onChange(id, record)` gọi, dropdown đóng, input hiển thị label
- **AC-5 (Keyboard Esc):** Khi dropdown mở, nhấn Esc → dropdown đóng, value không thay đổi, input restore text record cũ
- **AC-6 (Keyboard Tab):** Khi có item active, Tab → chọn item đó và chuyển focus; không có item active → chuyển focus giữ value cũ
- **AC-7 (Mouse hover):** Hover item → item highlight (active state); click item → chọn, dropdown đóng
- **AC-8 (Click outside):** Click ra ngoài dropdown → dropdown đóng, validation chạy nếu `required`
- **AC-9 (Validation required):** Khi `required=true` + blur mà chưa chọn record hợp lệ → hiện lỗi `"Vui lòng chọn [placeholder]"`, input border đỏ
- **AC-10 (Disabled):** Khi `disabled=true` → field không tương tác, style opacity-50 cursor-not-allowed
- **AC-11 (Clear):** Khi user đã chọn record, click X button → value cleared, `onChange(null, null)` gọi
- **AC-12 (Loading state):** Trong khi searchFn đang resolve → hiển thị spinner skeleton trong dropdown
- **AC-13 (Pre-selected value):** Khi mount với `value` đã có → fetchById để lấy label, hiển thị trong input

---

## US-SS-02: Smart Search — Free Text + Không Dấu + Viết Tắt
**Actor:** office_staff, police_area, police_ward
**Goal:** Tìm record nhanh bằng nhiều dạng keyword
**Priority:** Must | **Size:** M | **BR-ref:** BR-SS-05, BR-SS-08
**UAT Risk:** 🟡 MED — Core UX, không làm mất dữ liệu nếu lỗi nhưng ảnh hưởng productivity

- **AC-1 (Happy — server search):** Gõ "nguyen van a" → debounce 300ms → API → trả "Nguyễn Văn An" (unaccent server-side ILIKE)
- **AC-2 (Code search):** Gõ "T12-001" → trả record có `militia_code` chứa "T12-001"
- **AC-3 (Phone search):** Gõ "0909123" → trả record có `phone` chứa "0909123"
- **AC-4 (Partial name):** Gõ "binh" → trả "Trần Thị Bình" (unaccent: "binh" matches "Bình")
- **AC-5 (Acronym FE — static):** Với static options, gõ "NVA" → match "Nguyễn Văn An" qua `toAcronym()`
- **AC-6 (Ranking):** Exact code match → rank 0; code startsWith → rank 1; name startsWith → rank 2; contains → rank 3
- **AC-7 (Loading indicator):** Trong khi API pending → spinner/skeleton trong dropdown, không hiện data cũ
- **AC-8 (API error):** Khi API lỗi → hiện "Không thể tải dữ liệu, thử lại" trong dropdown; không crash form
- **AC-9 (Empty keyword):** `q=""` hoặc không gõ gì → trả top 20 records mặc định theo `full_name ASC`
- **AC-10 (Debounce):** Gõ liên tục → chỉ 1 API call sau 300ms idle; không spam server

---

## US-SS-03: Quick-Create Modal
**Actor:** office_staff, police_area, system_admin
**Goal:** Tạo record mới inline khi không tìm thấy, không rời trang
**Priority:** Must | **Size:** L | **BR-ref:** BR-SS-04
**UAT Risk:** 🔴 HIGH — Tạo mới dữ liệu FK; bind sai → form lưu sai record

- **AC-1 (Happy — empty state):** Khi search trả 0 kết quả + `canCreate=true` → hiển thị "Không tìm thấy" + button "Tạo mới"
- **AC-2 (Modal open):** Click "Tạo mới" → Radix Dialog mở; `renderCreateForm` prop render form; keyword prefill vào field name
- **AC-3 (Create success):** Submit form thành công → `onCreateSuccess(newOption)` gọi → modal đóng → SmartSelect tự động chọn record vừa tạo → `onChange(newId, newRecord)` gọi
- **AC-4 (Cancel):** Click Cancel hoặc Esc trong modal → modal đóng → SmartSelect giữ nguyên state trước (keyword vẫn còn)
- **AC-5 (No permission):** `canCreate=false` → empty state chỉ hiện "Không tìm thấy", không có button
- **AC-6 (Modal validation):** Submit modal thiếu required field → hiện lỗi inline, modal không đóng
- **AC-7 (Modal conflict):** Tạo trùng militia_code/cccd → hiện lỗi E002 conflict inline trong modal
- **AC-8 (Modal loading):** Trong khi POST đang pending → nút submit disabled, hiện spinner
- **AC-9 (Partial results):** Khi có ít kết quả (>0 nhưng <5) → hiện kết quả VÀ button "Tạo mới" (cạnh nhau)

---

## US-SS-04: Backend Search API — Militia
**Actor:** Backend/System | **Goal:** Search militia_profiles nhanh, unaccent, RBAC-filtered
**Priority:** Must | **Size:** M | **BR-ref:** BR-SS-03, BR-SS-06, BR-SS-07, BR-SS-08, BR-SS-10
**UAT Risk:** 🟡 MED — Search sai → user chọn sai FK; nhưng có thể sửa

- **AC-1 (Happy):** `GET /militia/search?q=nguyen` → `{ data: MilitiaSearchItem[], total: number }`, chỉ status=active
- **AC-2 (Unit filter):** `?unitScope=PHU_DINH_KP1` → WHERE `units.code = 'PHU_DINH_KP1'`
- **AC-3 (Limit):** `?limit=20` áp dụng; default 20, max 50; vượt 50 → 400 Bad Request
- **AC-4 (JWT required):** Không có Bearer token → 401 `{ code: "E004", message: "missing_token" }`
- **AC-5 (Empty keyword):** `?q=` hoặc không có q → top 20 theo `full_name ASC`
- **AC-6 (Unaccent):** `?q=nguyen van an` match `full_name = 'Nguyễn Văn An'`
- **AC-7 (Performance):** Response < 300ms với dataset seed (3 records); index trên `militia_code`, `full_name`
- **AC-8 (POST /militia):** Tạo mới militia profile → 201 với `MilitiaSearchItem` shape
- **AC-9 (POST RBAC):** Chỉ role ≥ office_staff mới POST; dqtv → 403

---

## US-SS-05: Backend Search API — Users
**Actor:** Backend/System | **Goal:** Search users cho admin screens
**Priority:** Should | **Size:** S | **BR-ref:** BR-SS-03, BR-SS-06
**UAT Risk:** 🟢 LOW — Chỉ dùng trong admin, ít user

- **AC-1 (Happy):** `GET /users/search?q=admin` → users match `username` hoặc `full_name`
- **AC-2 (Role filter):** `?role=office_staff` → filter theo role via `user_roles`
- **AC-3 (RBAC):** Chỉ `system_admin`; khác → 403
- **AC-4 (Status):** Mặc định chỉ trả `status = 'active'`

---

## US-SS-06: Static Options SmartSelect (Role/UnitScope/Priority)
**Actor:** system_admin, police_area | **Goal:** SmartSelect nhất quán cho enum nhỏ
**Priority:** Should | **Size:** S | **BR-ref:** BR-SS-01
**UAT Risk:** 🟢 LOW — Static data, không server call

- **AC-1 (Happy):** `options=[{id:'police_ward', label:'Công an phường'}...]` → filter client-side khi gõ
- **AC-2 (Unaccent FE):** Gõ "cong an" → match "Công an phường" qua `normalizeVi()`
- **AC-3 (Acronym FE):** Gõ "CA" → match "Công an phường", "Công an khu vực"
- **AC-4 (Case insensitive):** Gõ "SYSTEM" → match "system_admin" label

---

## US-SS-07: Dependent Context Filter
**Actor:** office_staff, police_area | **Goal:** SmartSelect child lọc theo parent field
**Priority:** Should | **Size:** S | **BR-ref:** BR-SS-07
**UAT Risk:** 🟡 MED — Filter sai → user chọn record ngoài phạm vi

- **AC-1 (Happy):** `context={{ unitScope: 'PHU_DINH_KP1' }}` → `searchFn` tự động gửi `?unitScope=PHU_DINH_KP1`
- **AC-2 (Context change):** Khi parent field thay đổi → child SmartSelect reset value + re-fetch với context mới
- **AC-3 (No context):** `context` có key nhưng value rỗng → SmartSelect disabled, placeholder "Vui lòng chọn [parent] trước"

---

## US-SS-08: Demo Screen — Task Create Form
**Actor:** police_area, police_ward, office_staff
**Goal:** Giao nhiệm vụ cho DQTV qua form có SmartSelect
**Priority:** Must | **Size:** M | **BR-ref:** BR-SS-01, BR-SS-02, BR-SS-04, BR-SS-09
**UAT Risk:** 🟡 MED — Giao sai người → công việc không được thực hiện

- **AC-1 (Happy):** Form có SmartSelect `assigneeId` → search militia → chọn → submit → `POST /tasks`
- **AC-2 (Required):** Submit thiếu assigneeId → validation error "Vui lòng chọn người thực hiện"
- **AC-3 (Quick create):** Tìm không thấy → click "Tạo mới" → modal → điền militia → submit → tự bind
- **AC-4 (RBAC view):** Chỉ role ≥ police_area thấy form tạo; dqtv thấy readonly list
- **AC-5 (Militia mapping):** assigneeId là militia_profiles.id → service lấy militia.user_id để insert task_assignments

---

## US-SS-09: Demo Screen — Attendance Form
**Actor:** office_staff, police_area
**Goal:** Chấm công cho militia theo kỳ với SmartSelect
**Priority:** Must | **Size:** M
**UAT Risk:** 🟡 MED — Ghi sai militia → KPI/lương sai

- **AC-1 (Happy):** SmartSelect `militiaId` + SmartSelect `periodId` → chọn → submit → `POST /attendance`
- **AC-2 (Period filter):** periodId SmartSelect chỉ hiển thị periods có `status = 'open'`
- **AC-3 (Unit context):** militiaId SmartSelect filter theo `unitScope` của user đang login (context từ useAuth)
- **AC-4 (Date validation):** Date phải nằm trong khoảng period đã chọn

---

## US-SS-10: Demo Screen — User Form (Admin)
**Actor:** system_admin
**Goal:** Tạo/sửa user với role và unitScope dùng SmartSelect
**Priority:** Should | **Size:** S
**UAT Risk:** 🟢 LOW — Static options, ít rủi ro

- **AC-1 (Happy):** SmartSelect `role` (static enum) + SmartSelect `unitScope` (static unit codes) hoạt động
- **AC-2 (Conditional disabled):** `unitScope` disabled và cleared khi role là `system_admin` hoặc `ubnd_leader`

---

## US-SS-11: Demo Screen — Payroll KPI Filter
**Actor:** office_staff, police_ward
**Goal:** Lọc bảng KPI theo kỳ lương và militia
**Priority:** Should | **Size:** S
**UAT Risk:** 🟢 LOW — Read-only filter, không mutate

- **AC-1 (Happy):** SmartSelect `periodId` (kpi_periods) + optional `militiaId` → filter danh sách KPI
- **AC-2 (Period preload):** Periods list nhỏ (<24 records) → preload toàn bộ, không cần search API

---

## SCOPE LOCK

```
IN_SCOPE (Must):
  US-SS-01 🔴  SmartSelect core component (keyboard + mouse + validation + clear + loading)
  US-SS-02 🟡  Smart search (server-side unaccent + client-side normalizeVi + toAcronym)
  US-SS-03 🔴  Quick-create modal (inline Radix Dialog, bind-back after create)
  US-SS-04 🟡  GET /militia/search + POST /militia (unaccent SQL, RBAC, limit)
  US-SS-08 🟡  TaskCreateForm (assigneeId → militia SmartSelect + RBAC)
  US-SS-09 🟡  AttendanceForm (militiaId + periodId SmartSelect + context filter)

IN_SCOPE (Should):
  US-SS-05 🟢  GET /users/search (system_admin only)
  US-SS-06 🟢  Static SmartSelect (role, unitScope, priority enum options)
  US-SS-07 🟡  Dependent context filter (context prop → searchFn params)
  US-SS-10 🟢  UserForm (role + unitScope static SmartSelect)
  US-SS-11 🟢  PayrollKpiFilter (period + militia SmartSelect, preload periods)
  BE extras:   TasksModule (POST /tasks), AttendanceModule (GET /periods, POST /attendance)

OUT_OF_SCOPE:
  - Multi-select variant
  - Virtual scroll (dataset < 1000 records hiện tại)
  - Server-side acronym matching
  - Offline cache / PWA
  - Leave form SmartSelect (militiaId từ session user)
  - GPS history militia picker
  - SOS alert form
  - Audit/Report filters
  - Full pagination trong dropdown (scroll-load-more)

SCHEMA FIX:
  task_assignments.assignee_id → users.id (DB schema 003)
  GIẢI PHÁP: Service-level mapping militia_profile.user_id → assignee_id
  GUARD: militia phải có user_id != null mới được giao task

ACCEPTANCE CRITERIA TỔNG THỂ:
  - [ ] US-SS-01, US-SS-03 (🔴): 100% AC có Playwright E2E pass + Screenshot Manifest
  - [ ] US-SS-02, US-SS-07, US-SS-08, US-SS-09 (🟡): Happy path + ≥1 error path E2E pass
  - [ ] US-SS-05, US-SS-06, US-SS-10, US-SS-11 (🟢): Happy path pass
  - [ ] Unit coverage ≥ 80%: SmartSelect.tsx, search.ts, useSmartSelect.ts
  - [ ] FE Lint: 0 errors (tsc + eslint)
  - [ ] BE Lint: 0 errors
  - [ ] BE: search endpoints response < 300ms với seed data
  - [ ] EXECUTION_RETURN.md: không banned patterns
```
