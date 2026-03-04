# 🔐 HỆ THỐNG PHÂN QUYỀN MENU - KIỂM TRA

## Testing Checklist cho Menu Navigation System

---

## ✅ SYSTEM ADMIN (`admin` / `Admin@123`)

### Menu Items Phải Thấy:
- [x] Dashboard
- [x] **Quản Lý Nhân Sự**
  - [x] Danh sách DQTV
  - [x] Tìm kiếm DQTV
  - [x] **Quản lý người dùng** ✓ (CHỈ ADMIN)
- [x] **Quản Lý Giao Việc**
  - [x] Giao việc mới
  - [x] Danh sách nhiệm vụ
- [x] **Tuyển Dụng**
- [x] **Chấm Công & Lương**
  - [x] Bảng chấm công
  - [x] Tính lương
  - [x] Bảng lương
- [x] **Tracking GPS**
- [x] **Báo Cáo & Thống Kê**
  - [x] Dashboard KPI
  - [x] Báo cáo chấm công
  - [x] Báo cáo nhiệm vụ
  - [x] Báo cáo tùy chỉnh
- [x] **Duyệt Đơn Từ**
- [x] **Cài Đặt**
  - [x] Thông tin cá nhân
  - [x] Đổi mật khẩu
  - [x] **Cấu hình hệ thống** ✓ (CHỈ ADMIN)
  - [x] Cấu hình KPI
  - [x] Cấu hình thông báo
  - [x] **Nhật ký hoạt động** ✓ (CHỈ ADMIN)

**Total Menu Items:** ~25
**Unique Features:** Quản lý người dùng, Cấu hình hệ thống, Nhật ký hoạt động

---

## ✅ LÃNH ĐẠO UBND (`lanhdao1` / `Leader@123`)

### Menu Items Phải Thấy:
- [x] Dashboard
- [x] **Quản Lý Nhân Sự**
  - [x] Danh sách DQTV
  - [x] Tìm kiếm DQTV
  - [ ] ~~Quản lý người dùng~~ ❌
- [x] **Quản Lý Giao Việc**
  - [x] Giao việc mới
  - [x] Danh sách nhiệm vụ
- [x] **Tuyển Dụng**
- [x] **Chấm Công & Lương**
  - [x] Bảng chấm công
  - [ ] ~~Tính lương~~ ❌
  - [x] Bảng lương
- [x] **Tracking GPS**
- [x] **Báo Cáo & Thống Kê**
  - [x] Dashboard KPI
  - [x] Báo cáo chấm công
  - [x] Báo cáo nhiệm vụ
  - [x] Báo cáo tùy chỉnh
- [x] **Duyệt Đơn Từ**
- [x] **Cài Đặt**
  - [x] Thông tin cá nhân
  - [x] Đổi mật khẩu
  - [ ] ~~Cấu hình hệ thống~~ ❌
  - [x] Cấu hình KPI
  - [x] Cấu hình thông báo
  - [ ] ~~Nhật ký hoạt động~~ ❌

**Total Menu Items:** ~21
**Hidden from Admin:** Quản lý người dùng, Tính lương, Cấu hình hệ thống, Nhật ký

---

## ✅ CÔNG AN PHƯỜNG (`caphuong` / `Police@123`)

### Menu Items Phải Thấy:
- [x] Dashboard
- [x] **Quản Lý Nhân Sự**
  - [x] Danh sách DQTV
  - [x] Tìm kiếm DQTV
  - [ ] ~~Quản lý người dùng~~ ❌
- [x] **Quản Lý Giao Việc**
  - [x] Giao việc mới
  - [x] Danh sách nhiệm vụ
- [x] **Tuyển Dụng**
- [x] **Chấm Công & Lương**
  - [x] Bảng chấm công
  - [x] Tính lương
  - [x] Bảng lương
- [x] **Tracking GPS**
- [x] **Báo Cáo & Thống Kê**
  - [x] Dashboard KPI
  - [x] Báo cáo chấm công
  - [x] Báo cáo nhiệm vụ
  - [x] Báo cáo tùy chỉnh
- [x] **Duyệt Đơn Từ**
- [x] **Cài Đặt**
  - [x] Thông tin cá nhân
  - [x] Đổi mật khẩu
  - [ ] ~~Cấu hình hệ thống~~ ❌
  - [x] Cấu hình KPI
  - [x] Cấu hình thông báo
  - [ ] ~~Nhật ký hoạt động~~ ❌

**Total Menu Items:** ~22
**Key Difference:** Có Tính lương, không có Quản lý người dùng

---

## ✅ CÔNG AN KHU VỰC (`cakv1` / `CAKV@123`)

### Menu Items Phải Thấy:
- [x] Dashboard
- [x] **Quản Lý Nhân Sự**
  - [x] Danh sách DQTV (CHỈ KHU PHỐ 1)
  - [x] Tìm kiếm DQTV (CHỈ KHU PHỐ 1)
  - [ ] ~~Quản lý người dùng~~ ❌
- [x] **Quản Lý Giao Việc**
  - [x] Giao việc mới (CHỈ CHO KHU PHỐ 1)
  - [x] Danh sách nhiệm vụ (CHỈ KHU PHỐ 1)
- [ ] ~~Tuyển Dụng~~ ❌
- [x] **Chấm Công & Lương**
  - [x] Bảng chấm công (CHỈ KHU PHỐ 1)
  - [ ] ~~Tính lương~~ ❌
  - [x] Bảng lương (CHỈ KHU PHỐ 1)
- [x] **Tracking GPS** (CHỈ KHU PHỐ 1)
- [x] **Báo Cáo & Thống Kê**
  - [x] Dashboard KPI (CHỈ KHU PHỐ 1)
  - [x] Báo cáo chấm công (CHỈ KHU PHỐ 1)
  - [x] Báo cáo nhiệm vụ (CHỈ KHU PHỐ 1)
  - [ ] ~~Báo cáo tùy chỉnh~~ ❌
- [x] **Duyệt Đơn Từ** (CHỈ KHU PHỐ 1)
- [x] **Cài Đặt**
  - [x] Thông tin cá nhân
  - [x] Đổi mật khẩu
  - [x] Cấu hình thông báo
  - [ ] ~~Các cấu hình khác~~ ❌

**Total Menu Items:** ~15
**Key Restrictions:**
- ❌ KHÔNG có Tuyển Dụng
- ❌ KHÔNG có Tính lương
- ❌ KHÔNG có Báo cáo tùy chỉnh
- ⚠️ CHỈ thấy data KHU PHỐ 1

---

## ✅ NHÂN VIÊN VĂN PHÒNG (`nvvp1` / `Staff@123`)

### Menu Items Phải Thấy:
- [x] Dashboard
- [x] **Quản Lý Nhân Sự**
  - [x] Danh sách DQTV
  - [x] Tìm kiếm DQTV
  - [ ] ~~Quản lý người dùng~~ ❌
- [ ] ~~Quản Lý Giao Việc~~ ❌
- [x] **Tuyển Dụng**
- [x] **Chấm Công & Lương**
  - [x] Bảng chấm công
  - [x] Tính lương
  - [x] Bảng lương
- [x] **Tracking GPS**
- [x] **Báo Cáo & Thống Kê**
  - [x] Dashboard KPI
  - [x] Báo cáo chấm công
  - [x] Báo cáo nhiệm vụ
  - [x] Báo cáo tùy chỉnh
- [x] **Duyệt Đơn Từ**
- [x] **Cài Đặt**
  - [x] Thông tin cá nhân
  - [x] Đổi mật khẩu
  - [x] Cấu hình thông báo
  - [ ] ~~Cấu hình hệ thống, KPI~~ ❌

**Total Menu Items:** ~16
**Key Restrictions:**
- ❌ KHÔNG có Quản Lý Giao Việc (không giao việc)
- ❌ KHÔNG có Cấu hình KPI

---

## ✅ DQTV (`dqtv001` / `DQTV@001`)

### Menu Items Phải Thấy (HOÀN TOÀN KHÁC):
- [x] Dashboard (tối giản, chỉ info cá nhân)
- [ ] ~~Quản Lý Nhân Sự~~ ❌
- [x] **Nhiệm Vụ Của Tôi** ✓ (THAY THẾ "Quản lý giao việc")
  - [x] Đang thực hiện
  - [x] Lịch sử nhiệm vụ
- [ ] ~~Tuyển Dụng~~ ❌
- [x] **Chấm Công & Lương**
  - [ ] ~~Bảng chấm công~~ ❌
  - [ ] ~~Tính lương~~ ❌
  - [x] **Chấm công của tôi** ✓
  - [x] Bảng lương (CHỈ CỦA BẢN THÂN)
- [ ] ~~Tracking GPS~~ ❌
- [x] **Báo Cáo & Thống Kê**
  - [x] **KPI của tôi** ✓ (CHỈ CÁ NHÂN)
  - [ ] ~~Các báo cáo khác~~ ❌
- [x] **Đơn Của Tôi** ✓ (THAY THẾ "Duyệt đơn từ")
  - [x] Đăng ký nghỉ phép
  - [x] Lịch sử đơn từ
- [x] **Cài Đặt**
  - [x] Thông tin cá nhân
  - [x] Đổi mật khẩu
  - [x] Cấu hình thông báo

**Total Menu Items:** ~11
**Unique Features:**
- ✓ "Nhiệm Vụ Của Tôi" (thay vì Quản lý giao việc)
- ✓ "Đơn Của Tôi" (thay vì Duyệt đơn từ)
- ✓ "Chấm công của tôi"
- ✓ "KPI của tôi"

---

## 🧪 TESTING SCENARIOS

### Test Case 1: Menu Visibility by Role
```typescript
// Test admin sees all menus
login('admin', 'Admin@123')
assert(menuItems.length === 9) // All 9 main menus
assert(hasMenuItem('Quản lý người dùng'))
assert(hasMenuItem('Cấu hình hệ thống'))

// Test CA Khu vực has limited menus
login('cakv1', 'CAKV@123')
assert(!hasMenuItem('Tuyển Dụng'))
assert(!hasMenuItem('Tính lương'))
assert(!hasMenuItem('Báo cáo tùy chỉnh'))

// Test DQTV has unique menus
login('dqtv001', 'DQTV@001')
assert(hasMenuItem('Nhiệm Vụ Của Tôi'))
assert(hasMenuItem('Đơn Của Tôi'))
assert(!hasMenuItem('Quản Lý Nhân Sự'))
```

### Test Case 2: Data Scope Filtering
```typescript
// CA Khu vực 1 only sees District 1 data
login('cakv1', 'CAKV@123')
navigateTo('Danh sách DQTV')
const visibleDQTV = getDQTVList()
assert(visibleDQTV.every(d => d.districtId === 1))

// Try to access District 2 directly (should fail)
tryNavigate('/personnel/district/2')
assert(currentPage === '/403' || currentPage === '/dashboard')
```

### Test Case 3: Submenu Visibility
```typescript
// Admin sees "Phân quyền" in Nhân sự submenu
login('admin', 'Admin@123')
openSubmenu('Quản Lý Nhân Sự')
assert(hasSubmenuItem('Quản lý người dùng'))

// Leader KHÔNG thấy "Phân quyền"
login('lanhdao1', 'Leader@123')
openSubmenu('Quản Lý Nhân Sự')
assert(!hasSubmenuItem('Quản lý người dùng'))
```

### Test Case 4: DQTV Unique Menus
```typescript
// DQTV sees "Nhiệm Vụ Của Tôi" instead of "Quản Lý Giao Việc"
login('dqtv001', 'DQTV@001')
assert(hasMenuItem('Nhiệm Vụ Của Tôi'))
assert(!hasMenuItem('Quản Lý Giao Việc'))

// DQTV sees "Đơn Của Tôi" instead of "Duyệt Đơn Từ"
assert(hasMenuItem('Đơn Của Tôi'))
assert(!hasMenuItem('Duyệt Đơn Từ'))
```

---

## 📊 SUMMARY TABLE

| Role | Total Menus | Unique Features | Data Scope |
|------|-------------|-----------------|------------|
| **System Admin** | 9 main + 16 sub | Quản lý người dùng, Cấu hình hệ thống, Nhật ký | Tất cả |
| **Lãnh đạo UBND** | 9 main + 12 sub | Duyệt lương | Tất cả |
| **CA Phường** | 9 main + 13 sub | Tính lương, Cấu hình KPI | Tất cả |
| **CA Khu Vực** | 7 main + 8 sub | - | CHỈ khu phố |
| **Nhân viên VP** | 8 main + 8 sub | Tính lương | Tất cả |
| **DQTV** | 6 main + 5 sub | Nhiệm vụ/Đơn của tôi, Chấm công | CHỈ bản thân |

---

## ✅ ACCEPTANCE CRITERIA

- [ ] Admin thấy 100% menu items (25 items)
- [ ] Lãnh đạo KHÔNG thấy "Quản lý người dùng", "Tính lương", "Cấu hình hệ thống"
- [ ] CA Phường KHÔNG thấy "Quản lý người dùng" nhưng CÓ "Tính lương"
- [ ] CA Khu vực KHÔNG thấy "Tuyển Dụng", "Tính lương", "Báo cáo tùy chỉnh"
- [ ] CA Khu vực CHỈ thấy data khu phố mình quản lý
- [ ] Nhân viên VP KHÔNG thấy "Quản Lý Giao Việc"
- [ ] DQTV có menu riêng "Nhiệm Vụ Của Tôi" và "Đơn Của Tôi"
- [ ] DQTV KHÔNG thấy "Quản Lý Nhân Sự", "Tracking GPS"
- [ ] Không có menu item nào bị disabled (chỉ render nếu có quyền)
- [ ] Empty state hiện khi user không có menu nào

---

## 🐛 COMMON ISSUES TO CHECK

1. **Menu still shows but disabled** ❌
   - FIX: Remove from render, don't just disable
   
2. **CA Khu vực sees all districts data** ❌
   - FIX: Apply filterDataByScope() in components
   
3. **DQTV sees management menus** ❌
   - FIX: Check role filter in menuConfig.ts
   
4. **Submenu shows even when all children filtered** ❌
   - FIX: Remove parent if children.length === 0

---

© 2024 UBND Phường Phú Định - Permission Testing Guide v1.0
