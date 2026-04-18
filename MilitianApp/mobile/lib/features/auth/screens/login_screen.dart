import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_strings.dart';
import '../../../core/router/routes.dart';
import '../../../core/utils/validators.dart';
import '../../../shared/services/biometric_service.dart';
import '../providers/auth_provider.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});
  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _usernameCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  bool _obscurePassword = true;
  bool _biometricAvailable = false;

  @override
  void initState() {
    super.initState();
    _checkBiometric();
  }

  Future<void> _checkBiometric() async {
    final storage = ref.read(secureStorageProvider);
    final enabled = await storage.isBiometricEnabled();
    final bio = BiometricService();
    final available = await bio.isAvailable();
    if (mounted) setState(() => _biometricAvailable = enabled && available);
  }

  Future<void> _login() async {
    if (!_formKey.currentState!.validate()) return;
    final notifier = ref.read(authStateProvider.notifier);
    final result = await notifier.login(
      _usernameCtrl.text.trim(),
      _passwordCtrl.text,
    );
    if (!mounted) return;
    if (result != null) {
      if (result.requiresMfaSetup) {
        context.push(Routes.mfaSetup, extra: result.tempToken ?? '');
      } else if (result.requiresMfa) {
        context.push(Routes.otpVerify, extra: result.tempToken ?? '');
      }
    }
  }

  Future<void> _biometricLogin() async {
    final bio = BiometricService();
    final ok = await bio.authenticate('Xác thực để đăng nhập');
    if (!ok || !mounted) return;
    final storage = ref.read(secureStorageProvider);
    final token = await storage.getAccessToken();
    if (token != null) ref.read(authStateProvider.notifier).refreshAuthState();
  }

  @override
  void dispose() {
    _usernameCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authStateProvider);
    final error = authState.error;
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(gradient: AppColors.headerGradient),
        child: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Column(
              children: [
                const SizedBox(height: 40),
                _buildLogoSection(),
                const SizedBox(height: 28),
                _buildLoginCard(authState, error),
                const SizedBox(height: 24),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildLogoSection() {
    return Column(
      children: [
        // Logo chính thức DQTV với drop shadow
        Container(
          width: 160,
          height: 160,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.25),
                blurRadius: 24,
                spreadRadius: 4,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: ClipOval(
            child: Image.asset(
              'assets/images/logo.png',
              fit: BoxFit.contain,
              errorBuilder: (_, __, ___) => Container(
                color: AppColors.primary,
                child: const Icon(Icons.shield, color: Colors.white, size: 80),
              ),
            ),
          ),
        ),
        const SizedBox(height: 16),
        const Text(
          'HỆ THỐNG QUẢN LÝ\nDÂN QUÂN TỰ VỆ',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w900,
            color: AppColors.primary,
            letterSpacing: 1.5,
            height: 1.3,
          ),
        ),
        const SizedBox(height: 6),
        const Text(
          'UBND Phường Phú Định - TP. Hồ Chí Minh',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 12,
            color: AppColors.textSecondary,
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    );
  }

  Widget _buildLoginCard(AuthState authState, String? error) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        gradient: AppColors.cardYellowGradient,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: AppColors.primary, width: 3),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.15),
            blurRadius: 20,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'ĐĂNG NHẬP',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w900,
                color: AppColors.primary,
                letterSpacing: 1.0,
              ),
            ),
            const SizedBox(height: 20),
            if (error != null)
              Container(
                margin: const EdgeInsets.only(bottom: 14),
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: BoxDecoration(
                  color: AppColors.errorBorder,
                  border: Border.all(color: AppColors.primary, width: 2),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.error_outline, color: AppColors.primary, size: 18),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        error,
                        style: const TextStyle(
                          color: AppColors.primary,
                          fontSize: 13,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            // Username
            TextFormField(
              key: const Key('username_field'),
              controller: _usernameCtrl,
              decoration: _inputDeco(
                label: AppStrings.username,
                hint: AppStrings.enterUsername,
                icon: Icons.person_outline,
              ),
              textInputAction: TextInputAction.next,
              validator: Validators.username,
            ),
            const SizedBox(height: 14),
            // Password
            TextFormField(
              key: const Key('password_field'),
              controller: _passwordCtrl,
              obscureText: _obscurePassword,
              decoration: _inputDeco(
                label: AppStrings.password,
                hint: AppStrings.enterPassword,
                icon: Icons.lock_outline,
                suffix: IconButton(
                  icon: Icon(
                    _obscurePassword ? Icons.visibility_off : Icons.visibility,
                    color: AppColors.primary,
                  ),
                  onPressed: () =>
                      setState(() => _obscurePassword = !_obscurePassword),
                ),
              ),
              textInputAction: TextInputAction.done,
              onFieldSubmitted: (_) => _login(),
              validator: Validators.password,
            ),
            const SizedBox(height: 20),
            // GREEN submit button (per Refs — #15803D)
            Container(
              height: 50,
              decoration: BoxDecoration(
                gradient: AppColors.greenGradient,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AppColors.darkGreen, width: 1.5),
                boxShadow: [
                  BoxShadow(
                    color: AppColors.tertiary.withOpacity(0.35),
                    blurRadius: 8,
                    offset: const Offset(0, 3),
                  ),
                ],
              ),
              child: ElevatedButton(
                key: const Key('login_button'),
                onPressed: authState.isLoading ? null : _login,
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.transparent,
                  shadowColor: Colors.transparent,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10),
                  ),
                  minimumSize: const Size(double.infinity, 50),
                ),
                child: authState.isLoading
                    ? const SizedBox(
                        height: 22,
                        width: 22,
                        child: CircularProgressIndicator(
                          strokeWidth: 2.5,
                          color: Colors.white,
                        ),
                      )
                    : const Text(
                        'ĐĂNG NHẬP',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 1.0,
                        ),
                      ),
              ),
            ),
            if (_biometricAvailable) ...[
              const SizedBox(height: 12),
              OutlinedButton.icon(
                key: const Key('biometric_button'),
                onPressed: _biometricLogin,
                icon: const Icon(Icons.fingerprint, color: AppColors.navy),
                label: const Text(
                  AppStrings.loginWithBiometric,
                  style: TextStyle(color: AppColors.navy),
                ),
                style: OutlinedButton.styleFrom(
                  side: const BorderSide(color: AppColors.navy, width: 1.5),
                  minimumSize: const Size(double.infinity, 46),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10),
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  InputDecoration _inputDeco({
    required String label,
    required String hint,
    required IconData icon,
    Widget? suffix,
  }) {
    const primBorder = OutlineInputBorder(
      borderRadius: BorderRadius.all(Radius.circular(10)),
      borderSide: BorderSide(color: AppColors.primary, width: 2),
    );
    return InputDecoration(
      labelText: label,
      hintText: hint,
      prefixIcon: Icon(icon, color: AppColors.primary),
      suffixIcon: suffix,
      filled: true,
      fillColor: Colors.white,
      labelStyle: const TextStyle(color: AppColors.primary),
      border: primBorder,
      enabledBorder: primBorder,
      focusedBorder: const OutlineInputBorder(
        borderRadius: BorderRadius.all(Radius.circular(10)),
        borderSide: BorderSide(color: AppColors.primary, width: 2.5),
      ),
      errorBorder: const OutlineInputBorder(
        borderRadius: BorderRadius.all(Radius.circular(10)),
        borderSide: BorderSide(color: AppColors.error),
      ),
    );
  }
}
