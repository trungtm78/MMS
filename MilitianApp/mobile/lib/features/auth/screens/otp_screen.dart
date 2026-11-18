import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/router/routes.dart';
import '../../../core/utils/validators.dart';
import '../../../l10n/l10n.dart';
import '../../../l10n/validation_texts.dart';
import '../auth_texts.dart';
import '../models/login_response.dart';
import '../models/mfa_error.dart';
import '../providers/auth_provider.dart';

/// Second step of an MFA_REQUIRED sign-in: a TOTP code or a recovery code
/// (POST /auth/mfa/verify).
class OtpScreen extends ConsumerStatefulWidget {
  const OtpScreen({
    super.key,
    required this.mfaToken,
    this.methods = MfaMethod.all,
  });

  /// Challenge from POST /auth/login.
  final String mfaToken;

  /// Methods the server accepts for this challenge.
  final List<String> methods;

  @override
  ConsumerState<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends ConsumerState<OtpScreen> {
  final _otpCtrl = TextEditingController();
  final _recoveryCtrl = TextEditingController();

  late final List<String> _methods = _offered(widget.methods);
  late String _method = _methods.first;
  late MfaError? _error =
      widget.mfaToken.trim().isEmpty ? MfaError.missingChallenge() : null;
  ValidationError? _inputError;

  static List<String> _offered(List<String> methods) {
    final known = MfaMethod.all.where(methods.contains).toList();
    return known.isEmpty ? const [MfaMethod.totp] : known;
  }

  static String _label(AppLocalizations l10n, String method) =>
      method == MfaMethod.recoveryCode ? l10n.authMfaMethodRecoveryCode : l10n.authMfaMethodTotp;

  bool get _isRecovery => _method == MfaMethod.recoveryCode;

  bool get _blocked => _error?.restartLogin ?? false;

  Future<void> _verify() async {
    // Recovery codes go out as typed: the server ignores case, spaces and hyphens
    final code = _isRecovery ? _recoveryCtrl.text : _otpCtrl.text.trim();
    final invalid = _isRecovery ? Validators.recoveryCode(code) : Validators.otp(code);
    if (invalid != null) {
      setState(() => _inputError = invalid);
      return;
    }
    setState(() {
      _inputError = null;
      _error = null;
    });

    final attempt = await ref.read(authStateProvider.notifier).verifyMfa(
          mfaToken: widget.mfaToken,
          method: _method,
          code: code,
        );
    if (!mounted) return;
    if (!attempt.success) {
      setState(() => _error = attempt.error);
      return;
    }
    final remaining = attempt.recoveryCodesRemaining;
    if (remaining != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(context.l10n.authOtpRecoveryCodesRemaining(remaining))),
      );
    }
    context.go(Routes.home);
  }

  @override
  void dispose() {
    _otpCtrl.dispose();
    _recoveryCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final loading = ref.watch(authStateProvider.select((s) => s.isLoading));
    final l10n = context.l10n;
    final error = _error;

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.authOtpTitle),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go(Routes.login),
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Icon(Icons.security, size: 64, color: AppColors.secondary),
              const SizedBox(height: 16),
              Text(
                _isRecovery ? l10n.authOtpInstructionRecoveryCode : l10n.authOtpInstructionTotp,
                style: Theme.of(context).textTheme.titleMedium,
                textAlign: TextAlign.center,
              ),
              if (_methods.length > 1) ...[
                const SizedBox(height: 16),
                SegmentedButton<String>(
                  segments: [
                    for (final method in _methods)
                      ButtonSegment(value: method, label: Text(_label(l10n, method))),
                  ],
                  selected: {_method},
                  showSelectedIcon: false,
                  onSelectionChanged: loading
                      ? null
                      : (selection) => setState(() {
                            _method = selection.first;
                            _inputError = null;
                          }),
                ),
              ],
              const SizedBox(height: 24),
              if (_isRecovery)
                TextField(
                  key: const Key('recovery_field'),
                  controller: _recoveryCtrl,
                  enabled: !_blocked,
                  autocorrect: false,
                  enableSuggestions: false,
                  textCapitalization: TextCapitalization.characters,
                  textAlign: TextAlign.center,
                  maxLength: 64,
                  style: const TextStyle(
                    fontSize: 22,
                    letterSpacing: 2,
                    fontFamily: 'monospace',
                    fontWeight: FontWeight.bold,
                  ),
                  decoration: InputDecoration(
                    hintText: l10n.authMfaRecoveryCodeHint,
                    counterText: '',
                    prefixIcon: const Icon(Icons.key),
                    errorText: validationText(l10n, _inputError),
                  ),
                  onSubmitted: (_) => _verify(),
                )
              else
                TextField(
                  key: const Key('otp_field'),
                  controller: _otpCtrl,
                  enabled: !_blocked,
                  keyboardType: TextInputType.number,
                  inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly,
                    LengthLimitingTextInputFormatter(6),
                  ],
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 28,
                    letterSpacing: 8,
                    fontWeight: FontWeight.bold,
                  ),
                  decoration: InputDecoration(
                    hintText: l10n.authMfaOtpHint,
                    errorText: validationText(l10n, _inputError),
                  ),
                  onSubmitted: (_) => _verify(),
                ),
              if (error != null)
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Text(
                    mfaErrorText(l10n, error),
                    key: const Key('mfa_error'),
                    style: const TextStyle(color: AppColors.error),
                    textAlign: TextAlign.center,
                  ),
                ),
              const SizedBox(height: 24),
              ElevatedButton(
                key: const Key('verify_button'),
                onPressed: loading || _blocked ? null : _verify,
                child: loading
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : Text(l10n.authOtpVerifyButton),
              ),
              if (_blocked) ...[
                const SizedBox(height: 12),
                OutlinedButton(
                  key: const Key('restart_login'),
                  onPressed: () => context.go(Routes.login),
                  child: Text(l10n.authMfaRestartLoginButton),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
