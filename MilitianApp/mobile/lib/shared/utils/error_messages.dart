import 'package:dio/dio.dart';

/// Maps any exception (Dio, generic, location plugin) to a user-friendly
/// Vietnamese message suitable for SnackBar / dialog.
String userFriendlyError(Object e) {
  if (e is DioException) {
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.sendTimeout:
        return 'Mạng chậm hoặc mất kết nối. Vui lòng thử lại.';
      case DioExceptionType.connectionError:
        return 'Không kết nối được máy chủ. Kiểm tra mạng của bạn.';
      case DioExceptionType.badCertificate:
        return 'Lỗi chứng chỉ máy chủ. Liên hệ quản trị.';
      case DioExceptionType.cancel:
        return 'Yêu cầu đã bị huỷ.';
      case DioExceptionType.badResponse:
        final code = e.response?.statusCode;
        if (code == 401) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
        if (code == 403) return 'Bạn không có quyền thực hiện thao tác này.';
        if (code == 404) return 'Không tìm thấy dữ liệu.';
        if (code == 422) return 'Dữ liệu không hợp lệ.';
        if (code != null && code >= 500) return 'Máy chủ đang gặp sự cố. Thử lại sau.';
        return 'Có lỗi xảy ra ($code).';
      case DioExceptionType.unknown:
        return 'Có lỗi không xác định. Vui lòng thử lại.';
    }
  }
  final s = e.toString().toLowerCase();
  if (s.contains('permission') && s.contains('location')) {
    return 'Ứng dụng chưa được cấp quyền vị trí. Vào Cài đặt để cấp quyền.';
  }
  if (s.contains('location service') || s.contains('disabled')) {
    return 'Dịch vụ vị trí đang tắt. Hãy bật GPS trên thiết bị.';
  }
  return 'Có lỗi xảy ra. Vui lòng thử lại.';
}
