# MMS Web — Design System

> UBND Phường Phú Định — Hệ thống quản lý Lực lượng Bảo vệ An ninh Trật tự
> Last updated: 2026-04-28

---

## Color Tokens

| Token | Hex | Usage |
|-------|-----|-------|
| `primary-red` | `#C62828` | Borders, active states, primary buttons, titles, focus rings |
| `dark-green` | `#2E7D32` | Sidebar background, success states, add/create buttons |
| `green-hover` | `#1B5E20` | Sidebar hover, green button hover |
| `yellow-bg` | `#F4F269` | Header bg, Footer bg, Login page bg |
| `navy-blue` | `#1F3A5F` | Chart colors, edit buttons, export buttons, search focus rings |
| `content-bg` | `#F8FAFC` | Main content area background |
| `card-bg` | `#FFFFFF` | Card backgrounds |
| `card-border` | `#E2E8F0` | Card/table borders, input borders |
| `text-dark` | `#0F172A` | Primary text |
| `text-muted` | `#64748B` | Secondary text — **NOT on yellow backgrounds** (contrast fail) |
| `text-on-yellow` | `#0F172A` or `#1f2937` | Any text on `#F4F269` backgrounds |

### Semantic icon backgrounds (stat cards)
| State | Background | Icon color |
|-------|-----------|------------|
| Info/Navy | `bg-[#E3F2FD]` | `text-blue-600` |
| Success/Green | `bg-[#E8F5E9]` | `text-[#2E7D32]` |
| Warning/Orange | `bg-[#FFF3E0]` | `text-orange-600` |
| Danger/Red (SOS) | `bg-[#FFEBEE]` | `text-[#C62828]` |

---

## Typography Scale

| Role | Tailwind | Weight | Usage |
|------|---------|--------|-------|
| Page title | `text-[28px]` or `text-2xl` | `font-bold` | `<h1>` on content pages |
| Section heading | `text-xl` | `font-semibold` | Card headers, section labels |
| Card number | `text-3xl` | `font-bold` | Stat card primary metric |
| Body | `text-sm` | `font-normal` | Table cells, descriptions |
| Label | `text-sm` | `font-medium` | Form labels, column headers |
| Caption | `text-xs` | `font-medium` | Timestamps, secondary labels |
| Table header | `text-xs uppercase tracking-wide` | `font-medium` | `<thead>` cells |

---

## Border Radius

| Context | Class | Rule |
|---------|-------|------|
| Login form container | `rounded-3xl` | Large decorative containers only |
| Cards | `rounded-xl` | Standard data cards |
| Profile/settings cards | `rounded-lg` | Form-heavy content areas |
| Buttons | `rounded-lg` | All buttons |
| Inputs | `rounded-lg` | All form inputs |
| Badges/chips | `rounded-full` | Status badges only |

---

## Shadow System

| Context | Class | Rule |
|---------|-------|------|
| Login submit button | `shadow-lg` | Primary CTA only |
| Hover lift on cards | `hover:shadow-lg` | Interactive cards |
| Navigation dropdowns | `shadow-xl` | Overlay elements |
| Default cards | none | Cards get border, not shadow |

---

## Layout Dimensions

| Element | Spec |
|---------|------|
| Header height | `h-20` (80px), fixed |
| Header bg | `bg-[#F4F269]`, `border-b-4 border-[#C62828]` |
| Sidebar width | `w-64` (256px), fixed |
| Sidebar bg | `bg-[#2E7D32]`, starts at `top-20` |
| Sidebar height | `h-[calc(100vh-5rem)]` |
| Content offset | `pt-20 lg:ml-64` |
| Footer bg | `bg-[#F4F269]`, `border-t-4 border-[#C62828]` |

---

## Component Patterns

### Page header
```tsx
<div className="flex items-center justify-between mb-6">
  <div>
    <h1 className="text-[28px] font-bold text-[#0F172A]">{title}</h1>
    <p className="text-sm text-[#64748B] mt-1">{subtitle}</p>
  </div>
  <PrimaryAction />
</div>
```

### Card container
```tsx
<div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
```

### Primary button (red — create/submit)
```tsx
<button className="bg-[#C62828] text-white hover:bg-[#A91D1D] rounded-lg px-4 py-2 text-sm font-medium transition-colors">
```

### Primary button (green — add/create new entity)
```tsx
<button className="bg-[#2E7D32] text-white hover:bg-[#1B5E20] rounded-lg px-4 py-2 text-sm font-medium transition-colors">
```

### Primary button (navy — edit/export)
```tsx
<button className="bg-[#1F3A5F] text-white hover:bg-[#162d4a] rounded-lg px-4 py-2 text-sm font-medium transition-colors">
```

### Secondary button
```tsx
<button className="border border-[#E2E8F0] text-[#64748B] hover:border-[#C62828] rounded-lg px-4 py-2 text-sm font-medium transition-colors">
```

### Table header row
```tsx
<thead>
  <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
    <th className="px-6 py-3 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">
```

### Input (focus: red)
```tsx
<input className="border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828]">
```

### Input (focus: navy — search/filter)
```tsx
<input className="border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] focus:border-[#1F3A5F]">
```

### Empty state
```tsx
<div className="py-12 text-center">
  <Icon size={32} className="mx-auto mb-2 text-[#E2E8F0]" />
  <p className="text-sm text-[#64748B]">{message}</p>
  {canCreate && <PrimaryButton className="mt-3" />}
</div>
```

### Loading skeleton row
```tsx
<div className="bg-[#E2E8F0] animate-pulse rounded h-4 w-3/4">
```

---

## Interaction States

For every data-loading component:

| State | Pattern |
|-------|---------|
| Loading | Centered spinner `border-4 border-[#C62828] border-t-transparent rounded-full animate-spin` OR skeleton rows |
| Empty | Gray icon (32px) + Vietnamese message + primary action if user can create |
| Error | `bg-red-50 border border-red-200 rounded-xl p-4 text-[#C62828]` with retry hint |
| Success (mutation) | `toast.success('...')` via sonner |

### Empty state messages by page
| Page | Empty message |
|------|---------------|
| MilitiaList | "Chưa có dân quân nào trong hệ thống" |
| TaskListPage | "Không có nhiệm vụ nào" |
| TimesheetPage | "Chưa có dữ liệu chấm công cho tháng này" |
| PayrollPage | "Chưa có kỳ lương nào" |
| AttendanceReport | "Không có dữ liệu điểm danh trong khoảng thời gian này" |
| NotificationsPage | "Bạn không có thông báo nào" |
| SOSPage | "Không có cảnh báo SOS nào" |
| ActivityLogPage | "Chưa có nhật ký hoạt động" |
| GPSTracking | "Không có thành viên nào đang được theo dõi" |

---

## Responsive Rules

| Breakpoint | Rule |
|------------|------|
| `< lg` (< 1024px) | Sidebar hidden, burger visible, content full-width |
| `< md` (< 768px) | Stat card grid: `grid-cols-1 sm:grid-cols-2` |
| `< md` TimesheetPage | 7-col grid → vertical list (one row per day) |
| `< md` data tables | `overflow-x-auto` + first column sticky for wide tables |
| Touch targets | Min 44×44px for all interactive elements |

---

## Accessibility

- Icon-only buttons: `aria-label` required
- Collapsible nav groups: `aria-expanded` + `aria-controls`
- Active nav item: `aria-current="page"`
- Focus ring: `focus-visible:ring-2 focus-visible:ring-[#C62828]` (use `focus-visible`, not just `focus`)
- Color contrast: all text on `#F4F269` must use `#0F172A` or `#1f2937` (never `#64748B`)

---

## Role-Aware Dashboard

When `role === 'dqtv'`, Dashboard shows a "Hôm nay" hero card at the top:
```
┌─────────────────────────────────────────────┐
│ Hôm nay — [date]                            │
│ ● Điểm danh: Có mặt / Vắng / Chưa chấm     │
│ ● Nhiệm vụ đang thực hiện: [count]          │
│ ● Ca trực tiếp theo: [date/time or —]       │
└─────────────────────────────────────────────┘
```
Admin/police_ward roles still see the KPI stat cards below. DQTV sees both the hero card + a simplified stat summary.

---

## SOS Alert Resolve Flow

Resolving an SOS alert is safety-critical. Always show confirmation:
```
Dialog: "Xác nhận đã xử lý cảnh báo này?"
[Hủy]  [Xác nhận xử lý]
```
No single-tap resolve. The confirm dialog is an inline Tailwind modal (no shadcn dependency).

---

## Notifications Panel

Bell icon in Header → opens a RIGHT-SIDE SLIDE-IN DRAWER (not navigate to /notifications).
- Width: `w-80` (320px), `h-screen`, `fixed right-0 top-20`, `z-50`
- Content: most recent 10 notifications, mark-all-read button, "Xem tất cả" link to `/notifications`
- The `/notifications` PAGE still exists for full history + filtering

---

## Sidebar Empty-State Widget

When authenticated user has ≤ 8 sidebar items visible (e.g., DQTV role), show a compact stats widget below the nav items:
```
┌──────────────────────────┐
│  Hôm nay                 │  bg-[#1F5F23]
│  ✓ Có mặt  ✗ Vắng: 0   │  text-white text-xs
│  📋 Nhiệm vụ: [count]   │
└──────────────────────────┘
```

---

## Page Hierarchy Reference

| Page | Primary action | Secondary | Tertiary |
|------|---------------|-----------|---------|
| MilitiaList | Search/filter | Table rows | Add button |
| TaskListPage | Status tabs | Table rows | Create task |
| AttendanceReport | Filter + Export | Stat cards | Table |
| TimesheetPage | Month selector | Week grid | Summary cards |
| PayrollPage | Period selector | Summary card | Table |
| UserManagementPage | Add user | Search | Table |
| ActivityLogPage | Search | Table | Pagination |
| SettingsProfilePage | Edit button | Profile info | — |
