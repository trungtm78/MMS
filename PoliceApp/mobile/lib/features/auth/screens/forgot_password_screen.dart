import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/app_colors.dart';
import '../providers/auth_provider.dart';
import '../../../core/constants/api_constants.dart';

enum _ForgotStep { username, otp, newPassword, success }

class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  ConsumerState<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  _ForgotStep _step = _ForgotStep.username;

  final _usernameCtrl   = TextEditingController();
  final _newPassCtrl    = TextEditingController();
  final _confirmCtrl    = TextEditingController();
  final _otpCtrls       = List.generate(6, (_) => TextEditingController());
  final _otpFocusNodes  = List.generate(6, (_) => FocusNode());

  bool _loading = false;
  String _error = '';
  bool _obscureNew = true;
  bool _obscureConfirm = true;

  @override
  void dispose() {
    _usernameCtrl.dispose();
    _newPassCtrl.dispose();
    _confirmCtrl.dispose();
    for (final c in _otpCtrls) c.dispose();
    for (final f in _otpFocusNodes) f.dispose();
    super.dispose();
  }

  Future<void> _submitUsername() async {
    if (_usernameCtrl.text.trim().isEmpty) {
      setState(() => _error = 'Vui lòng nhập tên đăng nhập');
      return;
    }
    setState(() { _loading = true; _error = ''; });
    try {
      final dio = ref.read(dioProvider);
      await dio.post('${ApiConstants.baseUrl}/auth/forgot-password', data: {
        'username': _usernameCtrl.text.trim(),
      });
      if (!mounted) return;
      setState(() { _step = _ForgotStep.otp; _loading = false; });
    } catch (e) {
      if (!mounted) return;
      setState(() { _error = 'Tên đăng nhập không tồn tại'; _loading = false; });
    }
  }

  Future<void> _submitOtp() async {
    final code = _otpCtrls.map((c) => c.text).join();
    if (code.length < 6) {
      setState(() => _error = 'Vui lòng nhập đủ 6 số OTP');
      return;
    }
    setState(() { _loading = true; _error = ''; });
    try {
      final dio = ref.read(dioProvider);
      await dio.post('${ApiConstants.baseUrl}/auth/verify-otp', data: {
        'username': _usernameCtrl.text.trim(),
        'otp': code,
      });
      if (!mounted) return;
      setState(() { _step = _ForgotStep.newPassword; _loading = false; });
    } catch (e) {
      if (!mounted) return;
      setState(() { _error = 'Mã OTP không đúng hoặc đã hết hạn'; _loading = false; });
    }
  }

  Future<void> _submitNewPassword() async {
    final pw = _newPassCtrl.text;
    final cpw = _confirmCtrl.text;
    if (pw.length < 6) {
      setState(() => _error = 'Mật khẩu phải có ít nhất 6 ký tự');
      return;
    }
    if (pw != cpw) {
      setState(() => _error = 'Mật khẩu xác nhận không khớp');
      return;
    }
    setState(() { _loading = true; _error = ''; });
    try {
      final dio = ref.read(dioProvider);
      await dio.post('${ApiConstants.baseUrl}/auth/reset-password', data: {
        'username': _usernameCtrl.text.trim(),
        'otp': _otpCtrls.map((c) => c.text).join(),
        'newPassword': pw,
      });
      if (!mounted) return;
      setState(() { _step = _ForgotStep.success; _loading = false; });
    } catch (e) {
      if (!mounted) return;
      setState(() { _error = 'Không thể đặt lại mật khẩu. Vui lòng thử lại.'; _loading = false; });
    }
  }

  void _onOtpChanged(int index, String value) {
    if (value.length > 1) {
      _otpCtrls[index].text = value[0];
      _otpCtrls[index].selection = const TextSelection.collapsed(offset: 1);
    }
    if (value.isNotEmpty && index < 5) {
      _otpFocusNodes[index + 1].requestFocus();
    }
  }

  void _onOtpBackspace(int index, String value) {
    if (value.isEmpty && index > 0) {
      _otpFocusNodes[index - 1].requestFocus();
    }
  }

  Widget _buildErrorBanner() {
    if (_error.isEmpty) return const SizedBox.shrink();
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFFEE2E2),
        border: Border.all(color: AppColors.primary, width: 2),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          const Icon(Icons.error_outline, color: AppColors.primary, size: 20),
          const SizedBox(width: 8),
          Expanded(child: Text(_error, style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w600, fontSize: 13))),
        ],
      ),
    );
  }

  Widget _buildUsernameStep() {
    return Column(
      children: [
        const CircleAvatar(radius: 32, backgroundColor: AppColors.primary, child: Icon(Icons.mail_outline, color: Colors.white, size: 32)),
        const SizedBox(height: 12),
        const Text('Quên mật khẩu?', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: AppColors.primary)),
        const SizedBox(height: 4),
        const Text('Nhập tên đăng nhập để nhận mã OTP', style: TextStyle(fontSize: 13, color: Color(0xFF64748B))),
        const SizedBox(height: 24),
        _buildErrorBanner(),
        const Align(alignment: Alignment.centerLeft, child: Text('Tên đăng nhập', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14))),
        const SizedBox(height: 6),
        TextField(
          controller: _usernameCtrl,
          decoration: InputDecoration(
            hintText: 'dqtv001',
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppColors.primary, width: 2)),
            focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppColors.primary, width: 2)),
          ),
        ),
        const SizedBox(height: 20),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            onPressed: _loading ? null : _submitUsername,
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.primary, padding: const EdgeInsets.symmetric(vertical: 14)),
            child: _loading
                ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                : const Text('Gửi mã OTP', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: Colors.white)),
          ),
        ),
      ],
    );
  }

  Widget _buildOtpStep() {
    return Column(
      children: [
        const CircleAvatar(radius: 32, backgroundColor: AppColors.primary, child: Icon(Icons.key, color: Colors.white, size: 32)),
        const SizedBox(height: 12),
        const Text('Nhập mã OTP', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: AppColors.primary)),
        const SizedBox(height: 4),
        Text.rich(
          TextSpan(children: [
            const TextSpan(text: 'Mã OTP đã gửi đến số điện thoại của ', style: TextStyle(fontSize: 13, color: Color(0xFF64748B))),
            TextSpan(text: _usernameCtrl.text.trim(), style: const TextStyle(fontSize: 13, color: AppColors.primary, fontWeight: FontWeight.bold)),
          ]),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 24),
        _buildErrorBanner(),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: List.generate(6, (i) => Container(
            width: 44,
            height: 52,
            margin: const EdgeInsets.symmetric(horizontal: 4),
            child: TextField(
              controller: _otpCtrls[i],
              focusNode: _otpFocusNodes[i],
              keyboardType: TextInputType.number,
              textAlign: TextAlign.center,
              maxLength: 1,
              style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: AppColors.primary),
              decoration: InputDecoration(
                counterText: '',
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppColors.primary, width: 2)),
                focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppColors.primary, width: 2)),
              ),
              onChanged: (v) => _onOtpChanged(i, v),
              onSubmitted: (_) => _onOtpBackspace(i, _otpCtrls[i].text),
            ),
          )),
        ),
        const SizedBox(height: 12),
        TextButton(
          onPressed: _loading ? null : () => setState(() { for (final c in _otpCtrls) c.clear(); }),
          child: const Text('Gửi lại mã OTP', style: TextStyle(color: AppColors.primary, fontWeight: FontWeight.bold)),
        ),
        const SizedBox(height: 8),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            onPressed: _loading ? null : _submitOtp,
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.primary, padding: const EdgeInsets.symmetric(vertical: 14)),
            child: _loading
                ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                : const Text('Xác nhận', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: Colors.white)),
          ),
        ),
      ],
    );
  }

  Widget _buildNewPasswordStep() {
    return Column(
      children: [
        const CircleAvatar(radius: 32, backgroundColor: AppColors.primary, child: Icon(Icons.lock_reset, color: Colors.white, size: 32)),
        const SizedBox(height: 12),
        const Text('Đặt mật khẩu mới', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: AppColors.primary)),
        const SizedBox(height: 4),
        const Text('Tạo mật khẩu mới cho tài khoản', style: TextStyle(fontSize: 13, color: Color(0xFF64748B))),
        const SizedBox(height: 24),
        _buildErrorBanner(),
        const Align(alignment: Alignment.centerLeft, child: Text('Mật khẩu mới', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14))),
        const SizedBox(height: 6),
        TextField(
          controller: _newPassCtrl,
          obscureText: _obscureNew,
          decoration: InputDecoration(
            hintText: '••••••',
            helperText: 'Tối thiểu 6 ký tự',
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppColors.primary, width: 2)),
            focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppColors.primary, width: 2)),
            suffixIcon: IconButton(icon: Icon(_obscureNew ? Icons.visibility_off : Icons.visibility), onPressed: () => setState(() => _obscureNew = !_obscureNew)),
          ),
        ),
        const SizedBox(height: 12),
        const Align(alignment: Alignment.centerLeft, child: Text('Xác nhận mật khẩu', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14))),
        const SizedBox(height: 6),
        TextField(
          controller: _confirmCtrl,
          obscureText: _obscureConfirm,
          decoration: InputDecoration(
            hintText: '••••••',
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppColors.primary, width: 2)),
            focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppColors.primary, width: 2)),
            suffixIcon: IconButton(icon: Icon(_obscureConfirm ? Icons.visibility_off : Icons.visibility), onPressed: () => setState(() => _obscureConfirm = !_obscureConfirm)),
          ),
        ),
        const SizedBox(height: 20),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            onPressed: _loading ? null : _submitNewPassword,
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.primary, padding: const EdgeInsets.symmetric(vertical: 14)),
            child: _loading
                ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                : const Text('Đặt lại mật khẩu', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: Colors.white)),
          ),
        ),
      ],
    );
  }

  Widget _buildSuccessStep() {
    return Column(
      children: [
        const CircleAvatar(radius: 40, backgroundColor: AppColors.tertiary, child: Icon(Icons.check_circle_outline, color: Colors.white, size: 48)),
        const SizedBox(height: 16),
        const Text('Thành công!', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: AppColors.primary)),
        const SizedBox(height: 8),
        const Text('Mật khẩu đã được đặt lại thành công', textAlign: TextAlign.center, style: TextStyle(fontSize: 14, color: Color(0xFF64748B))),
        const SizedBox(height: 32),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            onPressed: () => context.pop(),
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.primary, padding: const EdgeInsets.symmetric(vertical: 14)),
            child: const Text('Quay lại đăng nhập', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: Colors.white)),
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFFFBBF24), Color(0xFFFDE047), Color(0xFFFEF08A)],
          ),
        ),
        child: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              children: [
                // Logo
                const Column(
                  children: [
                    CircleAvatar(
                      radius: 40,
                      backgroundColor: Colors.white,
                      child: Icon(Icons.shield, color: AppColors.primary, size: 48),
                    ),
                    SizedBox(height: 8),
                    Text('Bảo vệ ANTT', style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800, color: AppColors.primary)),
                    Text('Khôi phục mật khẩu', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Color(0xFF0F172A))),
                  ],
                ),
                const SizedBox(height: 24),

                // Card
                Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [Color(0xFFFEF9C3), Color(0xFFFEF3C7)],
                    ),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: AppColors.primary, width: 3),
                    boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.15), blurRadius: 20, offset: const Offset(0, 8))],
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      // Back button
                      if (_step != _ForgotStep.success)
                        Align(
                          alignment: Alignment.centerLeft,
                          child: TextButton.icon(
                            onPressed: () {
                              if (_step == _ForgotStep.username) {
                                context.pop();
                              } else {
                                setState(() {
                                  _error = '';
                                  _step = _ForgotStep.values[_step.index - 1];
                                });
                              }
                            },
                            icon: const Icon(Icons.arrow_back, color: AppColors.primary),
                            label: Text(
                              _step == _ForgotStep.username ? 'Quay lại đăng nhập' : 'Quay lại',
                              style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.bold),
                            ),
                          ),
                        ),

                      if (_step == _ForgotStep.username) _buildUsernameStep(),
                      if (_step == _ForgotStep.otp)      _buildOtpStep(),
                      if (_step == _ForgotStep.newPassword) _buildNewPasswordStep(),
                      if (_step == _ForgotStep.success)  _buildSuccessStep(),
                    ],
                  ),
                ),

                const SizedBox(height: 16),
                const Text('Phiên bản 1.0.0 • © 2024 Công An Khu Vực', style: TextStyle(fontSize: 11, color: Color(0xFF0F172A), fontWeight: FontWeight.w600)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
