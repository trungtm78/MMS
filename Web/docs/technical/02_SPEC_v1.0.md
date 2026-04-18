# TECHNICAL SPEC v1.0 — Smart Select Feature
Task ID: TASK-SS-2026-001 | Version: v1.0 | Date: 2026-03-08

---

## 1. TECH STACK

| Layer | Tech | Notes |
|---|---|---|
| Frontend | React 18 + Vite 6 + TypeScript 5.8 | Existing |
| UI Primitives | Radix UI (Popover, Dialog, Label) | Already installed |
| Styling | TailwindCSS v4 | Existing |
| Form | react-hook-form v7 + zod v3 | Installed, not yet used |
| Server State | TanStack Query v5 | Installed, not yet used |
| Icons | lucide-react | Existing |
| Toast | sonner | Existing |
| Backend | NestJS 11 + TypeScript | Existing |
| ORM | TypeORM 0.3 (raw SQL for search) | Existing |
| DB | PostgreSQL on localhost:5433, DB: MMS | Existing |
| Validation BE | class-validator + ValidationPipe (whitelist: true) | Existing |
| Auth | JWT (JwtAuthGuard) + RolesGuard | Existing |

---

## 2. COMPONENT ARCHITECTURE

### SmartSelect<T> — Props Interface

```typescript
export interface SmartSelectOption {
  id: string                          // UUID or enum key
  label: string                       // Primary display: "HCM-PHD-T12-0001 — Nguyễn Văn An"
  sublabel?: string                   // Secondary: "0909123456 | KP1 - Phú Định"
  disabled?: boolean                  // true = inactive record
  meta?: Record<string, unknown>      // Full record for consumer use
}

export interface SmartSelectProps<T = SmartSelectOption> {
  // Identifier
  name: string                        // Used for data-testid and form field name

  // Value binding
  value: string | null                // Currently selected record id
  onChange: (id: string | null, option: SmartSelectOption | null) => void

  // Data source — provide ONE of:
  options?: SmartSelectOption[]       // Static list (role, unitScope, priority)
  searchFn?: (                        // Async server search
    q: string,
    context?: Record<string, string>
  ) => Promise<SmartSelectOption[]>
  fetchByIdFn?: (id: string) => Promise<SmartSelectOption | null>  // Load label for existing value

  // Behavior config
  placeholder?: string                // Input placeholder text
  required?: boolean                  // Validation: must select a record
  disabled?: boolean                  // Full disable
  debounceMs?: number                 // Default: 300
  minSearchLength?: number            // Min chars before search; default: 0
  defaultLimit?: number               // Initial load limit; default: 20

  // Dependent filter
  context?: Record<string, string>    // Passed to searchFn as 2nd arg

  // Quick-create modal
  canCreate?: boolean                 // Show "Tạo mới" button in empty state
  renderCreateForm?: (
    prefillKeyword: string,
    onSuccess: (newOption: SmartSelectOption) => void,
    onCancel: () => void
  ) => React.ReactNode

  // Error display
  error?: string                      // External validation error (from react-hook-form)

  // Custom rendering
  renderItem?: (
    option: SmartSelectOption,
    isActive: boolean
  ) => React.ReactNode

  // Accessibility
  label?: string                      // For aria-label
}
```

### useSmartSelect Hook — State Machine

```typescript
interface SmartSelectState {
  isOpen: boolean
  searchText: string          // Current text in input
  activeIndex: number         // -1 = no item active
  options: SmartSelectOption[]
  isLoading: boolean
  hasError: boolean
  isTouched: boolean          // For required validation trigger
  selectedOption: SmartSelectOption | null
}

// Keyboard event map:
// ArrowDown  → MOVE_DOWN (clamp at options.length - 1)
// ArrowUp    → MOVE_UP   (clamp at 0)
// Enter      → SELECT_ACTIVE (if activeIndex >= 0)
// Escape     → CLOSE + RESTORE_TEXT
// Tab        → SELECT_ACTIVE (if activeIndex >= 0) + blur
```

### Search Utilities — search.ts

```typescript
// Normalize Vietnamese diacritics to ASCII
// "Nguyễn Văn An" → "nguyen van an"
// "Công ty Thiên Long" → "cong ty thien long"
export function normalizeVi(s: string): string

// Generate acronym from words
// "Nguyễn Văn An" → "NVA"
// "Công an khu vực" → "CAKV"
export function toAcronym(s: string): string

// Score a single option against a query (for static options)
// Returns: 0=no match | 1=acronym | 2=contains | 3=startsWith | 4=exact
export function scoreOption(option: SmartSelectOption, q: string): number

// Rank and filter static options by query
export function rankStaticOptions(
  options: SmartSelectOption[],
  q: string
): SmartSelectOption[]
```

---

## 3. BACKEND ARCHITECTURE

### MilitiaModule

```
militia/
  militia.entity.ts          @Entity('militia_profiles') — map actual DB columns
  militia.service.ts         searchByQuery(), findById(), create()
  militia.controller.ts      GET /militia/search, GET /militia/:id, POST /militia
  militia.module.ts          imports: TypeOrmModule.forFeature([MilitiaProfile])
```

**Search SQL pattern (unaccent):**
```sql
SELECT
  mp.id,
  mp.militia_code,
  mp.full_name,
  mp.phone,
  mp.rank,
  mp.status,
  u.code  AS unit_code,
  u.name  AS unit_name
FROM militia_profiles mp
JOIN units u ON u.id = mp.unit_id
WHERE mp.status IN ('active')
  AND (
    $1 = ''
    OR unaccent(LOWER(mp.full_name))   ILIKE unaccent(LOWER('%' || $1 || '%'))
    OR LOWER(mp.militia_code)          ILIKE LOWER('%' || $1 || '%')
    OR mp.phone                        ILIKE '%' || $1 || '%'
    OR mp.cccd                         ILIKE '%' || $1 || '%'
  )
  AND ($2::text IS NULL OR u.code = $2)
ORDER BY
  CASE
    WHEN LOWER(mp.militia_code) = LOWER($1)                          THEN 0
    WHEN LOWER(mp.militia_code) ILIKE LOWER($1 || '%')               THEN 1
    WHEN unaccent(LOWER(mp.full_name)) ILIKE unaccent(LOWER($1||'%'))THEN 2
    ELSE 3
  END,
  mp.full_name
LIMIT $3
```

### UsersModule (search)
```sql
SELECT id, username, full_name, email, phone, status
FROM users u
WHERE u.status = 'active'
  AND ($1 = ''
    OR unaccent(LOWER(u.full_name)) ILIKE unaccent(LOWER('%' || $1 || '%'))
    OR LOWER(u.username) ILIKE LOWER('%' || $1 || '%'))
  AND ($2::text IS NULL OR EXISTS (
    SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = u.id AND r.code = $2
  ))
LIMIT $3
```

### TasksModule — Schema Delta Mapping
```
DB: task_assignments.assignee_id → users.id  (FK constraint)
FE: Task.assigneeId = militia_profiles.id     (business intent)

MAPPING LOGIC (tasks.service.ts):
  1. Nhận militiaProfileId từ request
  2. SELECT user_id FROM militia_profiles WHERE id = $1
  3. Guard: IF user_id IS NULL → throw BadRequestException('militia_no_user_account')
  4. INSERT task_assignments (assignee_id = user_id, ...)
```

---

## 4. INPUT FIELDS & VALIDATION

### SmartSelect Field

| Property | Type | Constraint | Error Message |
|---|---|---|---|
| `value` | `string \| null` | Required nếu `required=true`; phải là UUID từ dropdown | "Vui lòng chọn [placeholder]" |
| `searchText` | `string` | Max 100 chars; trim whitespace | — (silent truncate) |
| Free text blur | — | Nếu text không khớp selected record → clear + validate | "Vui lòng chọn [placeholder]" |

### Task Create Form

| Field | Type | Required | Validation | Error |
|---|---|---|---|---|
| `title` | string | Yes | 1–255 chars | "Vui lòng nhập tiêu đề (tối đa 255 ký tự)" |
| `description` | string | No | Max 2000 chars | — |
| `assigneeId` | SmartSelect (militia) | Yes | UUID, must be valid militia | "Vui lòng chọn người thực hiện" |
| `priority` | SmartSelect static | Yes | enum: low/medium/high/urgent | "Vui lòng chọn mức độ ưu tiên" |
| `deadline` | datetime-local | Yes | ISO string, must be ≥ now() + 1 hour | "Hạn hoàn thành phải ở tương lai" |

### Attendance Form

| Field | Type | Required | Validation | Error |
|---|---|---|---|---|
| `militiaId` | SmartSelect (militia) | Yes | UUID | "Vui lòng chọn dân quân" |
| `periodId` | SmartSelect (period) | Yes | UUID, status=open | "Vui lòng chọn kỳ chấm công" |
| `date` | date | Yes | YYYY-MM-DD, within period month/year | "Ngày không hợp lệ" |
| `status` | SmartSelect static | Yes | enum: checked_in/checked_out/late/early_leave/absent | "Vui lòng chọn trạng thái" |
| `checkIn` | time | Conditional | Required nếu status != absent | "Vui lòng nhập giờ vào" |
| `checkOut` | time | No | If provided: > checkIn | "Giờ ra phải sau giờ vào" |

### User Form (Admin)

| Field | Type | Required | Validation | Error |
|---|---|---|---|---|
| `username` | string | Yes | 3–50 chars, alphanumeric + underscore | "Username không hợp lệ" |
| `password` | string | Yes (create) | Min 8 chars | "Mật khẩu tối thiểu 8 ký tự" |
| `fullName` | string | Yes | 1–100 chars | "Vui lòng nhập họ tên" |
| `role` | SmartSelect static | Yes | UserRole enum | "Vui lòng chọn vai trò" |
| `unitScope` | SmartSelect static | Conditional | Required nếu role=police_area/office_staff | "Vui lòng chọn đơn vị" |
| `email` | string | No | email format | "Email không hợp lệ" |
| `phone` | string | No | 10–11 digits, start with 0 | "Số điện thoại không hợp lệ" |

### Search Query DTO (Backend)

| Param | Type | Constraint | Error |
|---|---|---|---|
| `q` | string (optional) | Max 100 chars, trim | E001 nếu > 100 |
| `limit` | number (optional) | 1–50, default 20 | E001 nếu > 50 |
| `page` | number (optional) | ≥ 1, default 1 | E001 nếu < 1 |
| `unitScope` | string (optional) | Max 50 chars | — |
| `role` | string (optional) | Must be valid UserRole | E001 |

---

## 5. BUSINESS RULES — Implementation Detail

| BR-ID | Điều kiện | Logic | Boundary |
|---|---|---|---|
| BR-SS-01 | required=true + blur + no valid record | `isTouched=true` → show `error` state | Exact: có text nhưng không chọn → lỗi |
| BR-SS-02 | User select item | `onChange(option.id, option)` → form value = UUID | Never store free text as value |
| BR-SS-03 | JWT unitScope | Backend: `WHERE units.code = $unitScope OR $unitScope IS NULL` | null = full access |
| BR-SS-04 | canCreate | `renderCreateForm` prop phải được provide kèm `canCreate=true` | Không có cả 2 → không hiện button |
| BR-SS-05 | Debounce | `useRef<ReturnType<typeof setTimeout>>` clear on each keystroke | 300ms default, configurable |
| BR-SS-06 | Max results | Backend: `LIMIT MIN(limit, 50)` | FE request default 20 |
| BR-SS-07 | Context change | `useEffect([context])` → reset selectedOption + re-fetch | Stable reference: spread context |
| BR-SS-08 | Server search | `searchFn` prop → always API call | options prop → always client filter |
| BR-SS-09 | Militia→User mapping | `SELECT user_id FROM militia_profiles WHERE id=$1` | Guard NULL → 400 |
| BR-SS-10 | Unaccent | `CREATE EXTENSION IF NOT EXISTS unaccent` required | Fallback: LOWER ILIKE (no diacritic) |

---

## 6. ERROR MATRIX

| Code | HTTP | Tình huống | Backend Action | FE Action | User thấy |
|---|---|---|---|---|---|
| E001 | 400 | `q` > 100 chars / `limit` > 50 / invalid param | ValidationPipe reject | Toast warning | "Tham số tìm kiếm không hợp lệ" |
| E002 | 409 | Tạo militia trùng `militia_code` hoặc `cccd` | ConflictException | Inline modal error | "Mã hoặc CCCD đã tồn tại" |
| E003 | 404 | `GET /militia/:id` không tìm thấy (stale selection) | NotFoundException | Clear selection | "Dữ liệu không còn tồn tại" |
| E004 | 401/403 | Token hết hạn / role không đủ | UnauthorizedException / ForbiddenException | Axios interceptor → refresh hoặc ForbiddenPage | "Phiên đăng nhập hết hạn" |
| E005 | 500 | DB lỗi / unaccent không có / connection fail | HttpExceptionFilter → 500 | Dropdown: "Không thể tải dữ liệu, thử lại" | Retry button trong dropdown |

---

## 7. PERFORMANCE REQUIREMENTS

| Metric | Target | Mechanism |
|---|---|---|
| Search API latency | < 300ms (seed data, < 1000 records) | Index trên `militia_code`, `full_name`, `phone` |
| Debounce | 300ms | `useRef` setTimeout |
| Max result set | 20 default, 50 max | SQL LIMIT |
| No preload | Không fetch khi mount (chỉ fetch khi open) | `enabled: isOpen` trong useQuery |
| Cancel in-flight | Khi user tiếp tục gõ → cancel request cũ | AbortController hoặc TanStack Query cancellation |
| Static options | Filter client-side, không API | options prop |

---

## 8. STATIC OPTIONS REFERENCE

### UserRole Options
```typescript
[
  { id: 'system_admin',  label: 'Quản trị hệ thống',  sublabel: 'Toàn quyền' },
  { id: 'ubnd_leader',   label: 'Lãnh đạo UBND',       sublabel: 'Xem báo cáo' },
  { id: 'police_ward',   label: 'Công an phường',       sublabel: 'Quản lý cấp phường' },
  { id: 'police_area',   label: 'Công an khu vực',      sublabel: 'Quản lý cấp khu vực' },
  { id: 'office_staff',  label: 'Nhân viên văn phòng',  sublabel: 'Chấm công, lương' },
  { id: 'dqtv',          label: 'Dân quân tự vệ',       sublabel: 'Thành viên DQTV' },
]
```

### UnitScope Options (from seed data)
```typescript
[
  { id: 'PHU_DINH',     label: 'Phường Phú Định',        sublabel: 'Phường — Quận 6' },
  { id: 'PHU_DINH_KP1', label: 'Khu phố 1 - Phú Định',  sublabel: 'Khu vực' },
]
```

### TaskPriority Options
```typescript
[
  { id: 'urgent', label: 'Khẩn cấp',  sublabel: 'Xử lý ngay' },
  { id: 'high',   label: 'Cao',        sublabel: 'Trong ngày' },
  { id: 'medium', label: 'Trung bình', sublabel: 'Trong tuần' },
  { id: 'low',    label: 'Thấp',       sublabel: 'Khi rảnh' },
]
```

### AttendanceStatus Options
```typescript
[
  { id: 'checked_in',  label: 'Đã vào ca' },
  { id: 'checked_out', label: 'Đã ra ca' },
  { id: 'late',        label: 'Đi trễ' },
  { id: 'early_leave', label: 'Về sớm' },
  { id: 'absent',      label: 'Vắng mặt' },
]
```

---

## 9. DIRECTORY STRUCTURE — FILES TO CREATE

### Backend
```
backend/src/
├── militia/
│   ├── militia.entity.ts
│   ├── militia.service.ts
│   ├── militia.controller.ts
│   └── militia.module.ts
├── users/
│   ├── users.service.ts
│   ├── users.controller.ts
│   └── users.module.ts
├── tasks/
│   ├── task.entity.ts
│   ├── task-assignment.entity.ts
│   ├── tasks.service.ts
│   ├── tasks.controller.ts
│   └── tasks.module.ts
├── attendance/
│   ├── attendance-record.entity.ts
│   ├── attendance.service.ts
│   ├── attendance.controller.ts
│   └── attendance.module.ts
├── common/dto/
│   └── search-query.dto.ts
└── app.module.ts (MODIFIED)
```

### Frontend
```
frontend/src/
├── lib/
│   ├── search.ts           (NEW)
│   └── search.test.ts      (NEW)
├── hooks/
│   └── useSmartSelect.ts   (NEW)
├── components/ui/
│   ├── SmartSelect.tsx     (NEW)
│   ├── SmartSelect.test.tsx(NEW)
│   ├── Button.tsx          (NEW)
│   └── Input.tsx           (NEW)
├── components/tasks/
│   └── TaskCreateForm.tsx  (NEW)
├── components/attendance/
│   └── AttendanceForm.tsx  (NEW)
├── components/users/
│   └── UserForm.tsx        (NEW)
├── components/payroll/
│   └── PayrollKpiFilter.tsx(NEW)
├── api/
│   ├── militia.ts          (MODIFIED: add search, create)
│   └── users.ts            (MODIFIED: add search)
└── types/index.ts          (MODIFIED: add SmartSelectOption, MilitiaSearchItem, UserSearchItem)
```
