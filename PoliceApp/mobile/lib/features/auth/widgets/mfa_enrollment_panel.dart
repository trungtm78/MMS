import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../../core/constants/app_colors.dart';
import '../../../l10n/l10n.dart';
import '../../../shared/errors/app_failure.dart';
import '../../../shared/services/external_link_service.dart';
import '../models/auth_models.dart';
import '../models/mfa_error.dart';

/// Authenticator enrolment step shared by sign-in (MFA_SETUP_REQUIRED) and the security
/// screen: QR code of the otpauth URI, the secret, a link to the authenticator app and the
/// first code.
class MfaEnrollmentPanel extends ConsumerStatefulWidget {
  final MfaEnrollment enrollment;

  /// Checks the first code; returns the error to show, or null once it succeeded
  final Future<MfaError?> Function(String code) onConfirm;

  /// Called from the button shown when the enrolment cannot continue
  final VoidCallback? onRestart;

  /// Label of that button; "sign in again" when null
  final String? restartLabel;

  const MfaEnrollmentPanel({
    super.key,
    required this.enrollment,
    required this.onConfirm,
    this.onRestart,
    this.restartLabel,
  });

  @override
  ConsumerState<MfaEnrollmentPanel> createState() => _MfaEnrollmentPanelState();
}

class _MfaEnrollmentPanelState extends ConsumerState<MfaEnrollmentPanel> {
  final _codeCtrl = TextEditingController();
  bool _submitting = false;
  MfaError? _error;

  @override
  void dispose() {
    _codeCtrl.dispose();
    super.dispose();
  }

  void _snack(String message) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _copySecret() async {
    final copied = context.l10n.authEnrollSecretCopied;
    await Clipboard.setData(ClipboardData(text: widget.enrollment.secret));
    if (mounted) _snack(copied);
  }

  Future<void> _openAuthenticator() async {
    final failed = context.l10n.authEnrollOpenAuthenticatorFailed;
    final open = ref.read(openExternalUrlProvider);
    final uri = Uri.tryParse(widget.enrollment.otpauthUri);
    var opened = false;
    if (uri != null) {
      try {
        opened = await open(uri);
      } catch (_) {
        // No authenticator app is installed or the platform refused the link
        opened = false;
      }
    }
    if (!opened && mounted) _snack(failed);
  }

  Future<void> _confirm() async {
    final code = _codeCtrl.text.trim();
    if (code.length != 6 || int.tryParse(code) == null) {
      setState(() => _error = const MfaError(AppFailure(AppFailure.otpFormat)));
      return;
    }
    setState(() { _submitting = true; _error = null; });
    final error = await widget.onConfirm(code);
    if (!mounted) return;
    setState(() { _error = error; _submitting = false; });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final enrollment = widget.enrollment;
    final error = _error;
    final mustRestart = error?.restartLogin == true;
    final expiresAt = enrollment.expiresAt;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(l10n.authEnrollStepScan, style: const TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 12),
            Center(
              child: Container(
                color: Colors.white,
                padding: const EdgeInsets.all(8),
                child: QrImageView(data: enrollment.otpauthUri, size: 180, backgroundColor: Colors.white),
              ),
            ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              key: const Key('open_authenticator'),
              onPressed: _openAuthenticator,
              icon: const Icon(Icons.open_in_new),
              label: Text(l10n.authEnrollOpenAuthenticator),
            ),
            const SizedBox(height: 12),
            Text(l10n.authEnrollSecretLabel, style: const TextStyle(color: AppColors.textSecondary)),
            Row(children: [
              Expanded(
                child: SelectableText(
                  enrollment.secret,
                  style: const TextStyle(fontFamily: 'monospace', fontSize: 15, letterSpacing: 1.5),
                ),
              ),
              IconButton(
                tooltip: l10n.authEnrollCopySecretTooltip,
                onPressed: _copySecret,
                icon: const Icon(Icons.copy),
              ),
            ]),
            if (expiresAt != null)
              Text(
                l10n.authEnrollExpiresAt(DateFormat('HH:mm').format(expiresAt.toLocal())),
                style: const TextStyle(fontSize: 12, color: AppColors.textMuted),
              ),
            const SizedBox(height: 16),
            Text(l10n.authEnrollStepCode, style: const TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            TextField(
              key: const Key('enroll_code_field'),
              controller: _codeCtrl,
              keyboardType: TextInputType.number,
              maxLength: 6,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700, letterSpacing: 6),
              decoration: InputDecoration(counterText: '', hintText: l10n.authOtpCodeHint),
            ),
            if (error != null) ...[
              const SizedBox(height: 8),
              Text(failureText(l10n, error.failure),
                  key: const Key('mfa_error'),
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: AppColors.error)),
            ],
            const SizedBox(height: 16),
            SizedBox(
              height: 48,
              child: ElevatedButton(
                onPressed: _submitting || mustRestart ? null : _confirm,
                style: ElevatedButton.styleFrom(backgroundColor: AppColors.navy, foregroundColor: Colors.white),
                child: _submitting
                    ? const SizedBox(
                        width: 20, height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : Text(l10n.commonConfirm, style: const TextStyle(fontWeight: FontWeight.w700)),
              ),
            ),
            if (mustRestart && widget.onRestart != null) ...[
              const SizedBox(height: 8),
              OutlinedButton(
                key: const Key('restart_login'),
                onPressed: widget.onRestart,
                child: Text(widget.restartLabel ?? l10n.authRestartLogin),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
