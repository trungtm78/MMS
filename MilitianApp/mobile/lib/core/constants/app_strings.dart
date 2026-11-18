/// Legacy display strings, kept only for screens that have not moved to lib/l10n/app_vi.arb yet.
/// New text goes into the ARB (context.l10n); when a screen migrates, delete the constants it no
/// longer uses. Date patterns are formats, not wording.
class AppStrings {
  AppStrings._();

  // Home
  static const String welcome = 'Chào mừng';
  static const String quickActions = 'Thao tác nhanh';
  static const String pendingTasks = 'Nhiệm vụ chờ';
  static const String attendance = 'Chuyên cần';
  static const String present = 'Có mặt';
  static const String absent = 'Vắng mặt';
  static const String late = 'Trễ';

  // Check-in
  static const String checkin = 'Điểm danh';
  static const String checkIn = 'Điểm danh vào';
  static const String checkOut = 'Điểm danh ra';
  static const String locating = 'Đang xác định vị trí...';
  static const String locationOk = 'Vị trí hợp lệ';
  static const String locationFar = 'Vị trí quá xa đơn vị';
  static const String checkinSuccess = 'Điểm danh thành công';
  static const String checkoutSuccess = 'Điểm danh ra thành công';
  static const String gpsThreshold = '≤ 15m so với đơn vị';

  // Tasks
  static const String myTasks = 'Nhiệm vụ của tôi';
  static const String taskDetail = 'Chi tiết nhiệm vụ';
  static const String taskDescription = 'Mô tả';
  static const String updateStatus = 'Cập nhật trạng thái';
  static const String submitReport = 'Nộp báo cáo';
  static const String reportContent = 'Nội dung báo cáo';
  static const String filterPending = 'Chờ';
  static const String filterInProgress = 'Đang làm';
  static const String filterCompleted = 'Hoàn thành';
  static const String filterOverdue = 'Quá hạn';

  // Task statuses
  static const String statusInProgress = 'Đang thực hiện';
  static const String statusCompleted = 'Hoàn thành';
  static const String statusOverdue = 'Quá hạn';
  static const String statusCancelled = 'Đã hủy';

  // Leave
  static const String leaveRequest = 'Đăng ký nghỉ phép';

  // Actions
  static const String retry = 'Thử lại';
  static const String loading = 'Đang tải...';
  static const String noData = 'Không có dữ liệu';

  // Errors
  static const String errorGeneral = 'Có lỗi xảy ra. Vui lòng thử lại.';
  static const String errorGpsPermission = 'Cần quyền truy cập vị trí.';
  static const String errorGpsDisabled = 'GPS đang tắt. Vui lòng bật GPS.';

  // Date patterns (formats, not wording)
  static const String datetimeFormat = 'dd/MM/yyyy HH:mm';
}
