# 07_USER_MANUAL — Hệ thống MMS Web
**Phiên bản:** v1.0.0 | **Ngày:** 2026-03-08 | **Hệ thống:** MMS Web (Quản lý Dân Quân Tự Vệ)

---

## 1. GIỚI THIỆU

Hệ thống MMS Web là giao diện quản lý tập trung cho các cán bộ phụ trách Dân Quân Tự Vệ (DQTV) tại phường. Hệ thống cho phép:
- Đăng nhập và phân quyền theo vai trò
- Quản lý hồ sơ nhân sự DQTV
- Giao việc và theo dõi tiến độ
- Chấm công và quản lý nghỉ phép
- Xem bản đồ GPS thời gian thực
- Xử lý cảnh báo SOS
- Tra cứu lịch sử audit

**URL truy cập:** `http://localhost:5173` (dev) hoặc domain được cấp phát

---

## 2. YÊU CẦU HỆ THỐNG

| Mục | Yêu cầu |
|-----|---------|
| Trình duyệt | Chrome 120+, Firefox 120+, Edge 120+ |
| Kết nối | Internet băng thông tối thiểu 2 Mbps |
| Màn hình | Độ phân giải tối thiểu 1280×720 |

---

## 3. ĐĂNG NHẬP (US-W001)

### 3.1 Đăng nhập lần đầu

1. Truy cập URL hệ thống — trang đăng nhập hiển thị tự động
2. Nhập **Tên đăng nhập** (do quản trị viên cấp)
3. Nhập **Mật khẩu** (tối thiểu 8 ký tự)
4. Tích **Ghi nhớ tôi (7 ngày)** nếu muốn duy trì phiên đăng nhập
5. Nhấn **Đăng nhập**

**Lưu ý:** Sau 5 lần nhập sai mật khẩu liên tiếp, tài khoản sẽ bị khóa 30 phút.

### 3.2 Các vai trò và quyền truy cập

| Vai trò | Mã | Quyền chính |
|---------|-----|-------------|
| Quản trị hệ thống | `system_admin` | Toàn quyền: quản lý users, xem audit log |
| Lãnh đạo UBND | `ubnd_leader` | Xem báo cáo, KPI, thống kê toàn phường |
| CA Phường | `police_ward` | Quản lý DQTV, giao việc, GPS, duyệt phép |
| CA Khu vực | `police_area` | Quản lý DQTV trong khu phố được phân công |
| Cán bộ văn phòng | `office_staff` | Hồ sơ nhân sự, bảng lương |
| Dân quân tự vệ | `militia` | Xem nhiệm vụ cá nhân, gửi SOS, chấm công |

### 3.3 Đăng xuất

Nhấn vào avatar góc trên phải → chọn **Đăng xuất**. Tất cả phiên đăng nhập sẽ bị hủy.

---

## 4. GIAO DIỆN CHÍNH

### 4.1 Thanh điều hướng trái (Sidebar)

Menu hiển thị các mục dựa trên vai trò của người dùng:

| Mục menu | Vai trò có quyền |
|----------|-----------------|
| Tổng quan | Tất cả |
| Nhân sự DQTV | police_ward, police_area, office_staff, system_admin |
| Giao việc | police_ward, police_area, system_admin |
| Chấm công | police_ward, police_area, office_staff, system_admin |
| Đơn nghỉ phép | Tất cả |
| GPS/Vị trí | police_ward, police_area, system_admin |
| SOS/Cảnh báo | police_ward, police_area, system_admin |
| Thông báo | Tất cả |
| Bảng lương | office_staff, system_admin |
| Báo cáo KPI | ubnd_leader, police_ward, system_admin |
| Quản lý Users | system_admin |
| Audit Log | police_ward, system_admin |

### 4.2 Header

- **Biểu tượng chuông**: Số thông báo chưa đọc
- **Chấm đỏ SOS**: Cảnh báo SOS đang hoạt động (nhấp để xem)
- **Avatar + tên**: Thông tin người dùng và đăng xuất

---

## 5. TÍNH NĂNG CHI TIẾT

### 5.1 Quản lý Hồ sơ DQTV (US-W003)

**Xem danh sách:**
- Vào menu **Nhân sự DQTV**
- Danh sách tự động lọc theo phạm vi đơn vị (CA Khu vực chỉ thấy khu phố của mình)
- Tìm kiếm theo tên, CCCD, khu phố, trạng thái

**Tạo hồ sơ mới:**
1. Nhấn **+ Thêm mới**
2. Điền đầy đủ: Họ tên (*), Ngày sinh (*), CCCD 12 số (*), Điện thoại, Địa chỉ, Khu phố (*), Cấp bậc (*)
3. Nhấn **Lưu**

**Lưu ý:** CCCD phải đúng 12 chữ số. Khu phố phải thuộc phạm vi phân công của bạn.

---

### 5.2 Giao Việc (US-W004)

**Tạo nhiệm vụ mới:**
1. Vào menu **Giao việc** → nhấn **+ Tạo nhiệm vụ**
2. Điền tiêu đề (*), loại nhiệm vụ (*), mức ưu tiên, hạn chót (phải là tương lai) (*)
3. Chọn DQTV được phân công (*)
4. Nhấn **Tạo**
5. DQTV sẽ nhận thông báo qua Mobile App

**Theo dõi tiến độ:** Mỗi nhiệm vụ có trạng thái: `pending → in_progress → completed` hoặc `cancelled`.

---

### 5.3 Chấm Công (US-W005)

- Xem bảng chấm công theo tháng, lọc theo DQTV/khu phố
- CA Phường có thể mở/đóng kỳ chấm công
- Chỉnh sửa chấm công thủ công khi cần (có audit log)

---

### 5.4 Quản lý Nghỉ Phép (US-W006)

- Xem danh sách đơn nghỉ phép đang chờ duyệt
- Duyệt hoặc từ chối kèm lý do
- Số ngày phép còn lại cập nhật tự động

---

### 5.5 GPS / Vị trí Thực Tế (US-W008)

- Xem bản đồ vị trí DQTV đang trực chiến theo thời gian thực
- Lịch sử di chuyển trong ngày
- Cảnh báo khi DQTV rời khỏi khu vực được phân công

---

### 5.6 SOS / Cảnh Báo Khẩn Cấp (US-W009)

- Biểu tượng chấm đỏ trên header khi có SOS
- Nhấp vào để xem chi tiết: vị trí GPS, thời gian, DQTV gửi
- Xác nhận xử lý → SOS đóng lại và ghi vào lịch sử

---

### 5.7 Quản lý Users (US-W002 — Chỉ System Admin)

**Tạo user mới:**
1. Vào **Quản lý Users** → nhấn **+ Tạo user**
2. Điền: Tên đăng nhập (*), Họ tên (*), Email, Vai trò (*), Phạm vi đơn vị
3. Nhấn **Lưu** — user nhận email mật khẩu tạm thời

**Khóa tài khoản:**
- Chọn user → nhấn **Suspend** → tất cả phiên hoạt động bị hủy ngay lập tức

---

### 5.8 Audit Log (US-W012 — Police Ward+)

- Xem lịch sử toàn bộ thao tác trên hệ thống
- Lọc theo: tác nhân, loại hành động, entity, khoảng thời gian
- Mỗi bản ghi có: actor, action, entity, IP, trước/sau thay đổi

---

## 6. XỬ LÝ SỰ CỐ THƯỜNG GẶP

| Tình huống | Nguyên nhân | Cách xử lý |
|-----------|-------------|------------|
| "Tên đăng nhập hoặc mật khẩu không đúng" | Thông tin sai hoặc tài khoản bị khóa | Kiểm tra lại thông tin. Chờ 30 phút nếu bị khóa |
| "Tài khoản đã bị vô hiệu hóa" | Admin đã vô hiệu hóa tài khoản | Liên hệ quản trị viên |
| "Không có quyền truy cập" | Truy cập trang ngoài phạm vi vai trò | Liên hệ quản trị viên để được cấp quyền |
| "Phiên làm việc đã hết hạn" | Access token hết hạn, refresh token cũng hết | Đăng nhập lại |
| Trang trắng sau đăng nhập | Lỗi kết nối backend | Tải lại trang (F5). Nếu vẫn lỗi: liên hệ IT |
| Dữ liệu không cập nhật | Cache trình duyệt | Tải lại trang (Ctrl+Shift+R) |

---

## 7. THÔNG TIN HỖ TRỢ

- **Quản trị viên hệ thống:** Liên hệ IT bộ phận
- **Phản hồi lỗi:** Ghi rõ: URL trang, vai trò, hành động, thông báo lỗi
- **Phiên bản hệ thống:** v1.0.0 (2026-03-08)
