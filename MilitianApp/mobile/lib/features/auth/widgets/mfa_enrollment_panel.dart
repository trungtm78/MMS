import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/utils/validators.dart';
import '../../../l10n/l10n.dart';
import '../../../l10n/validation_texts.dart';
import '../auth_texts.dart';
import '../models/mfa_enrollment.dart';
import '../models/mfa_error.dart';

/// Opens [uri] in another app; false when nothing handles it.
typedef UriLauncher = Future<bool> Function(Uri uri);

Future<bool> _launchExternally(Uri uri) async {
  try {
    return await launchUrl(uri, mode: LaunchMode.externalApplication);
  } catch (e) {
    debugPrint('[MFA] no app opened $uri: $e');
    return false;
  }
}

/// TOTP enrolment: QR code, secret, a shortcut to the authenticator app and the first code.
/// Shared by the sign-in enrolment screen and the security screen.
class MfaEnrollmentPanel extends StatefulWidget {
  const MfaEnrollmentPanel({
    super.key,
    required this.enrollment,
    required this.onConfirm,
    this.launcher = _launchExternally,
    this.onRestart,
    this.restartLabel,
  });

  final MfaEnrollment enrollment;

  /// Confirms the 6-digit code; returns the error to show, or null on success.
  final Future<MfaError?> Function(String code) onConfirm;

  final UriLauncher launcher;

  /// Offered with [restartLabel] once an error means this enrolment cannot continue.
  final VoidCallback? onRestart;

  /// Label of the restart action; the sign-in restart label when null.
  final String? restartLabel;

  @override
  State<MfaEnrollmentPanel> createState() => _MfaEnrollmentPanelState();
}

class _MfaEnrollmentPanelState extends State<MfaEnrollmentPanel> {
  final _codeCtrl = TextEditingController();
  bool _busy = false;
  MfaError? _error;
  ValidationError? _inputError;

  bool get _blocked => _error?.restartLogin ?? false;

  Future<void> _openAuthenticator() async {
    final uri = Uri.tryParse(widget.enrollment.otpauthUri);
    final opened = uri != null && await widget.launcher(uri);
    if (opened || !mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(context.l10n.authMfaPanelLaunchFailed),
    ));
  }

  Future<void> _copySecret() async {
    await Clipboard.setData(ClipboardData(text: widget.enrollment.secret));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(context.l10n.authMfaPanelSecretCopied)),
    );
  }

  Future<void> _confirm() async {
    final code = _codeCtrl.text.trim();
    final invalid = Validators.otp(code);
    if (invalid != null) {
      setState(() => _inputError = invalid);
      return;
    }
    setState(() {
      _busy = true;
      _inputError = null;
      _error = null;
    });
    final error = await widget.onConfirm(code);
    if (!mounted) return;
    setState(() {
      _busy = false;
      _error = error;
    });
  }

  @override
  void dispose() {
    _codeCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final enrollment = widget.enrollment;
    final expiresAt = enrollment.expiresAt;
    final onRestart = widget.onRestart;
    final error = _error;
    final l10n = context.l10n;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _Step(l10n.authMfaPanelStepScan),
        const SizedBox(height: 12),
        Center(
          child: Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.secondary, width: 2),
            ),
            child: QrImageView(
              data: enrollment.otpauthUri,
              version: QrVersions.auto,
              size: 200,
              backgroundColor: Colors.white,
              semanticsLabel: l10n.authMfaPanelQrSemantics,
            ),
          ),
        ),
        const SizedBox(height: 12),
        OutlinedButton.icon(
          key: const Key('open_authenticator'),
          onPressed: _openAuthenticator,
          icon: const Icon(Icons.open_in_new),
          label: Text(l10n.authMfaPanelOpenAuthenticator),
        ),
        const SizedBox(height: 16),
        Text(
          l10n.authMfaPanelSecretIntro,
          style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
        ),
        const SizedBox(height: 4),
        Container(
          padding: const EdgeInsets.only(left: 12),
          decoration: BoxDecoration(
            color: AppColors.background,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: AppColors.divider),
          ),
          child: Row(
            children: [
              Expanded(
                child: SelectableText(
                  enrollment.secret,
                  key: const Key('mfa_secret'),
                  style: const TextStyle(
                    fontFamily: 'monospace',
                    fontWeight: FontWeight.bold,
                    letterSpacing: 2,
                  ),
                ),
              ),
              IconButton(
                key: const Key('copy_secret'),
                tooltip: l10n.authMfaPanelCopySecretTooltip,
                icon: const Icon(Icons.copy, color: AppColors.textSecondary),
                onPressed: _copySecret,
              ),
            ],
          ),
        ),
        if (expiresAt != null) ...[
          const SizedBox(height: 8),
          Text(
            // HH:mm is a time pattern, not wording
            l10n.authMfaPanelExpiresAt(DateFormat('HH:mm').format(expiresAt.toLocal())),
            style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
          ),
        ],
        const SizedBox(height: 20),
        _Step(l10n.authMfaPanelStepCode),
        const SizedBox(height: 8),
        TextField(
          key: const Key('enroll_code_field'),
          controller: _codeCtrl,
          enabled: !_blocked,
          keyboardType: TextInputType.number,
          inputFormatters: [
            FilteringTextInputFormatter.digitsOnly,
            LengthLimitingTextInputFormatter(6),
          ],
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontSize: 24,
            letterSpacing: 8,
            fontWeight: FontWeight.bold,
          ),
          decoration: InputDecoration(
            hintText: l10n.authMfaOtpHint,
            errorText: validationText(l10n, _inputError),
          ),
          onSubmitted: (_) => _confirm(),
        ),
        if (error != null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              mfaErrorText(l10n, error),
              key: const Key('mfa_error'),
              style: const TextStyle(color: AppColors.error),
              textAlign: TextAlign.center,
            ),
          ),
        const SizedBox(height: 16),
        ElevatedButton(
          key: const Key('enroll_confirm_button'),
          onPressed: _busy || _blocked ? null : _confirm,
          child: _busy
              ? const SizedBox(
                  height: 20,
                  width: 20,
                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                )
              : Text(l10n.authMfaPanelConfirmButton),
        ),
        if (_blocked && onRestart != null) ...[
          const SizedBox(height: 12),
          OutlinedButton(
            key: const Key('restart_login'),
            onPressed: onRestart,
            child: Text(widget.restartLabel ?? l10n.authMfaRestartLoginButton),
          ),
        ],
      ],
    );
  }
}

class _Step extends StatelessWidget {
  const _Step(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Text(
        text,
        style: const TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w600,
          color: AppColors.textPrimary,
        ),
      );
}
