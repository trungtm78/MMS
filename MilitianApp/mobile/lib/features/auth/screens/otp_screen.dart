import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_strings.dart';
import '../../../core/router/routes.dart';
import '../../../core/utils/validators.dart';
import '../providers/auth_provider.dart';

class OtpScreen extends ConsumerStatefulWidget {
  final String tempToken;

  const OtpScreen({super.key, required this.tempToken});

  @override
  ConsumerState<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends ConsumerState<OtpScreen> {
  final _otpCtrl = TextEditingController();
  final _recoveryCtrl = TextEditingController();
  bool _showRecovery = false;

  Future<void> _verify() async {
    final notifier = ref.read(authStateProvider.notifier);
    if (_showRecovery) {
      if (_recoveryCtrl.text.trim().isEmpty) return;
      await notifier.verifyRecoveryCode(
        tempToken: widget.tempToken,
        recoveryCode: _recoveryCtrl.text.trim(),
      );
    } else {
      if (_otpCtrl.text.length != 6) return;
      await notifier.verifyMfa(
        tempToken: widget.tempToken,
        otpCode: _otpCtrl.text,
      );
    }
    // GoRouter redirect handles navigation after auth
  }

  @override
  void dispose() {
    _otpCtrl.dispose();
    _recoveryCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authStateProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text(AppStrings.twoFactorAuth),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go(Routes.login),
        ),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Icon(Icons.security, size: 64, color: AppColors.secondary),
              const SizedBox(height: 24),
              Text(
                _showRecovery
                    ? AppStrings.enterRecoveryCode
                    : AppStrings.enterOtp,
                style: Theme.of(context).textTheme.titleMedium,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),
              if (!_showRecovery)
                TextFormField(
                  key: const Key('otp_field'),
                  controller: _otpCtrl,
                  keyboardType: TextInputType.number,
                  maxLength: 6,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 28,
                    letterSpacing: 8,
                    fontWeight: FontWeight.bold,
                  ),
                  decoration: const InputDecoration(
                    hintText: AppStrings.otpHint,
                    counterText: '',
                  ),
                  validator: Validators.otp,
                  onFieldSubmitted: (_) => _verify(),
                )
              else
                TextFormField(
                  key: const Key('recovery_field'),
                  controller: _recoveryCtrl,
                  decoration: const InputDecoration(
                    labelText: AppStrings.recoveryCodeHint,
                    prefixIcon: Icon(Icons.key),
                  ),
                  onFieldSubmitted: (_) => _verify(),
                ),
              if (authState.error != null)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    authState.error!,
                    style: const TextStyle(color: AppColors.error),
                    textAlign: TextAlign.center,
                  ),
                ),
              const SizedBox(height: 24),
              ElevatedButton(
                key: const Key('verify_button'),
                onPressed: authState.isLoading ? null : _verify,
                child: authState.isLoading
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Text(AppStrings.verify),
              ),
              const SizedBox(height: 12),
              TextButton(
                onPressed: () => setState(() => _showRecovery = !_showRecovery),
                child: Text(
                  _showRecovery ? 'Dùng mã OTP' : AppStrings.useRecoveryCode,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
