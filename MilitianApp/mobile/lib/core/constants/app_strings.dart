// ignore_for_file: constant_identifier_names

class AppStrings {
  AppStrings._();

  // App
  static const String appName = 'Dân Quân Tự Vệ';
  static const String appShortName = 'DQTV';

  // Auth
  static const String login = 'Đăng nhập';
  static const String logout = 'Đăng xuất';
  static const String username = 'Tên đăng nhập';
  static const String password = 'Mật khẩu';
  static const String enterUsername = 'Nhập tên đăng nhập';
  static const String enterPassword = 'Nhập mật khẩu';
  static const String loginWithBiometric = 'Đăng nhập bằng sinh trắc học';
  static const String twoFactorAuth = 'Xác thực 2 lớp';
  static const String enterOtp = 'Nhập mã OTP từ ứng dụng xác thực';
  static const String otpHint = 'Nhập 6 chữ số';
  static const String verify = 'Xác nhận';
  static const String useRecoveryCode = 'Dùng mã khôi phục';
  static const String enterRecoveryCode = 'Nhập mã khôi phục';
  static const String recoveryCodeHint = 'Nhập mã khôi phục';
  static const String setup2FA = 'Cài đặt xác thực 2 lớp';
  static const String scan2FAQr = 'Quét mã QR bằng Microsoft Authenticator';
  static const String recoveryCodes = 'Mã khôi phục';
  static const String recoveryCodesWarning =
      'Lưu các mã này ở nơi an toàn. Mỗi mã chỉ dùng được 1 lần.';
  static const String iSavedCodes = 'Tôi đã lưu các mã này';
  static const String manualEntryKey = 'Nhập thủ công';

  // Navigation / Tabs
  static const String home = 'Trang chủ';
  static const String checkin = 'Điểm danh';
  static const String tasks = 'Nhiệm vụ';
  static const String notifications = 'Thông báo';
  static const String profile = 'Hồ sơ';
  static const String chat = 'Nhắn tin';
  static const String sos = 'SOS';

  // Home
  static const String welcome = 'Chào mừng';
  static const String todaySchedule = 'Lịch hôm nay';
  static const String quickActions = 'Thao tác nhanh';
  static const String recentActivities = 'Hoạt động gần đây';
  static const String pendingTasks = 'Nhiệm vụ chờ';
  static const String attendance = 'Chuyên cần';
  static const String thisMonth = 'Tháng này';
  static const String present = 'Có mặt';
  static const String absent = 'Vắng mặt';
  static const String late = 'Trễ';

  // Check-in
  static const String checkIn = 'Điểm danh vào';
  static const String checkOut = 'Điểm danh ra';
  static const String gpsCheckin = 'Điểm danh GPS';
  static const String locating = 'Đang xác định vị trí...';
  static const String locationOk = 'Vị trí hợp lệ';
  static const String locationFar = 'Vị trí quá xa đơn vị';
  static const String distanceFromUnit = 'Khoảng cách từ đơn vị';
  static const String meters = 'm';
  static const String confirmCheckin = 'Xác nhận điểm danh vào';
  static const String confirmCheckout = 'Xác nhận điểm danh ra';
  static const String alreadyCheckedIn = 'Đã điểm danh vào';
  static const String notCheckedIn = 'Chưa điểm danh';
  static const String checkinSuccess = 'Điểm danh thành công';
  static const String checkoutSuccess = 'Điểm danh ra thành công';
  static const String gpsThreshold = '≤ 15m so với đơn vị';

  // Tasks
  static const String myTasks = 'Nhiệm vụ của tôi';
  static const String taskDetail = 'Chi tiết nhiệm vụ';
  static const String taskTitle = 'Tiêu đề';
  static const String taskDescription = 'Mô tả';
  static const String taskDeadline = 'Hạn hoàn thành';
  static const String taskStatus = 'Trạng thái';
  static const String taskPriority = 'Ưu tiên';
  static const String taskAssignedBy = 'Giao bởi';
  static const String updateStatus = 'Cập nhật trạng thái';
  static const String submitReport = 'Nộp báo cáo';
  static const String reportContent = 'Nội dung báo cáo';
  static const String attachFile = 'Đính kèm tệp';
  static const String noTasks = 'Không có nhiệm vụ';
  static const String filterAll = 'Tất cả';
  static const String filterPending = 'Chờ';
  static const String filterInProgress = 'Đang làm';
  static const String filterCompleted = 'Hoàn thành';
  static const String filterOverdue = 'Quá hạn';

  // Task statuses
  static const String statusPending = 'Chờ thực hiện';
  static const String statusInProgress = 'Đang thực hiện';
  static const String statusCompleted = 'Hoàn thành';
  static const String statusOverdue = 'Quá hạn';
  static const String statusCancelled = 'Đã hủy';

  // Task priorities
  static const String priorityLow = 'Thấp';
  static const String priorityMedium = 'Trung bình';
  static const String priorityHigh = 'Cao';
  static const String priorityCritical = 'Khẩn cấp';

  // Profile
  static const String myProfile = 'Hồ sơ của tôi';
  static const String fullName = 'Họ và tên';
  static const String rank = 'Cấp bậc';
  static const String unit = 'Đơn vị';
  static const String position = 'Chức vụ';
  static const String phoneNumber = 'Số điện thoại';
  static const String email = 'Email';
  static const String settings = 'Cài đặt';
  static const String security = 'Bảo mật';
  static const String biometricLogin = 'Đăng nhập sinh trắc học';
  static const String biometricEnable = 'Bật sinh trắc học';
  static const String biometricDisable = 'Tắt sinh trắc học';
  static const String changePassword = 'Đổi mật khẩu';
  static const String manage2FA = 'Quản lý xác thực 2 lớp';
  static const String pushNotifications = 'Thông báo đẩy';

  // Leave
  static const String leaveRequest = 'Đăng ký nghỉ phép';
  static const String leaveType = 'Loại nghỉ phép';
  static const String leaveFrom = 'Từ ngày';
  static const String leaveTo = 'Đến ngày';
  static const String leaveReason = 'Lý do';
  static const String leaveAnnual = 'Nghỉ phép năm';
  static const String leaveSick = 'Nghỉ bệnh';
  static const String leavePersonal = 'Nghỉ cá nhân';
  static const String leaveMaternity = 'Nghỉ thai sản';
  static const String submitLeave = 'Gửi đơn';
  static const String leaveSubmitted = 'Đã gửi đơn nghỉ phép';
  static const String leavePending = 'Chờ duyệt';
  static const String leaveApproved = 'Đã duyệt';
  static const String leaveRejected = 'Từ chối';

  // SOS / Incident
  static const String sosTitle = 'Cấp cứu / SOS';
  static const String sosDescription = 'Nhấn khi có tình huống khẩn cấp';
  static const String sosConfirm = 'Xác nhận gửi SOS?';
  static const String sosSent = 'Đã gửi tín hiệu SOS';
  static const String sosCancel = 'Hủy SOS';
  static const String incidentReport = 'Báo cáo sự cố';
  static const String incidentType = 'Loại sự cố';
  static const String incidentDescription = 'Mô tả sự cố';
  static const String incidentLocation = 'Vị trí sự cố';
  static const String incidentPhoto = 'Ảnh sự cố';
  static const String submitIncident = 'Gửi báo cáo';
  static const String incidentSubmitted = 'Đã gửi báo cáo sự cố';

  // Notifications
  static const String notificationsTitle = 'Thông báo';
  static const String noNotifications = 'Không có thông báo';
  static const String markAllRead = 'Đánh dấu tất cả đã đọc';
  static const String unread = 'Chưa đọc';

  // Chat
  static const String chatTitle = 'Nhắn tin';
  static const String typeMessage = 'Nhập tin nhắn...';
  static const String send = 'Gửi';
  static const String noConversations = 'Chưa có cuộc trò chuyện';
  static const String commanderKV = 'CA KV';
  static const String online = 'Đang trực tuyến';
  static const String offline = 'Ngoại tuyến';

  // Actions
  static const String confirm = 'Xác nhận';
  static const String cancel = 'Hủy';
  static const String save = 'Lưu';
  static const String close = 'Đóng';
  static const String back = 'Quay lại';
  static const String next = 'Tiếp theo';
  static const String submit = 'Gửi';
  static const String retry = 'Thử lại';
  static const String refresh = 'Làm mới';
  static const String loading = 'Đang tải...';
  static const String noData = 'Không có dữ liệu';

  // Errors
  static const String errorGeneral = 'Có lỗi xảy ra. Vui lòng thử lại.';
  static const String errorNetwork = 'Lỗi kết nối mạng. Kiểm tra internet.';
  static const String errorUnauthorized = 'Phiên đăng nhập hết hạn.';
  static const String errorInvalidCredentials =
      'Sai tên đăng nhập hoặc mật khẩu.';
  static const String errorInvalidOtp = 'Mã OTP không hợp lệ hoặc đã hết hạn.';
  static const String errorInvalidRecoveryCode = 'Mã khôi phục không hợp lệ.';
  static const String errorGpsPermission = 'Cần quyền truy cập vị trí.';
  static const String errorGpsDisabled = 'GPS đang tắt. Vui lòng bật GPS.';
  static const String errorFieldRequired = 'Trường này không được để trống.';
  static const String errorBiometricFailed = 'Xác thực sinh trắc học thất bại.';

  // Dates
  static const String today = 'Hôm nay';
  static const String yesterday = 'Hôm qua';
  static const String dateFormat = 'dd/MM/yyyy';
  static const String timeFormat = 'HH:mm';
  static const String datetimeFormat = 'dd/MM/yyyy HH:mm';
}
