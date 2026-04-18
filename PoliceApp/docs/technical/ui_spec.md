# UI SPECIFICATION — PoliceApp
Task ID: TASK-2026-002 | Version: v1.0 | Date: 2026-03-10

Tham khảo: `C:\MMS\PoliceApp\Refs\src\` (React components nguồn)
Kiến trúc: giống MilitianApp — Flutter Riverpod + GoRouter

---

## 1. DESIGN TOKENS

```dart
// app_colors.dart
class AppColors {
  static const primary       = Color(0xFFDC2626); // đỏ — header border, button CA
  static const secondary     = Color(0xFFFBBF24); // vàng — gradient start
  static const gradientMid   = Color(0xFFFDE047); // gradient mid
  static const gradientEnd   = Color(0xFFFEF08A); // gradient end
  static const tertiary      = Color(0xFF15803D); // xanh lá — submit, completed
  static const navy          = Color(0xFF366092); // navy — nav active, action btn
  static const background    = Color(0xFFF8FAFC); // page background
  static const surface       = Color(0xFFFFFFFF); // card surface
  static const success       = Color(0xFF10B981); // online, completed, approved
  static const warning       = Color(0xFFF59E0B); // pending, late, away
  static const error         = Color(0xFFEF4444); // offline, rejected, urgent
  static const blue          = Color(0xFF3B82F6); // in-progress, notification
  static const textPrimary   = Color(0xFF0F172A);
  static const textSecondary = Color(0xFF64748B);
  static const textMuted     = Color(0xFF94A3B8);
  static const divider       = Color(0xFFE2E8F0);
}
```

---

## 2. SHARED HEADER WIDGET

Áp dụng cho mọi screen có header.

```
┌────────────────────────────────────────────────────────┐
│ [gradient: #FBBF24 → #FDE047 → #FEF08A]               │
│ ┌──────────────────────────────────────────────────┐   │
│ │  [←back]   Screen Title              [action]   │   │
│ └──────────────────────────────────────────────────┘   │
│ [border bottom: 4px solid #DC2626]                     │
└────────────────────────────────────────────────────────┘
```

```dart
// shared/widgets/app_header.dart
Widget AppHeader({
  required String title,
  bool showBack = true,
  Widget? action,
})
// Gradient LinearGradient(colors: [secondary, gradientMid, gradientEnd])
// Bottom border: BorderSide(color: primary, width: 4)
// Title style: TextStyle(color: textPrimary, fontWeight: w700, fontSize: 18)
```

---

## 3. BOTTOM NAVIGATION

### CA Shell (5 tabs)
```
┌──────────────────────────────────────────────────────────┐
│  [Home]    [DQTV]   [Bản đồ]  [Nhiệm vụ]  [Cá nhân]   │
│  house     people    map_pin   assignment   person       │
│  active=#366092   inactive=#64748B                       │
└──────────────────────────────────────────────────────────┘
```

| Tab | Label | Icon | Route |
|---|---|---|---|
| 0 | Trang chủ | Icons.home_outlined | /ca/home |
| 1 | DQTV | Icons.people_outlined | /ca/dqtv |
| 2 | Bản đồ | Icons.map_outlined | /ca/map |
| 3 | Nhiệm vụ | Icons.assignment_outlined | /ca/tasks/create |
| 4 | Cá nhân | Icons.person_outlined | /ca/profile |

### DQTV Shell (5 tabs)
```
┌──────────────────────────────────────────────────────────┐
│  [Home]  [Nhiệm vụ]  [Chấm công]  [Báo cáo]  [Cá nhân]│
│  house   assignment  access_time  description  person    │
└──────────────────────────────────────────────────────────┘
```

| Tab | Label | Icon | Route |
|---|---|---|---|
| 0 | Trang chủ | Icons.home_outlined | /dqtv/home |
| 1 | Nhiệm vụ | Icons.assignment_outlined | /dqtv/tasks |
| 2 | Chấm công | Icons.access_time_outlined | /dqtv/checkin |
| 3 | Báo cáo | Icons.description_outlined | /dqtv/report |
| 4 | Cá nhân | Icons.person_outlined | /dqtv/profile |

---

## 4. SCREENS — CA ROLE

### 4.1 HomeScreen (CA Dashboard) — `/ca/home`

```
┌──────────────────────────────────────────────────────────┐
│  [AppHeader: "Trang chủ"  🔔 notifications badge]       │
├──────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────┐  │
│  │ Chào, Trung úy Võ Văn Tân          [avatar]       │  │
│  │ Thứ Ba, 10/03/2026                                 │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  KPI TỔNG HỢP                                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │ Đang trực   │  │ Nhiệm vụ   │  │ Đơn chờ duyệt  │  │
│  │    12/15    │  │ hôm nay: 8 │  │       3        │  │
│  │  #10B981    │  │  #366092   │  │   #F59E0B      │  │
│  └─────────────┘  └─────────────┘  └─────────────────┘  │
│                                                          │
│  CẢNH BÁO MỚI (3)                                       │
│  ┌────────────────────────────────────────────────────┐  │
│  │ 🔴 Vắng mặt không phép — Nguyễn Văn C   09:00    │  │
│  │ 🟡 Check-in muộn — Trần Thị B            08:45    │  │
│  │ 🔴 GPS mất kết nối — Lê Văn D            09:30    │  │
│  │                               [Xem tất cả →]      │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  NHIỆM VỤ HÔM NAY                                       │
│  ┌────────────────────────────────────────────────────┐  │
│  │ NV-202603-0001  Tuần tra KP1   [Đang thực hiện]   │  │
│  │ NV-202603-0002  Canh gác UBND  [Chưa tiếp nhận]  │  │
│  │                               [Giao nhiệm vụ +]   │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  DQTV ONLINE (12/15)                                    │
│  ┌────────────────────────────────────────────────────┐  │
│  │ 🟢 Nguyễn Văn An  · Tuần tra KP1                  │  │
│  │ 🟢 Trần Thị Bình  · Canh gác UBND                 │  │
│  │ ⚫ Lê Văn C       · Ngoại tuyến 2h               │  │
│  │                               [Xem bản đồ →]      │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

**State management:** `homeNotifier` (AsyncNotifier)
- fetch: GET /users/me, GET /tasks?status=assigned&today=true, GET /alerts?status=active, GET /gps/team
- Refresh: pull-to-refresh
- Error state: ErrorWidget với retry button

---

### 4.2 DQTVListScreen — `/ca/dqtv`

```
┌──────────────────────────────────────────────────────────┐
│  [AppHeader: "Quản lý DQTV"]                            │
├──────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────┐  │
│  │ 🔍 Tìm kiếm theo tên, mã DQTV...                  │  │
│  └────────────────────────────────────────────────────┘  │
│  [Tất cả ▼] [Đang trực ●] [Ngoại tuyến ●]              │
├──────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────┐  │
│  │ [avatar]  Nguyễn Văn An                    🟢     │  │
│  │           HCM-PHD-T12-0001 · KP1           KPI:87 │  │
│  │           Đang tuần tra                           │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ [avatar]  Trần Thị Bình                    🟢     │  │
│  │           HCM-PHD-T12-0002 · KP1           KPI:91 │  │
│  │           Canh gác UBND                           │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

**API:** GET /users?role=militia&search=q&status=status&page=1&limit=20
**Navigation:** tap card → `/ca/dqtv/:id`
**Search:** debounce 500ms

---

### 4.3 DQTVDetailScreen — `/ca/dqtv/:id`

```
┌──────────────────────────────────────────────────────────┐
│  [AppHeader: "Hồ sơ DQTV"  ←back]                      │
├──────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────┐  │
│  │     [avatar 72px]   Nguyễn Văn An   🟢 Đang trực │  │
│  │     HCM-PHD-T12-0001                              │  │
│  │     Dân quân thường trực · KP1                    │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  THÔNG TIN CÁ NHÂN                                      │
│  CCCD: 079095001001    DOB: 15/05/1995                  │
│  Phone: 0909 123 456   Join: 01/10/2022                 │
│  Address: 123 Đường ABC, KP1, Phú Định                  │
│                                                          │
│  KPI THÁNG 3/2026                                       │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Điểm KPI: 87.5 / 100   [progress bar #3B82F6]   │  │
│  │  Chuyên cần: 90  Nhiệm vụ: 85  Kỷ luật: 100      │  │
│  │  Xếp hạng: 2/15 trong đội                         │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  NHIỆM VỤ GẦN ĐÂY                                      │
│  • Tuần tra KP1 — Hoàn thành  ✅                        │
│  • Canh gác UBND — Đang thực hiện  🔵                   │
└──────────────────────────────────────────────────────────┘
```

**API:** GET /users/:id/militia-profile, GET /kpi/current (for user), GET /tasks?assignee=:id

---

### 4.4 GPSTrackingScreen — `/ca/map`

```
┌──────────────────────────────────────────────────────────┐
│  [AppHeader: "Theo dõi GPS"]                            │
├──────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────┐  │
│  │                                                    │  │
│  │          [flutter_map — OpenStreetMap]             │  │
│  │                                                    │  │
│  │    🟢 Nguyễn Văn An                               │  │
│  │       ●                                            │  │
│  │              🟡 Trần Thị Bình                      │  │
│  │                ●                                   │  │
│  │                        ⚫ Lê Văn C (offline)       │  │
│  │                          ●                         │  │
│  │                                                    │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Danh sách (3 online / 2 offline)                   │  │
│  │ 🟢 Nguyễn Văn An  · 10.8231, 106.6297  · 08:30   │  │
│  │ 🟡 Trần Thị Bình  · đang di chuyển    · 08:31    │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

**Map:** flutter_map + OpenStreetMap tiles
**Realtime:** Socket.IO event `location_update` → update marker
**Initial load:** GET /gps/team
**Marker colors:**
- 🟢 `#10B981` — online (last_seen < 2min)
- 🟡 `#F59E0B` — moving (speed > 0.5 m/s)
- ⚫ `#94A3B8` — offline

**Tap marker:** bottom sheet với thông tin chi tiết DQTV

---

### 4.5 CreateTaskScreen — `/ca/tasks/create`

```
┌──────────────────────────────────────────────────────────┐
│  [AppHeader: "Giao nhiệm vụ"]                           │
├──────────────────────────────────────────────────────────┤
│  LOẠI NHIỆM VỤ *                                        │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐           │
│  │🚔 Tuần │ │🛡️ Canh │ │🔍 Xử lý│ │🤝 Hỗ  │           │
│  │  tra   │ │  gác   │ │ sự vụ │ │  trợ  │           │
│  └────────┘ └────────┘ └────────┘ └────────┘           │
│  ┌────────┐ ┌────────┐ ┌────────┐                       │
│  │📢 Tuyên│ │📋 Hành │ │📌 Khác│                       │
│  │truyền  │ │chính   │ │       │                       │
│  └────────┘ └────────┘ └────────┘                       │
│                                                          │
│  TIÊU ĐỀ *                                              │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Nhập tiêu đề nhiệm vụ...                          │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  MÔ TẢ                                                  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Nhập mô tả chi tiết...  (max 2000 ký tự)          │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ĐỘ ƯU TIÊN *                                           │
│  [🔴 Khẩn cấp] [🟠 Cao] [🟡 Trung bình] [⚪ Thấp]     │
│                                                          │
│  HẠN HOÀN THÀNH                                         │
│  ┌────────────────────────────────────────────────────┐  │
│  │ 📅 Chọn ngày giờ...                               │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  NGƯỜI THỰC HIỆN *                                      │
│  ┌────────────────────────────────────────────────────┐  │
│  │ 🔍 Tìm DQTV...                                    │  │
│  │ ☑ Nguyễn Văn An  · 🟢 Đang trực                  │  │
│  │ ☐ Trần Thị Bình  · 🟢 Đang trực                  │  │
│  │ ☐ Lê Văn C       · ⚫ Ngoại tuyến                 │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │              [GIAO NHIỆM VỤ]  #15803D              │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

**API:** GET /users?role=militia (load assignees), POST /tasks
**Validation:** type required, title required, priority required, assigneeIds ≥1, deadline > now
**Success:** SnackBar "Đã giao nhiệm vụ thành công" → pop screen

---

### 4.6 ApproveRequestsScreen — `/ca/approvals`

```
┌──────────────────────────────────────────────────────────┐
│  [AppHeader: "Duyệt đơn nghỉ phép"]                     │
├──────────────────────────────────────────────────────────┤
│  [Chờ duyệt (3)] [Đã duyệt] [Từ chối]                  │
├──────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────┐  │
│  │ Nguyễn Văn An             LEAVE-202603-001         │  │
│  │ Nghỉ phép có lương  15/03 → 16/03 (2 ngày)        │  │
│  │ Lý do: Việc gia đình                              │  │
│  │ Gửi lúc: 10/03/2026 08:00                         │  │
│  │                                                    │  │
│  │    [TỪ CHỐI #EF4444]     [DUYỆT #15803D]          │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

**Reject dialog:**
```
┌─────────────────────────────────┐
│ Từ chối đơn nghỉ phép           │
│ ─────────────────────────────── │
│ Lý do từ chối *                 │
│ ┌─────────────────────────────┐ │
│ │ Nhập lý do...               │ │
│ └─────────────────────────────┘ │
│        [Hủy]   [XÁC NHẬN]       │
└─────────────────────────────────┘
```

**API:** GET /leave-requests?status=pending, POST /leave-requests/:id/decision

---

### 4.7 ReportsScreen (CA) — `/ca/reports`

```
┌──────────────────────────────────────────────────────────┐
│  [AppHeader: "Báo cáo đội"]                             │
├──────────────────────────────────────────────────────────┤
│  [Tháng 3/2026 ▼]                                       │
├──────────────────────────────────────────────────────────┤
│  NHIỆM VỤ                                               │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Hoàn thành: 38/45  (84.4%)  [bar #10B981]          │  │
│  │ Đúng hạn: 35   Trễ hạn: 3                          │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  CHUYÊN CẦN                                             │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Tỷ lệ hiện diện: 91.2%   Đúng giờ: 88.5%         │  │
│  │ [bar chart by week]                                │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  KPI ĐỘI                                                │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Điểm TB: 83.7                                      │  │
│  │ ┌──────────────────────────────────────────────┐   │  │
│  │ │ 90-100: ████ 3 người                        │   │  │
│  │ │ 80-89:  ████████ 7 người                    │   │  │
│  │ │ 70-79:  ████ 3 người                        │   │  │
│  │ │ <70:    ██ 2 người                          │   │  │
│  │ └──────────────────────────────────────────────┘   │  │
│  │ TOP 5: 1. Nguyễn Văn An (94.5)                    │  │
│  │ CẦN THEO DÕI: Lê Văn C (65.0) — vắng nhiều       │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

**API:** GET /reports/team?year=2026&month=3

---

### 4.8 AlertsScreen — `/ca/alerts`

```
┌──────────────────────────────────────────────────────────┐
│  [AppHeader: "Cảnh báo"]                                │
├──────────────────────────────────────────────────────────┤
│  [Chưa xử lý (5)] [Đã xử lý]                           │
├──────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────┐  │
│  │ 🔴 KHẨN CẤP  · attendance                  09:00  │  │
│  │ Vắng mặt không phép                               │  │
│  │ Nguyễn Văn C chưa check-in lúc 09:00             │  │
│  │                          [XỬ LÝ #366092]          │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ 🟡 CẢNH BÁO · attendance                   08:45  │  │
│  │ Check-in muộn                                     │  │
│  │ Trần Thị Bình check-in lúc 08:45 (muộn 15 phút)  │  │
│  │                          [XỬ LÝ #366092]          │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

**Severity colors:** urgent=#EF4444, warning=#F59E0B, info=#3B82F6
**Resolve dialog:** text field "Ghi chú xử lý (tùy chọn)" → POST /alerts/:id/resolve

---

### 4.9 ProfileCAScreen — `/ca/profile`

```
┌──────────────────────────────────────────────────────────┐
│  [AppHeader: "Cá nhân"]                                 │
├──────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────┐  │
│  │        [avatar 80px]                              │  │
│  │        Trung úy Võ Văn Tân                        │  │
│  │        CA-KV-001 · Công an khu vực                │  │
│  │        Phường Phú Định                             │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  THÔNG TIN                                              │
│  ─────────────────────────────────────────────────────  │
│  Họ tên:     Võ Văn Tân                                 │
│  Cấp bậc:    Trung úy                                   │
│  Điện thoại: 0901 234 567                               │
│  Email:      ca001@mms.vn                               │
│                                                          │
│  ─────────────────────────────────────────────────────  │
│  [Cài đặt MFA]           [Đổi thông tin]               │
│  ─────────────────────────────────────────────────────  │
│  [ĐĂNG XUẤT  #EF4444]                                   │
└──────────────────────────────────────────────────────────┘
```

---

## 5. SCREENS — DQTV ROLE

### 5.1 DQTVHomeScreen — `/dqtv/home`

```
┌──────────────────────────────────────────────────────────┐
│  [AppHeader: "Trang chủ"  🔔 notifications]             │
├──────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────┐  │
│  │ Chào, Nguyễn Văn An              [avatar]          │  │
│  │ Thứ Ba, 10/03/2026                                 │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  CHẤM CÔNG HÔM NAY                                      │
│  ┌────────────────────────────────────────────────────┐  │
│  │ ✅ Đã check-in: 07:45                              │  │
│  │ ─── chưa checkout                                  │  │
│  │                     [CHECK OUT #DC2626]             │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  NHIỆM VỤ CỦA TÔI                                       │
│  ┌────────────────────────────────────────────────────┐  │
│  │ NV-202603-0001  Tuần tra KP1                       │  │
│  │ Ưu tiên: CAO  |  Hạn: 11/03/2026                  │  │
│  │ Trạng thái: [Đang thực hiện #3B82F6]               │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  KPI THÁNG NÀY                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Điểm: 87.5   [████████░░] Xếp hạng: 2/15          │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

---

### 5.2 MyTasksScreen — `/dqtv/tasks`

```
┌──────────────────────────────────────────────────────────┐
│  [AppHeader: "Nhiệm vụ của tôi"]                        │
├──────────────────────────────────────────────────────────┤
│  [Tất cả] [Chưa tiếp nhận] [Đang thực hiện] [Hoàn thành]│
├──────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────┐  │
│  │ NV-202603-0001                    [🔵 Đang thực hiện]│
│  │ Tuần tra khu phố 1                                 │  │
│  │ 📍 Khu phố 1, Phú Định                             │  │
│  │ 🔴 CAO  ·  Hạn: 11/03/2026 22:00                  │  │
│  │ Tiến độ: [████████░░] 80%                          │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ NV-202603-0002                    [🟡 Chưa tiếp nhận]│
│  │ Canh gác trụ sở UBND                               │  │
│  │ 🟠 TRUNG BÌNH  ·  Hạn: 12/03/2026 17:00           │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

**Tap card:** → `/dqtv/tasks/:id`

---

### 5.3 TaskDetailScreen — `/dqtv/tasks/:id`

```
┌──────────────────────────────────────────────────────────┐
│  [AppHeader: "Chi tiết nhiệm vụ"  ←back]               │
├──────────────────────────────────────────────────────────┤
│  NV-202603-0001  [🔵 Đang thực hiện]                   │
│  Tuần tra khu phố 1                                     │
│                                                          │
│  🚔 Tuần tra  |  🔴 CAO  |  Hạn: 11/03/2026 22:00     │
│                                                          │
│  Mô tả:                                                 │
│  Tuần tra từ 18h-22h quanh khu phố 1, ghi nhận...     │
│                                                          │
│  📍 Khu phố 1, Phú Định                                 │
│     [flutter_map mini — location pin]                   │
│                                                          │
│  TIẾN ĐỘ                                               │
│  [████████░░] 80%                                       │
│  Giao bởi: Trung úy Võ Văn Tân · 10/03 08:00          │
│                                                          │
│  ─────────────────────────────────────────────────────  │
│  [CẬP NHẬT TIẾN ĐỘ]                                   │
│  Tiến độ: [slider 0-100]     [80%]                     │
│  Ghi chú: [text input]                                  │
│                                                          │
│  [NỘP BÁO CÁO HOÀN THÀNH  #15803D]                    │
└──────────────────────────────────────────────────────────┘
```

Status = 'assigned' → show [TIẾP NHẬN] button (POST /tasks/:id/accept)
Status = 'accepted'/'in_progress' → show [CẬP NHẬT] + [NỘP BÁO CÁO]

---

### 5.4 CheckInScreen — `/dqtv/checkin`

```
┌──────────────────────────────────────────────────────────┐
│  [AppHeader: "Điểm danh GPS"]                           │
├──────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────┐  │
│  │           [flutter_map]                            │  │
│  │     📍 Vị trí của bạn                             │  │
│  │          ●                                         │  │
│  │     🏢 Điểm tập kết (15m)                         │  │
│  │       ○ ─ ─ ─ ─                                   │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  Vị trí hiện tại: 10.8231, 106.6297                    │
│  Khoảng cách: 8.5m  ✅ Trong phạm vi hợp lệ            │
│  Độ chính xác: ±5.2m                                    │
│                                                          │
│  Thứ Ba, 10/03/2026 · 07:45                            │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │            [CHECK IN  #15803D]                     │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ─────── ĐÃ ĐIỂM DANH ───────                          │
│  ✅ Check-in:  07:45  · Khu phố 1                      │
│  ─── Chưa check-out                                     │
│  ┌────────────────────────────────────────────────────┐  │
│  │            [CHECK OUT  #DC2626]                    │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

**Distance > 15m:** button disabled + "Bạn đang ngoài phạm vi (X.Xm)"
**Status late (>08:30):** SnackBar vàng "Bạn đã check-in muộn"

---

### 5.5 ReportWorkScreen — `/dqtv/report`

```
┌──────────────────────────────────────────────────────────┐
│  [AppHeader: "Gửi báo cáo"]                             │
├──────────────────────────────────────────────────────────┤
│  [Hàng ngày] [Sự vụ] [Tháng]                           │
├──────────────────────────────────────────────────────────┤
│  ĐỊA ĐIỂM                                              │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Nhập địa điểm... (tùy chọn)                       │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  NỘI DUNG *                                             │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Nhập nội dung báo cáo... (bắt buộc)               │  │
│  │                                                    │  │
│  │                              [🎤 mic]             │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  HÌNH ẢNH ĐÍNH KÈM (tùy chọn, tối đa 5 ảnh)           │
│  ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌─────┐                       │
│  │img│ │img│ │   │ │   │ │  +  │                       │
│  └───┘ └───┘ └───┘ └───┘ └─────┘                       │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │              [GỬI BÁO CÁO  #15803D]               │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  BÁO CÁO ĐÃ GỬI                                        │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Hàng ngày · 10/03/2026 22:30    [Chờ duyệt #F59E0B]│
│  │ Tuần tra KP1 từ 18h-22h, không có bất thường.     │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

**API:** POST /reports (gửi), GET /reports/my (lịch sử)
**Voice input:** speech_to_text → append to content field

---

### 5.6 ProfileDQTVScreen — `/dqtv/profile`

```
┌──────────────────────────────────────────────────────────┐
│  [AppHeader: "Cá nhân"]                                 │
├──────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────┐  │
│  │        [avatar 80px]                              │  │
│  │        Nguyễn Văn An                              │  │
│  │        HCM-PHD-T12-0001 · Dân quân thường trực    │  │
│  │        Khu phố 1, Phường Phú Định                  │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  THÔNG TIN                                              │
│  Họ tên:     Nguyễn Văn An                             │
│  CCCD:       079095001001                               │
│  Ngày sinh:  15/05/1995                                 │
│  Điện thoại: 0909 123 456                               │
│  Tham gia:   01/10/2022                                 │
│                                                          │
│  CHUYÊN CẦN                                             │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Tháng này: 18/20 ngày   Đúng giờ: 16/18           │  │
│  │ Tỷ lệ: 90%  [bar #10B981]                          │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  [Cài đặt MFA]   [Đổi thông tin]                       │
│  ─────────────────────────────────────────────────────  │
│  [ĐĂNG XUẤT  #EF4444]                                   │
└──────────────────────────────────────────────────────────┘
```

---

## 6. COMMON SCREENS

### 6.1 LoginScreen — `/login`

```
┌──────────────────────────────────────────────────────────┐
│  [gradient full-screen: #FBBF24 → #FDE047 → #FEF08A]   │
│                                                          │
│              🚔 PoliceApp                               │
│           Hệ thống quản lý DQTV                         │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Tên đăng nhập                                      │  │
│  │ ┌────────────────────────────────────────────────┐ │  │
│  │ │ ca001 hoặc dqtv001                            │ │  │
│  │ └────────────────────────────────────────────────┘ │  │
│  │                                                    │  │
│  │ Mật khẩu                                           │  │
│  │ ┌────────────────────────────────────────────────┐ │  │
│  │ │ ••••••   [👁]                                 │ │  │
│  │ └────────────────────────────────────────────────┘ │  │
│  │                                                    │  │
│  │           [ĐĂNG NHẬP  #DC2626]                    │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│              [Phiên bản 1.0.0]                          │
└──────────────────────────────────────────────────────────┘
```

**On success (no MFA):** detect role → redirect /ca/home or /dqtv/home
**On requiresMfa:** → /otp
**On requiresMfaSetup:** → /mfa-setup

---

### 6.2 OtpScreen — `/otp`

```
┌──────────────────────────────────────────────────────────┐
│  [AppHeader: "Xác thực 2 bước"]                         │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Nhập mã OTP 6 số từ ứng dụng xác thực của bạn         │
│                                                          │
│  ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐                        │
│  │1 │ │2 │ │3 │ │4 │ │5 │ │6 │                        │
│  └──┘ └──┘ └──┘ └──┘ └──┘ └──┘                        │
│                                                          │
│           [XÁC NHẬN  #366092]                           │
│                                                          │
│  Không nhận được mã? [Dùng mã khôi phục]               │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**API:** POST /auth/verify-mfa với tempToken từ LoginScreen

---

### 6.3 NotificationsScreen — `/ca/notifications` | `/dqtv/notifications`

```
┌──────────────────────────────────────────────────────────┐
│  [AppHeader: "Thông báo"   [Đọc tất cả]]               │
├──────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────┐  │
│  │ 🔵 Nhiệm vụ mới         [unread dot]    08:00     │  │
│  │ Bạn được giao: Tuần tra khu phố 1                  │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │    Điểm KPI                              Yesterday │  │
│  │ KPI tháng 2/2026 của bạn: 87.5 điểm               │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

**API:** GET /notifications, POST /notifications/:id/read, POST /notifications/read-all

---

## 7. STATUS BADGES

```dart
// shared/widgets/status_badge.dart
// Task status
'pending'     → Container(color: #94A3B8, text: 'Chờ giao')
'assigned'    → Container(color: #F59E0B, text: 'Chưa tiếp nhận')
'in_progress' → Container(color: #3B82F6, text: 'Đang thực hiện')
'completed'   → Container(color: #10B981, text: 'Hoàn thành')
'overdue'     → Container(color: #EF4444, text: 'Trễ hạn')
'cancelled'   → Container(color: #64748B, text: 'Đã hủy')

// Leave status
'pending'  → #F59E0B 'Chờ duyệt'
'approved' → #10B981 'Đã duyệt'
'rejected' → #EF4444 'Từ chối'

// Alert severity
'info'     → #3B82F6
'warning'  → #F59E0B
'urgent'   → #EF4444
'critical' → #7C3AED

// GPS status
'online'   → #10B981 🟢
'moving'   → #F59E0B 🟡
'offline'  → #94A3B8 ⚫
```

---

## 8. LOADING & ERROR STATES

```dart
// Loading state (per screen)
Center(child: CircularProgressIndicator(color: AppColors.navy))

// Error state
Column(children: [
  Icon(Icons.error_outline, color: AppColors.error, size: 48),
  Text('Đã có lỗi xảy ra'),
  ElevatedButton(onPressed: retry, child: Text('Thử lại')),
])

// Empty state
Column(children: [
  Icon(Icons.inbox_outlined, color: AppColors.textMuted, size: 48),
  Text('Không có dữ liệu', style: TextStyle(color: AppColors.textSecondary)),
])
```

---

## 9. RESPONSIVE NOTES

- Target: Android (primary), iOS (secondary)
- Min screen width: 360px
- Safe area: EdgeInsets.only(bottom: MediaQuery.of(context).padding.bottom)
- Keyboard avoidance: resizeToAvoidBottomInset: true
- List items: min height 72px (tap target)
- Buttons: min height 48px, full width
