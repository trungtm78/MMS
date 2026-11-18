import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/constants/app_colors.dart';
import '../../../l10n/l10n.dart';
import '../../../shared/errors/app_failure.dart';
import '../../../shared/widgets/app_header.dart';
import '../models/auth_models.dart';
import '../models/mfa_error.dart';
import '../providers/auth_provider.dart';
import '../providers/mfa_provider.dart';
import '../widgets/mfa_enrollment_panel.dart';
import 'change_password_screen.dart';
import 'recovery_codes_screen.dart';

/// Signed-in MFA management (Web/backend/src/auth/mfa/mfa.controller.ts:133-186):
/// status, voluntary enrolment, recovery-code regeneration and disabling.
class SecurityScreen extends ConsumerStatefulWidget {
  const SecurityScreen({super.key});

  @override
  ConsumerState<SecurityScreen> createState() => _SecurityScreenState();
}

class _SecurityScreenState extends ConsumerState<SecurityScreen> {
  MfaStatus? _status;
  MfaEnrollment? _enrollment;
  AppFailure? _loadError;
  bool _loading = true;
  bool _busy = false;

  MfaApi get _api => ref.read(mfaApiProvider);

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _snack(String message, {bool error = true}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: error ? AppColors.error : AppColors.success),
    );
  }

  void _snackFailure(Object e) => _snack(failureText(context.l10n, AppFailure.from(e)));

  Future<void> _load() async {
    setState(() { _loading = true; _loadError = null; });
    try {
      final status = await _api.status();
      if (!mounted) return;
      setState(() { _status = status; _loading = false; });
    } catch (e) {
      if (mounted) setState(() { _loadError = AppFailure.from(e); _loading = false; });
    }
  }

  Future<void> _startSetup() async {
    setState(() => _busy = true);
    try {
      final enrollment = await _api.setup();
      if (mounted) setState(() => _enrollment = enrollment);
    } catch (e) {
      if (mounted) _snackFailure(e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Enabling MFA replaces the session: the new one starts when the codes are acknowledged
  Future<MfaError?> _confirmSetup(String code) async {
    final attempt = await ref
        .read(authStateProvider.notifier)
        .confirmSetup(mfaToken: _enrollment!.mfaToken, code: code);
    if (!mounted) return null;
    if (!attempt.success) return attempt.error ?? const MfaError(AppFailure(AppFailure.unknown));
    setState(() => _enrollment = null);
    _showCodes(attempt.recoveryCodes, replacesSession: true);
    return null;
  }

  Future<void> _showCodes(List<String> codes, {bool replacesSession = false}) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => RecoveryCodesScreen(codes: codes, replacesSession: replacesSession),
      ),
    );
    // A session that could not be replaced has already sent the app to the login screen
    if (mounted && ref.read(authStateProvider).isAuthenticated) await _load();
  }

  Future<void> _regenerate() async {
    final input = await showDialog<({String method, String code})>(
      context: context,
      builder: (context) => _CodeDialog(title: context.l10n.authSecurityRegenerateDialogTitle, allowRecoveryCode: false),
    );
    if (input == null || !mounted) return;
    setState(() => _busy = true);
    try {
      final codes = await _api.regenerateRecoveryCodes(input.code);
      if (mounted) _showCodes(codes);
    } catch (e) {
      if (mounted) _snackFailure(e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _disable() async {
    final input = await showDialog<({String method, String code})>(
      context: context,
      builder: (context) => _CodeDialog(title: context.l10n.authSecurityDisableDialogTitle, allowRecoveryCode: true),
    );
    if (input == null || !mounted) return;
    final done = context.l10n.authSecurityMfaDisabledDone;
    setState(() => _busy = true);
    // Disabling MFA ends every session; AuthNotifier stores the replacement the answer carries (a session
    // the app cannot use sends it to the login screen)
    final error = await ref.read(authStateProvider.notifier).disableMfa(method: input.method, code: input.code);
    if (!mounted) return;
    setState(() => _busy = false);
    if (error != null) {
      _snack(failureText(context.l10n, error.failure));
      return;
    }
    _snack(done, error: false);
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final status = _status;
    final loadError = _loadError;
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppHeader(title: l10n.authSecurityTitle, showBack: true),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.navy))
          : loadError != null || status == null
              ? Center(
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text(loadError == null ? l10n.authSecurityLoadFailed : failureText(l10n, loadError),
                          textAlign: TextAlign.center, style: const TextStyle(color: AppColors.error)),
                    ),
                    ElevatedButton(onPressed: _load, child: Text(l10n.commonRetry)),
                  ]),
                )
              : ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    Card(
                      child: ListTile(
                        leading: Icon(
                          status.enabled ? Icons.verified_user : Icons.gpp_maybe_outlined,
                          color: status.enabled ? AppColors.success : AppColors.warning,
                        ),
                        title: Text(status.enabled ? l10n.authSecurityMfaEnabled : l10n.authSecurityMfaDisabled,
                            style: const TextStyle(fontWeight: FontWeight.w700)),
                        subtitle: status.enabled && status.enrolledAt != null
                            ? Text(l10n.authSecurityEnabledSince(
                                DateFormat('dd/MM/yyyy').format(status.enrolledAt!.toLocal())))
                            : null,
                      ),
                    ),
                    if (status.required)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        child: Text(l10n.authSecurityMfaRequiredByRole,
                            style: const TextStyle(color: AppColors.textSecondary)),
                      ),
                    const SizedBox(height: 8),
                    if (!status.enabled && _enrollment == null)
                      SizedBox(
                        height: 48,
                        child: ElevatedButton(
                          onPressed: _busy ? null : _startSetup,
                          style: ElevatedButton.styleFrom(backgroundColor: AppColors.navy, foregroundColor: Colors.white),
                          child: Text(l10n.authSecurityEnableMfa, style: const TextStyle(fontWeight: FontWeight.w700)),
                        ),
                      ),
                    if (_enrollment != null)
                      MfaEnrollmentPanel(
                        enrollment: _enrollment!,
                        onConfirm: _confirmSetup,
                        onRestart: () => setState(() => _enrollment = null),
                        restartLabel: l10n.authSecurityRestartSetup,
                      ),
                    if (status.enabled) ...[
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        child: Text(l10n.authSecurityRecoveryCodesRemaining(status.recoveryCodesRemaining),
                            style: const TextStyle(fontWeight: FontWeight.w600)),
                      ),
                      OutlinedButton(
                        onPressed: _busy ? null : _regenerate,
                        child: Text(l10n.authSecurityRegenerateCodes),
                      ),
                      const SizedBox(height: 8),
                      OutlinedButton(
                        onPressed: _busy || status.required ? null : _disable,
                        style: OutlinedButton.styleFrom(foregroundColor: AppColors.error),
                        child: Text(l10n.authSecurityDisableMfa),
                      ),
                    ],
                    const SizedBox(height: 16),
                    Card(
                      child: ListTile(
                        leading: const Icon(Icons.password, color: AppColors.navy),
                        title: Text(l10n.authSecurityChangePassword),
                        subtitle: Text(l10n.authSecurityChangePasswordHint),
                        trailing: const Icon(Icons.chevron_right),
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute<void>(builder: (_) => const ChangePasswordScreen()),
                        ),
                      ),
                    ),
                  ],
                ),
    );
  }
}

/// Asks for a TOTP code (or a recovery code when allowed); pops (method, code).
class _CodeDialog extends StatefulWidget {
  final String title;
  final bool allowRecoveryCode;

  const _CodeDialog({required this.title, required this.allowRecoveryCode});

  @override
  State<_CodeDialog> createState() => _CodeDialogState();
}

class _CodeDialogState extends State<_CodeDialog> {
  final _codeCtrl = TextEditingController();
  String _method = mfaMethodTotp;
  AppFailure? _error;

  @override
  void dispose() {
    _codeCtrl.dispose();
    super.dispose();
  }

  void _submit() {
    if (_method == mfaMethodTotp) {
      final code = _codeCtrl.text.trim();
      if (code.length != 6 || int.tryParse(code) == null) {
        setState(() => _error = const AppFailure(AppFailure.otpFormat));
        return;
      }
      Navigator.of(context).pop((method: _method, code: code));
      return;
    }
    // A recovery code is sent as typed; the server normalizes it
    if (_codeCtrl.text.trim().isEmpty) {
      setState(() => _error = const AppFailure(AppFailure.recoveryCodeRequired));
      return;
    }
    Navigator.of(context).pop((method: _method, code: _codeCtrl.text));
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final totp = _method == mfaMethodTotp;
    final error = _error;
    return AlertDialog(
      title: Text(widget.title),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (widget.allowRecoveryCode) ...[
            SegmentedButton<String>(
              segments: [
                ButtonSegment(value: mfaMethodTotp, label: Text(l10n.authOtpMethodTotp)),
                ButtonSegment(value: mfaMethodRecoveryCode, label: Text(l10n.authOtpMethodRecoveryCode)),
              ],
              selected: {_method},
              onSelectionChanged: (s) => setState(() { _method = s.first; _error = null; }),
            ),
            const SizedBox(height: 12),
          ],
          TextField(
            key: const Key('mfa_dialog_code'),
            controller: _codeCtrl,
            keyboardType: totp ? TextInputType.number : TextInputType.text,
            maxLength: totp ? 6 : 64,
            decoration: InputDecoration(
              labelText: totp ? l10n.authCodeDialogTotpLabel : l10n.authCodeDialogRecoveryLabel,
              errorText: error == null ? null : failureText(l10n, error),
              counterText: '',
            ),
          ),
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: Text(l10n.commonCancel)),
        ElevatedButton(onPressed: _submit, child: Text(l10n.commonConfirm)),
      ],
    );
  }
}
