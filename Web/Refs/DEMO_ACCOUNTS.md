# 🔐 TÀI KHOẢN DEMO - HỆ THỐNG QUẢN LÝ DÂN QUÂN TỰ VỆ
## UBND Phường Phú Định - TP.HCM

---

## 📋 BẢNG TÀI KHOẢN DEMO NHANH

| Vai trò | Username | Password | Họ tên | Phạm vi |
|---------|----------|----------|--------|---------|
| **🔧 System Admin** | `admin` | `Admin@123` | Nguyễn Văn Admin | Toàn hệ thống |
| **👔 Lãnh đạo UBND #1** | `lanhdao1` | `Leader@123` | Trần Thị Minh Châu (Phó Chủ tịch) | 6 khu phố |
| **👔 Lãnh đạo UBND #2** | `lanhdao2` | `Leader@456` | Lê Văn Hùng (Trưởng phòng) | 6 khu phố |
| **👮 CA Phường #1** | `caphuong` | `Police@123` | Đại úy Phạm Minh Tuấn | 6 khu phố |
| **👮 CA Phường #2** | `phocaphuong` | `Police@456` | Thượng úy Nguyễn Văn Nam | 6 khu phố |
| **🚓 CA Khu vực 1** | `cakv1` | `CAKV@123` | Trung úy Võ Văn Tân | Chỉ KP1 |
| **🚓 CA Khu vực 2** | `cakv2` | `CAKV@223` | Trung úy Hoàng Minh Đức | Chỉ KP2 |
| **🚓 CA Khu vực 3** | `cakv3` | `CAKV@323` | Thượng úy Trần Văn Hải | Chỉ KP3 |
| **🚓 CA Khu vực 4** | `cakv4` | `CAKV@423` | Trung úy Lê Thị Lan | Chỉ KP4 |
| **🚓 CA Khu vực 5** | `cakv5` | `CAKV@523` | Trung úy Nguyễn Văn Phong | Chỉ KP5 |
| **🚓 CA Khu vực 6** | `cakv6` | `CAKV@623` | Thượng úy Phan Văn Long | Chỉ KP6 |
| **📝 Nhân viên VP #1** | `nvvp1` | `Staff@123` | Nguyễn Thị Hoa (Hành chính) | Admin |
| **📝 Nhân viên VP #2** | `nvvp2` | `Staff@456` | Trần Văn Bình (Tổng hợp) | Admin |
| **📝 Nhân viên VP #3** | `nvvp3` | `Staff@789` | Lê Thị Mai (Kế toán) | Tài chính |
| **🎖️ DQTV #001** | `dqtv001` | `DQTV@001` | Nguyễn Văn An | Cá nhân |
| **🎖️ DQTV #002** | `dqtv002` | `DQTV@002` | Trần Thị Bích | Cá nhân |
| **🎖️ DQTV #007** | `dqtv007` | `DQTV@007` | Đặng Văn Phúc | Cá nhân |

---

## 🎯 KỊCH BẢN DEMO THEO VAI TRÒ

### 1️⃣ SYSTEM ADMIN (`admin` / `Admin@123`)

**Quyền hạn:**
- ✅ Truy cập toàn bộ 9 module
- ✅ Quản lý người dùng và phân quyền
- ✅ Cấu hình hệ thống
- ✅ Xem nhật ký hoạt động
- ✅ Xuất dữ liệu toàn hệ thống

**Test scenarios:**
1. Xem dashboard tổng quan
2. Thêm/sửa/xóa người dùng
3. Phân quyền cho các vai trò
4. Cấu hình thông tin đơn vị
5. Xem activity log

---

### 2️⃣ LÃNH ĐẠO UBND (`lanhdao1` / `Leader@123`)

**Quyền hạn:**
- ✅ Xem báo cáo tổng hợp
- ✅ Duyệt đơn nghỉ phép
- ✅ Duyệt lương
- ✅ Xem KPI toàn phường
- ✅ Ra quyết định chiến lược

**Test scenarios:**
1. Xem dashboard lãnh đạo
2. Duyệt 3 đơn nghỉ phép chờ
3. Xem báo cáo KPI tháng 11/2024
4. Xem báo cáo chấm công
5. Export báo cáo tổng hợp

---

### 3️⃣ CÔNG AN PHƯỜNG (`caphuong` / `Police@123`)

**Quyền hạn:**
- ✅ Giao việc cho tất cả 6 khu phố
- ✅ Xem GPS tracking toàn phường
- ✅ Đánh giá KPI DQTV
- ✅ Xử lý cảnh báo GPS
- ✅ Báo cáo tổng hợp

**Test scenarios:**
1. Xem danh sách 168 DQTV toàn phường
2. Giao nhiệm vụ mới cho DQTV ở KP1
3. Theo dõi GPS real-time
4. Xem 3 DQTV có cảnh báo vị trí
5. Tạo báo cáo tháng

---

### 4️⃣ CÔNG AN KHU VỰC (`cakv1` / `CAKV@123`)

**Quyền hạn:**
- ✅ Chỉ xem DQTV ở Khu phố 1
- ✅ Giao việc cho KP1 only
- ✅ Theo dõi GPS KP1
- ✅ Đánh giá DQTV trong khu vực
- ❌ KHÔNG thấy dữ liệu khu phố khác

**Test scenarios:**
1. Đăng nhập → chỉ thấy DQTV KP1
2. Thử giao việc → chỉ có danh sách KP1
3. Xem GPS → chỉ 4 DQTV trong KP1
4. Xem báo cáo → chỉ data KP1
5. Verify: KHÔNG thấy KP2-6

---

### 5️⃣ NHÂN VIÊN VĂN PHÒNG (`nvvp1` / `Staff@123`)

**Quyền hạn:**
- ✅ Nhập liệu chấm công
- ✅ Tính lương
- ✅ Import/Export Excel
- ✅ Tạo báo cáo
- ✅ Gửi thông báo

**Test scenarios:**
1. Nhập chấm công cho 20 DQTV
2. Tính lương tháng 12/2024
3. Import file Excel danh sách DQTV
4. Export báo cáo chấm công
5. Gửi thông báo đến DQTV

---

### 6️⃣ DQTV (`dqtv001` / `DQTV@001`)

**Quyền hạn (Mobile App):**
- ✅ Chấm công GPS
- ✅ Xem nhiệm vụ được giao
- ✅ Nhận/từ chối nhiệm vụ
- ✅ Cập nhật tiến độ
- ✅ Upload ảnh báo cáo
- ✅ Xin nghỉ phép
- ✅ Xem KPI cá nhân

**Test scenarios:**
1. Xem 2 nhiệm vụ được giao
2. Check-in với GPS
3. Cập nhật tiến độ nhiệm vụ
4. Upload ảnh hiện trường
5. Tạo đơn xin nghỉ phép
6. Xem điểm KPI tháng 11

---

## 📊 DỮ LIỆU MẪU TRONG HỆ THỐNG

### Khu phố (6)
- Khu phố 1-6 với thông tin đầy đủ
- Dân số, diện tích, mô tả

### DQTV (20 demo accounts, đại diện 168 total)
- **KP1:** 4 DQTV (DQTV001-004)
- **KP2:** 4 DQTV (DQTV005-008)
- **KP3:** 4 DQTV (DQTV009-012)
- **KP4:** 4 DQTV (DQTV013-016)
- **KP5:** 2 DQTV (DQTV017-018)
- **KP6:** 2 DQTV (DQTV019-020)

### Nhiệm vụ (10)
- ✅ **Hoàn thành:** 2 nhiệm vụ
- 🔄 **Đang thực hiện:** 3 nhiệm vụ
- ⏳ **Chờ xử lý:** 2 nhiệm vụ
- ⚠️ **Quá hạn:** 2 nhiệm vụ
- ❌ **Từ chối:** 1 nhiệm vụ

### Chấm công
- DQTV001: Chấm công tốt (5/5 ngày)
- DQTV004: Đang nghỉ phép
- DQTV007: Có 2 lần đi trễ

### Đơn nghỉ phép (4)
- ✅ Đã duyệt: 1
- ⏳ Chờ duyệt: 2
- ❌ Từ chối: 1

### KPI Tháng 11/2024
- Xuất sắc: 2 người (>95 điểm)
- Tốt: 2 người (85-95 điểm)
- Trung bình: 1 người (70-85 điểm)

---

## 🔒 QUY TẮC MẬT KHẨU (CHỈ ÁP DỤNG KHI PRODUCTION)

```
- Độ dài tối thiểu: 12 ký tự
- Bắt buộc: chữ hoa + chữ thường + số + ký tự đặc biệt
- Không được dùng mật khẩu phổ biến
- Thay đổi mỗi 90 ngày
- Xác thực 2 yếu tố cho Admin
- Khóa tài khoản sau 5 lần đăng nhập sai
- Không được tái sử dụng 5 mật khẩu gần nhất
```

---

## ⚙️ RESET DỮ LIỆU DEMO

Để reset lại toàn bộ dữ liệu demo về trạng thái ban đầu:

```bash
# Option 1: Clear localStorage (Frontend only)
localStorage.clear();
location.reload();

# Option 2: Re-import mock data
import { users, tasks, attendance, ... } from '@/data/mockData';
```

---

## 📞 HỖ TRỢ

**Liên hệ:**
- Email: support@ubnd-phd.gov.vn
- Hotline: (028) 3851 2345
- Website: https://phudinh.tphcm.gov.vn

**Giờ làm việc:**
- Thứ 2 - Thứ 6: 7:30 - 17:00
- Thứ 7: 7:30 - 11:30

---

© 2024 UBND Phường Phú Định - Hệ thống Quản lý Dân quân Tự vệ v1.0.0
