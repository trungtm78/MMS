import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_strings.dart';
import '../../../core/router/routes.dart';
import '../providers/auth_provider.dart';

class MfaSetupScreen extends ConsumerStatefulWidget {
  /// tempToken issued by backend after password login when requiresMfaSetup=true.
  /// Empty string when called from Settings (user already authenticated).
  final String tempToken;

  const MfaSetupScreen({super.key, required this.tempToken});

  @override
  ConsumerState<MfaSetupScreen> createState() => _MfaSetupScreenState();
}

class _MfaSetupScreenState extends ConsumerState<MfaSetupScreen> {
  bool _loading = true;
  String? _qrUri;
  String? _secret;
  List<String> _recoveryCodes = [];
  final _otpCtrl = TextEditingController();
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadSetup();
  }

  Future<void> _loadSetup() async {
    try {
      final repo = ref.read(authRepositoryProvider);
      // Pass tempToken only when doing first-time setup (non-empty)
      final response = await repo.setupMfa(
        tempToken: widget.tempToken.isEmpty ? null : widget.tempToken,
      );
      if (mounted) {
        setState(() {
          _qrUri = response.qrCodeUri;
          _secret = response.secret;
          _recoveryCodes = response.recoveryCodes;
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString();
          _loading = false;
        });
      }
    }
  }

  Future<void> _confirm() async {
    if (_otpCtrl.text.length != 6) {
      setState(() => _error = AppStrings.errorInvalidOtp);
      return;
    }
    setState(() => _error = null);
    try {
      final repo = ref.read(authRepositoryProvider);
      await repo.confirmMfaSetup(
        tempToken: widget.tempToken.isEmpty ? '' : widget.tempToken,
        otpCode: _otpCtrl.text,
      );
      if (mounted) {
        context.pushReplacement(Routes.recoveryCodes, extra: _recoveryCodes);
      }
    } catch (e) {
      setState(() => _error = e.toString());
    }
  }

  @override
  void dispose() {
    _otpCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text(AppStrings.setup2FA)),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : SafeArea(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      AppStrings.scan2FAQr,
                      style: Theme.of(context).textTheme.bodyMedium,
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 24),
                    // QR code
                    if (_qrUri != null)
                      Center(
                        child: Container(
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                              color: AppColors.secondary,
                              width: 2,
                            ),
                          ),
                          child: QrImageView(
                            data: _qrUri!,
                            version: QrVersions.auto,
                            size: 200,
                          ),
                        ),
                      ),
                    if (_error != null && _qrUri == null)
                      Padding(
                        padding: const EdgeInsets.only(top: 16),
                        child: Text(
                          _error!,
                          style: const TextStyle(color: AppColors.error),
                          textAlign: TextAlign.center,
                        ),
                      ),
                    const SizedBox(height: 16),
                    // Manual key
                    if (_secret != null)
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: AppColors.background,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: AppColors.divider),
                        ),
                        child: Column(
                          children: [
                            Text(
                              AppStrings.manualEntryKey,
                              style: const TextStyle(
                                fontSize: 12,
                                color: AppColors.textSecondary,
                              ),
                            ),
                            const SizedBox(height: 4),
                            SelectableText(
                              _secret!,
                              style: const TextStyle(
                                fontFamily: 'monospace',
                                fontWeight: FontWeight.bold,
                                letterSpacing: 2,
                              ),
                              textAlign: TextAlign.center,
                            ),
                          ],
                        ),
                      ),
                    const SizedBox(height: 24),
                    TextFormField(
                      controller: _otpCtrl,
                      keyboardType: TextInputType.number,
                      maxLength: 6,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontSize: 24,
                        letterSpacing: 8,
                        fontWeight: FontWeight.bold,
                      ),
                      decoration: const InputDecoration(
                        labelText: 'Nhập mã OTP để xác nhận',
                        counterText: '',
                      ),
                    ),
                    if (_error != null && _qrUri != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Text(
                          _error!,
                          style: const TextStyle(color: AppColors.error),
                        ),
                      ),
                    const SizedBox(height: 16),
                    ElevatedButton(
                      onPressed: _qrUri == null ? null : _confirm,
                      child: const Text(AppStrings.verify),
                    ),
                  ],
                ),
              ),
            ),
    );
  }
}
