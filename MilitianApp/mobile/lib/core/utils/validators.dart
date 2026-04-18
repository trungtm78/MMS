import '../constants/app_strings.dart';

class Validators {
  Validators._();

  static String? required(String? value) {
    if (value == null || value.trim().isEmpty) {
      return AppStrings.errorFieldRequired;
    }
    return null;
  }

  static String? username(String? value) {
    if (value == null || value.trim().isEmpty) {
      return AppStrings.errorFieldRequired;
    }
    if (value.trim().length < 3) {
      return 'Tên đăng nhập tối thiểu 3 ký tự.';
    }
    return null;
  }

  static String? password(String? value) {
    if (value == null || value.isEmpty) {
      return AppStrings.errorFieldRequired;
    }
    if (value.length < 6) {
      return 'Mật khẩu tối thiểu 6 ký tự.';
    }
    return null;
  }

  static String? otp(String? value) {
    if (value == null || value.isEmpty) {
      return AppStrings.errorFieldRequired;
    }
    if (!RegExp(r'^\d{6}$').hasMatch(value)) {
      return 'Mã OTP phải gồm đúng 6 chữ số.';
    }
    return null;
  }

  static String? recoveryCode(String? value) {
    if (value == null || value.trim().isEmpty) {
      return AppStrings.errorFieldRequired;
    }
    return null;
  }

  static String? phone(String? value) {
    if (value == null || value.trim().isEmpty) return null; // optional
    if (!RegExp(r'^(0|\+84)\d{9,10}$').hasMatch(value.trim())) {
      return 'Số điện thoại không hợp lệ.';
    }
    return null;
  }
}
