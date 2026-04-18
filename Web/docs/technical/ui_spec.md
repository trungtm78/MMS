# UI SPEC — Smart Select Feature
Task ID: TASK-SS-2026-001 | Version: v1.0 | Date: 2026-03-08

---

## 1. SMARTSELECT COMPONENT — States

### State: Empty / Initial
```
┌─────────────────────────────────────────────┐
│ 🔍 Tìm kiếm...                          [▼] │
└─────────────────────────────────────────────┘
```
- Input placeholder: `placeholder` prop value
- No value selected
- Dropdown: closed
- Tailwind: `border-slate-300 bg-white focus:ring-2 focus:ring-blue-500`

### State: Open / Loading
```
┌─────────────────────────────────────────────┐
│ 🔍 nguy                                 [▼] │
└─────────────────────────────────────────────┘
┌─────────────────────────────────────────────┐
│ ⟳ Đang tìm kiếm...                          │
│ ──────────────────────────────────          │
│ [skeleton row]                              │
│ [skeleton row]                              │
└─────────────────────────────────────────────┘
```
- Spinner visible
- Skeleton rows (2–3) animate pulse

### State: Open / Results
```
┌─────────────────────────────────────────────┐
│ 🔍 nguyen                               [▼] │
└─────────────────────────────────────────────┘
┌─────────────────────────────────────────────┐
│ ▶ HCM-PHD-T12-0001 — Nguyễn Văn An    ← active (blue-50 bg, blue-600 text)
│   0909123456 | KP1 - Phú Định               │
│ ──────────────────────────────────          │
│   HCM-PHD-T12-0002 — Trần Thị Bình         │
│   0909123457 | KP1 - Phú Định               │
└─────────────────────────────────────────────┘
```
- Max-height: 320px, overflow-y: auto
- Active item: `bg-blue-50 border-l-2 border-blue-500`
- Hover item: `bg-slate-50`
- Label: `text-sm font-medium text-slate-800`
- Sublabel: `text-xs text-slate-500 mt-0.5`

### State: Open / Empty (No Results)
```
┌─────────────────────────────────────────────┐
│ 🔍 xyzabc                               [▼] │
└─────────────────────────────────────────────┘
┌─────────────────────────────────────────────┐
│  👤 Không tìm thấy dữ liệu phù hợp          │
│  ─────────────────────────────────          │
│  [+ Tạo mới "xyzabc"]    ← if canCreate     │
└─────────────────────────────────────────────┘
```
- Empty message: `text-sm text-slate-500 text-center py-4`
- "Tạo mới" button: `text-sm text-blue-600 hover:text-blue-700 font-medium`

### State: Selected
```
┌─────────────────────────────────────────────┐
│ Nguyễn Văn An — HCM-PHD-T12-0001      [×] │
└─────────────────────────────────────────────┘
```
- Input shows selected label
- Clear button (×) visible on right
- Border: `border-slate-300`

### State: Error (Required Validation)
```
┌─────────────────────────────────────────────┐
│ 🔍 Tìm kiếm...                          [▼] │  ← border-red-500
└─────────────────────────────────────────────┘
  Vui lòng chọn người thực hiện              ← text-xs text-red-500 mt-1
```
- Input border: `border-red-500 ring-1 ring-red-500`
- Error text below: `text-xs text-red-500 mt-1`

### State: Disabled
```
┌─────────────────────────────────────────────┐
│ 🔍 Tìm kiếm...                          [▼] │  ← opacity-50
└─────────────────────────────────────────────┘
```
- `opacity-50 cursor-not-allowed pointer-events-none`

### State: API Error
```
┌─────────────────────────────────────────────┐
│ 🔍 nguyen                               [▼] │
└─────────────────────────────────────────────┘
┌─────────────────────────────────────────────┐
│  ⚠ Không thể tải dữ liệu                    │
│  [Thử lại]                                  │
└─────────────────────────────────────────────┘
```

---

## 2. QUICK-CREATE MODAL

```
╔═══════════════════════════════════════════════════╗
║  Tạo dân quân tự vệ mới                      [✕] ║
╠═══════════════════════════════════════════════════╣
║  Mã DQTV *                                        ║
║  ┌─────────────────────────────────────────────┐  ║
║  │ HCM-PHD-T12-0004                            │  ║
║  └─────────────────────────────────────────────┘  ║
║                                                   ║
║  Họ và tên *       [prefilled: keyword user gõ]  ║
║  ┌─────────────────────────────────────────────┐  ║
║  │ Phạm Thị Dung                               │  ║
║  └─────────────────────────────────────────────┘  ║
║                                                   ║
║  CCCD *             Ngày sinh *                   ║
║  ┌──────────────┐   ┌──────────────────────────┐  ║
║  │ 079095001004 │   │ 1999-04-12               │  ║
║  └──────────────┘   └──────────────────────────┘  ║
║                                                   ║
║  Điện thoại         Đơn vị *                      ║
║  ┌──────────────┐   ┌──────────────────────────┐  ║
║  │ 0909123460   │   │ KP1 - Phú Định        [▼]│  ║
║  └──────────────┘   └──────────────────────────┘  ║
║                                                   ║
║  Ngày gia nhập *                                  ║
║  ┌─────────────────────────────────────────────┐  ║
║  │ 2026-03-08                                  │  ║
║  └─────────────────────────────────────────────┘  ║
║                                                   ║
║              [Hủy]   [Tạo mới →]                 ║
╚═══════════════════════════════════════════════════╝
```
- Modal width: max-w-lg
- Submit button: disabled + spinner khi đang POST
- Overlay: `bg-black/40 backdrop-blur-sm`

---

## 3. TASK CREATE FORM

```
┌─────────────────────────────────────────────────────┐
│  Giao nhiệm vụ mới                                  │
├─────────────────────────────────────────────────────┤
│  Tiêu đề *                                          │
│  ┌─────────────────────────────────────────────────┐│
│  │ Tuần tra khu vực KP1                            ││
│  └─────────────────────────────────────────────────┘│
│                                                     │
│  Mô tả                                              │
│  ┌─────────────────────────────────────────────────┐│
│  │ Tuần tra từ 20h đến 22h...                      ││
│  └─────────────────────────────────────────────────┘│
│                                                     │
│  Người thực hiện *          Mức độ ưu tiên *       │
│  ┌─────────────────────┐    ┌────────────────────┐  │
│  │ 🔍 Tìm dân quân [▼]│    │ Cao            [▼] │  │
│  └─────────────────────┘    └────────────────────┘  │
│                                                     │
│  Hạn hoàn thành *                                   │
│  ┌─────────────────────────────────────────────────┐│
│  │ 2026-03-10T22:00                                ││
│  └─────────────────────────────────────────────────┘│
│                                                     │
│                      [Hủy]  [Giao nhiệm vụ →]      │
└─────────────────────────────────────────────────────┘
```

---

## 4. ATTENDANCE FORM

```
┌─────────────────────────────────────────────────────┐
│  Chấm công                                          │
├─────────────────────────────────────────────────────┤
│  Kỳ chấm công *                                     │
│  ┌─────────────────────────────────────────────────┐│
│  │ Tháng 3/2026 (Đang mở)              [▼]         ││
│  └─────────────────────────────────────────────────┘│
│                                                     │
│  Dân quân *                 Ngày *                  │
│  ┌────────────────────┐    ┌──────────────────────┐ │
│  │ 🔍 Tìm DQTV   [▼] │    │ 2026-03-08           │ │
│  └────────────────────┘    └──────────────────────┘ │
│                                                     │
│  Trạng thái *               Giờ vào       Giờ ra   │
│  ┌────────────────────┐    ┌──────────┐  ┌────────┐ │
│  │ Đã vào ca      [▼] │    │ 08:00    │  │ 17:30  │ │
│  └────────────────────┘    └──────────┘  └────────┘ │
│                                                     │
│                      [Hủy]  [Lưu chấm công →]      │
└─────────────────────────────────────────────────────┘
```

---

## 5. USER FORM (Admin)

```
┌─────────────────────────────────────────────────────┐
│  Tạo tài khoản người dùng                           │
├─────────────────────────────────────────────────────┤
│  Username *                 Mật khẩu *              │
│  ┌────────────────────┐    ┌──────────────────────┐ │
│  │ police01           │    │ ••••••••             │ │
│  └────────────────────┘    └──────────────────────┘ │
│                                                     │
│  Họ và tên *                                        │
│  ┌─────────────────────────────────────────────────┐│
│  │ Nguyễn Văn Bình                                 ││
│  └─────────────────────────────────────────────────┘│
│                                                     │
│  Vai trò *                  Đơn vị                  │
│  ┌────────────────────┐    ┌──────────────────────┐ │
│  │ Công an khu vực [▼]│    │ KP1 - Phú Định   [▼] │ │
│  └────────────────────┘    └──────────────────────┘ │
│              ↑ role=police_area → unitScope required │
│                                                     │
│  Email                      Điện thoại              │
│  ┌────────────────────┐    ┌──────────────────────┐ │
│  │ police01@mms.vn    │    │ 0909000001           │ │
│  └────────────────────┘    └──────────────────────┘ │
│                                                     │
│                      [Hủy]  [Tạo tài khoản →]      │
└─────────────────────────────────────────────────────┘
```
Note: unitScope disabled + cleared khi role = system_admin hoặc ubnd_leader.

---

## 6. PAYROLL KPI FILTER

```
┌─────────────────────────────────────────────────────┐
│  Bộ lọc KPI                                         │
├─────────────────────────────────────────────────────┤
│  Kỳ KPI *               Dân quân (tùy chọn)        │
│  ┌───────────────────┐  ┌────────────────────────┐  │
│  │ Tháng 3/2026  [▼] │  │ 🔍 Tìm DQTV       [▼] │  │
│  └───────────────────┘  └────────────────────────┘  │
│                          [Áp dụng bộ lọc]           │
└─────────────────────────────────────────────────────┘
```

---

## 7. DATA-TESTID MAP

| Element | Component | data-testid |
|---|---|---|
| SmartSelect container | SmartSelect | `smart-select-{name}` |
| Search input | SmartSelect | `smart-select-{name}-input` |
| Dropdown popup | SmartSelect | `smart-select-{name}-dropdown` |
| Option item | SmartSelect | `smart-select-{name}-option-{id}` |
| Active option | SmartSelect | `smart-select-{name}-option-active` |
| Loading spinner | SmartSelect | `smart-select-{name}-loading` |
| Empty state | SmartSelect | `smart-select-{name}-empty` |
| "Tạo mới" button | SmartSelect | `smart-select-{name}-create-btn` |
| Selected value display | SmartSelect | `smart-select-{name}-selected` |
| Clear button | SmartSelect | `smart-select-{name}-clear` |
| Error message | SmartSelect | `smart-select-{name}-error` |
| Quick-create modal | SmartSelect | `smart-select-{name}-modal` |
| Modal submit button | SmartSelect | `smart-select-{name}-modal-submit` |
| Modal cancel button | SmartSelect | `smart-select-{name}-modal-cancel` |
| Task form container | TaskCreateForm | `task-create-form` |
| Task submit button | TaskCreateForm | `task-create-submit` |
| Task assignee field | TaskCreateForm | `smart-select-assigneeId` |
| Task priority field | TaskCreateForm | `smart-select-priority` |
| Attendance form container | AttendanceForm | `attendance-form` |
| Attendance militia field | AttendanceForm | `smart-select-militiaId` |
| Attendance period field | AttendanceForm | `smart-select-periodId` |
| Attendance submit | AttendanceForm | `attendance-form-submit` |
| User form container | UserForm | `user-form` |
| User role field | UserForm | `smart-select-role` |
| User unitScope field | UserForm | `smart-select-unitScope` |
| User submit | UserForm | `user-form-submit` |
| Payroll filter form | PayrollKpiFilter | `payroll-filter-form` |
| Payroll period field | PayrollKpiFilter | `smart-select-payroll-periodId` |
| Payroll militia field | PayrollKpiFilter | `smart-select-payroll-militiaId` |

---

## 8. VISUAL DESIGN TOKENS

```
Colors (Tailwind v4):
  Primary:     bg-blue-600, text-blue-700, border-blue-500
  Hover:       bg-slate-50, text-slate-700
  Active item: bg-blue-50, border-l-2 border-blue-500
  Error:       border-red-500, text-red-500
  Disabled:    opacity-50, cursor-not-allowed
  Sublabel:    text-slate-400
  Skeleton:    animate-pulse bg-slate-200

Typography:
  Label:      text-sm font-medium text-slate-800
  Sublabel:   text-xs text-slate-400
  Placeholder:text-slate-400
  Error:      text-xs text-red-500

Spacing:
  Dropdown padding: px-3 py-2 per item
  Item gap: space-y-0.5
  Max dropdown height: max-h-80 (320px)

Border:
  Normal:  border border-slate-300 rounded-lg
  Focus:   ring-2 ring-blue-500 ring-offset-0 border-blue-500
  Error:   border-red-500 ring-1 ring-red-500
```

---

## 9. KEYBOARD NAVIGATION SPEC

```
Key          | State              | Action
─────────────────────────────────────────────────────────
ArrowDown    | Dropdown closed    | Open dropdown; activeIndex = 0
ArrowDown    | Dropdown open      | activeIndex = min(activeIndex+1, options.length-1)
ArrowUp      | Dropdown open      | activeIndex = max(activeIndex-1, 0)
Enter        | activeIndex >= 0   | Select active item; close dropdown; call onChange
Enter        | activeIndex == -1  | No-op (or open dropdown if closed)
Escape       | Dropdown open      | Close dropdown; restore searchText to selected label
Tab          | activeIndex >= 0   | Select active item; blur; focus next field
Tab          | activeIndex == -1  | Blur; validate if required; focus next field
Backspace    | Selected value     | Clear selection; open dropdown; focus input
Any char     | —                  | Set searchText; open dropdown; debounce search
```

---

## 10. FORM SUBMISSION STATES

| State | UI | Interaction |
|---|---|---|
| `idle` | Form normal | User editing |
| `submitting` | Submit button disabled + spinner | No input changes |
| `success` | Toast "Thành công" + form reset or navigate | — |
| `error` | Toast error + field errors highlighted | User can re-edit |

Submit button disabled conditions:
- Form has validation errors
- Required SmartSelect has no selected value
- Submission in progress
