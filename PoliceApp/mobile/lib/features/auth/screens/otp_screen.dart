import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/router/routes.dart';
import '../../../l10n/l10n.dart';
import '../../../shared/errors/app_failure.dart';
import '../../../shared/widgets/app_header.dart';
import '../models/auth_models.dart';
import '../models/mfa_error.dart';
import '../providers/auth_provider.dart';

/// Second step of an MFA_REQUIRED sign-in: POST /auth/mfa/verify with a TOTP code or a
/// recovery code.
class OtpScreen extends ConsumerStatefulWidget {
  final String mfaToken;

  /// Methods offered by the challenge
  final List<String> methods;

  const OtpScreen({
    super.key,
    required this.mfaToken,
    this.methods = const [mfaMethodTotp, mfaMethodRecoveryCode],
  });

  @override
  ConsumerState<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends ConsumerState<OtpScreen> {
  final _otpCtrl = TextEditingController();
  final _recoveryCtrl = TextEditingController();
  late String _method;
  MfaError? _error;
  bool _submitting = false;

  bool get _offersRecoveryCode => widget.methods.contains(mfaMethodRecoveryCode);

  @override
  void initState() {
    super.initState();
    _method = widget.methods.contains(mfaMethodTotp) || widget.methods.isEmpty
        ? mfaMethodTotp
        : widget.methods.first;
  }

  @override
  void dispose() {
    _otpCtrl.dispose();
    _recoveryCtrl.dispose();
    super.dispose();
  }

  Future<void> _verify() async {
    final String code;
    if (_method == mfaMethodTotp) {
      code = _otpCtrl.text.trim();
      if (code.length != 6 || int.tryParse(code) == null) {
        setState(() => _error = const MfaError(AppFailure(AppFailure.otpFormat)));
        return;
      }
    } else {
      // Sent as typed: the server ignores case, spaces and the hyphen
      code = _recoveryCtrl.text;
      if (code.trim().isEmpty) {
        setState(() => _error = const MfaError(AppFailure(AppFailure.recoveryCodeRequired)));
        return;
      }
    }

    final l10n = context.l10n;
    setState(() { _submitting = true; _error = null; });
    final attempt = await ref
        .read(authStateProvider.notifier)
        .verifyMfa(mfaToken: widget.mfaToken, method: _method, code: code);
    if (!mounted) return;

    if (attempt.success) {
      final remaining = attempt.recoveryCodesRemaining;
      if (remaining != null) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.authOtpRecoveryCodesRemaining(remaining))),
        );
      }
      final role = ref.read(authStateProvider).role;
      context.go(role == 'ca' ? Routes.caHome : Routes.dqtvHome);
      return;
    }
    setState(() { _error = attempt.error; _submitting = false; });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final error = _error;
    final mustRestart = error?.restartLogin == true;

    return Scaffold(
      appBar: AppHeader(title: l10n.authOtpTitle, showBack: false),
      backgroundColor: AppColors.background,
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (_offersRecoveryCode && widget.methods.contains(mfaMethodTotp)) ...[
              SegmentedButton<String>(
                segments: [
                  ButtonSegment(
                      value: mfaMethodTotp, label: Text(l10n.authOtpMethodTotp), icon: const Icon(Icons.pin_outlined)),
                  ButtonSegment(
                      value: mfaMethodRecoveryCode,
                      label: Text(l10n.authOtpMethodRecoveryCode),
                      icon: const Icon(Icons.key)),
                ],
                selected: {_method},
                onSelectionChanged: (s) => setState(() { _method = s.first; _error = null; }),
              ),
              const SizedBox(height: 16),
            ],
            Text(
              _method == mfaMethodTotp ? l10n.authOtpInstructionTotp : l10n.authOtpInstructionRecoveryCode,
              style: const TextStyle(fontSize: 15, color: AppColors.textSecondary),
            ),
            const SizedBox(height: 16),
            if (_method == mfaMethodTotp)
              TextFormField(
                key: const Key('otp_field'),
                controller: _otpCtrl,
                keyboardType: TextInputType.number,
                maxLength: 6,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700, letterSpacing: 8),
                decoration: InputDecoration(counterText: '', hintText: l10n.authOtpCodeHint),
                onFieldSubmitted: (_) => _verify(),
              )
            else
              TextFormField(
                key: const Key('recovery_field'),
                controller: _recoveryCtrl,
                textCapitalization: TextCapitalization.characters,
                autocorrect: false,
                enableSuggestions: false,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w600, letterSpacing: 2),
                decoration: InputDecoration(hintText: l10n.authRecoveryCodeHint),
                onFieldSubmitted: (_) => _verify(),
              ),
            if (error != null) ...[
              const SizedBox(height: 12),
              Text(
                failureText(l10n, error.failure),
                key: const Key('mfa_error'),
                textAlign: TextAlign.center,
                style: const TextStyle(color: AppColors.error),
              ),
            ],
            const SizedBox(height: 24),
            SizedBox(
              height: 48,
              child: ElevatedButton(
                onPressed: _submitting || mustRestart ? null : _verify,
                style: ElevatedButton.styleFrom(backgroundColor: AppColors.navy, foregroundColor: Colors.white),
                child: _submitting
                    ? const SizedBox(
                        width: 20, height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : Text(l10n.commonConfirm, style: const TextStyle(fontWeight: FontWeight.w700)),
              ),
            ),
            if (mustRestart) ...[
              const SizedBox(height: 12),
              OutlinedButton(
                key: const Key('restart_login'),
                onPressed: () => context.go(Routes.login),
                child: Text(l10n.authRestartLogin),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
