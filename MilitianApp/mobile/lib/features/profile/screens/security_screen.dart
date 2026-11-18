import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/utils/validators.dart';
import '../../../l10n/l10n.dart';
import '../../../l10n/validation_texts.dart';
import '../../auth/auth_texts.dart';
import '../../auth/models/login_response.dart';
import '../../auth/models/mfa_enrollment.dart';
import '../../auth/models/mfa_error.dart';
import '../../auth/models/mfa_status.dart';
import '../../auth/providers/auth_provider.dart';
import '../../auth/repositories/auth_repository.dart';
import '../../auth/screens/recovery_codes_screen.dart';
import '../../auth/widgets/mfa_enrollment_panel.dart';

/// Date pattern of the enrolment date (a format, not wording).
const _datePattern = 'dd/MM/yyyy';

/// Second factor of the signed-in user: status, enable, recovery codes, disable
/// (Web/backend/src/auth/mfa/mfa.controller.ts management routes).
class SecurityScreen extends ConsumerStatefulWidget {
  const SecurityScreen({super.key});

  @override
  ConsumerState<SecurityScreen> createState() => _SecurityScreenState();
}

class _SecurityScreenState extends ConsumerState<SecurityScreen> {
  MfaStatus? _status;
  MfaError? _loadError;
  bool _loading = true;

  /// Enrolment in progress (POST /auth/mfa/setup answered).
  MfaEnrollment? _enrollment;
  bool _starting = false;

  /// Failure of the last action, shown above the current view.
  MfaError? _actionError;

  AuthRepository get _repo => ref.read(authRepositoryProvider);

  @override
  void initState() {
    super.initState();
    _loadStatus();
  }

  Future<void> _loadStatus() async {
    try {
      final status = await _repo.mfaStatus();
      if (!mounted) return;
      setState(() {
        _status = status;
        _loadError = null;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loadError = MfaError.from(e);
        _loading = false;
      });
    }
  }

  void _reload() {
    setState(() {
      _loading = true;
      _loadError = null;
      _enrollment = null;
    });
    _loadStatus();
  }

  Future<void> _startSetup() async {
    setState(() {
      _starting = true;
      _actionError = null;
    });
    try {
      final enrollment = await _repo.setupMfa();
      if (!mounted) return;
      setState(() {
        _enrollment = enrollment;
        _starting = false;
      });
    } catch (e) {
      if (!mounted) return;
      final error = MfaError.from(e);
      setState(() {
        _actionError = error;
        _starting = false;
      });
      // Enabled elsewhere in the meantime: show the current state
      if (error.code == MfaError.alreadyEnabled) _reload();
    }
  }

  /// Bearer POST /auth/mfa/confirm. Enabling MFA ends every earlier session, this one too; the
  /// replacement is held by AuthNotifier until the new recovery codes are acknowledged
  /// (Web/backend/src/auth/mfa/mfa.service.ts:338-361).
  Future<MfaError?> _confirmSetup(String code) async {
    final enrollment = _enrollment;
    if (enrollment == null) return null;
    final attempt = await ref
        .read(authStateProvider.notifier)
        .confirmMfaSetup(mfaToken: enrollment.mfaToken, code: code);
    if (!mounted) return null;
    final error = attempt.error;
    if (error != null) {
      if (error.code != MfaError.recoveryCodesMissing) return error;
      // MFA is on and the new session stored, but no codes came back: show the state and let the
      // user create new codes
      setState(() => _actionError = error);
      _reload();
      return null;
    }
    setState(() => _actionError = null);
    await _showCodes(attempt.recoveryCodes, replacesSession: true);
    if (mounted) _reload();
    return null;
  }

  void _cancelSetup() => _reload();

  Future<void> _showCodes(List<String> codes, {bool replacesSession = false}) =>
      Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (context) => RecoveryCodesScreen(codes: codes, replacesSession: replacesSession),
        ),
      );

  Future<void> _regenerate() async {
    final l10n = context.l10n;
    List<String>? codes;
    final done = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (context) => _MfaCodeDialog(
        title: l10n.profileSecurityRegenerateDialogTitle,
        description: l10n.profileSecurityRegenerateDialogDescription,
        confirmLabel: l10n.profileSecurityRegenerateDialogConfirm,
        methods: const [MfaMethod.totp],
        onSubmit: (method, code) async {
          try {
            codes = await _repo.regenerateRecoveryCodes(code);
            return null;
          } catch (e) {
            return MfaError.from(e);
          }
        },
      ),
    );
    final newCodes = codes;
    if (done != true || newCodes == null || !mounted) return;
    setState(() => _actionError = null);
    await _showCodes(newCodes);
    if (mounted) _reload();
  }

  Future<void> _disable() async {
    final l10n = context.l10n;
    final done = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (context) => _MfaCodeDialog(
        title: l10n.profileSecurityDisableDialogTitle,
        description: l10n.profileSecurityDisableDialogDescription,
        confirmLabel: l10n.profileSecurityDisableDialogConfirm,
        methods: MfaMethod.all,
        onSubmit: (method, code) async {
          try {
            await _repo.disableMfa(method: method, code: code);
            return null;
          } catch (e) {
            return MfaError.from(e);
          }
        },
      ),
    );
    if (done != true || !mounted) return;
    setState(() => _actionError = null);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(l10n.profileSecurityDisabledSnack)),
    );
    _reload();
  }

  @override
  Widget build(BuildContext context) {
    final status = _status;
    final loadError = _loadError;
    final enrollment = _enrollment;
    final actionError = _actionError;
    final l10n = context.l10n;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.profileSecurityTitle)),
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.security, color: AppColors.secondary),
                        const SizedBox(width: 8),
                        Text(
                          l10n.profileSecurityHeading,
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w700,
                            color: AppColors.textPrimary,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      l10n.profileSecurityIntro,
                      style: const TextStyle(fontSize: 13, color: AppColors.textSecondary),
                    ),
                    const SizedBox(height: 16),
                    if (actionError != null) ...[
                      Text(
                        mfaErrorText(l10n, actionError),
                        key: const Key('mfa_action_error'),
                        style: const TextStyle(color: AppColors.error),
                      ),
                      const SizedBox(height: 12),
                    ],
                    if (loadError != null)
                      ..._loadErrorSection(l10n, loadError)
                    else if (enrollment != null)
                      ..._enrollmentSection(l10n, enrollment)
                    else if (status != null && status.enabled)
                      ..._enabledSection(l10n, status)
                    else if (status != null)
                      ..._disabledSection(l10n, status),
                  ],
                ),
              ),
      ),
    );
  }

  List<Widget> _loadErrorSection(AppLocalizations l10n, MfaError error) => [
        Text(
          mfaErrorText(l10n, error),
          key: const Key('mfa_status_error'),
          style: const TextStyle(color: AppColors.error),
        ),
        const SizedBox(height: 12),
        ElevatedButton(
          key: const Key('reload_status'),
          onPressed: _reload,
          child: Text(l10n.profileSecurityRetryButton),
        ),
      ];

  List<Widget> _disabledSection(AppLocalizations l10n, MfaStatus status) => [
        _StatusLine(
          icon: Icons.shield_outlined,
          color: AppColors.warning,
          text: l10n.profileSecurityStatusDisabled,
        ),
        if (status.required) ...[
          const SizedBox(height: 8),
          const _RequiredNote(),
        ],
        const SizedBox(height: 16),
        ElevatedButton(
          key: const Key('enable_mfa'),
          onPressed: _starting ? null : _startSetup,
          child: _starting
              ? const SizedBox(
                  height: 20,
                  width: 20,
                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                )
              : Text(l10n.profileSecurityEnableButton),
        ),
      ];

  List<Widget> _enrollmentSection(AppLocalizations l10n, MfaEnrollment enrollment) => [
        MfaEnrollmentPanel(
          key: ValueKey(enrollment.mfaToken),
          enrollment: enrollment,
          onConfirm: _confirmSetup,
          onRestart: _cancelSetup,
          restartLabel: l10n.profileSecurityRestartSetupButton,
        ),
        const SizedBox(height: 8),
        TextButton(
          key: const Key('cancel_setup'),
          onPressed: _cancelSetup,
          child: Text(l10n.commonCancelButton),
        ),
      ];

  List<Widget> _enabledSection(AppLocalizations l10n, MfaStatus status) {
    final enrolledAt = status.enrolledAt;
    return [
      _StatusLine(
        icon: Icons.verified_user,
        color: AppColors.success,
        text: l10n.profileSecurityStatusEnabled,
      ),
      if (enrolledAt != null) ...[
        const SizedBox(height: 8),
        Text(
          l10n.profileSecurityEnabledOn(DateFormat(_datePattern).format(enrolledAt.toLocal())),
          style: const TextStyle(color: AppColors.textSecondary),
        ),
      ],
      const SizedBox(height: 4),
      Text(
        l10n.profileSecurityRecoveryCodesRemaining(status.recoveryCodesRemaining),
        style: const TextStyle(color: AppColors.textSecondary),
      ),
      if (status.recoveryCodesRemaining <= 2) ...[
        const SizedBox(height: 4),
        Text(
          l10n.profileSecurityRecoveryCodesLow,
          style: const TextStyle(color: AppColors.warning),
        ),
      ],
      if (status.required) ...[
        const SizedBox(height: 8),
        const _RequiredNote(),
      ],
      const SizedBox(height: 16),
      OutlinedButton.icon(
        key: const Key('regenerate_codes'),
        onPressed: _regenerate,
        icon: const Icon(Icons.refresh),
        label: Text(l10n.profileSecurityRegenerateButton),
      ),
      const SizedBox(height: 8),
      OutlinedButton.icon(
        key: const Key('disable_mfa'),
        onPressed: status.required ? null : _disable,
        icon: const Icon(Icons.lock_open),
        label: Text(l10n.profileSecurityDisableButton),
      ),
    ];
  }
}

class _StatusLine extends StatelessWidget {
  const _StatusLine({required this.icon, required this.color, required this.text});
  final IconData icon;
  final Color color;
  final String text;

  @override
  Widget build(BuildContext context) => Row(
        children: [
          Icon(icon, color: color),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(fontWeight: FontWeight.w600, color: AppColors.textPrimary),
            ),
          ),
        ],
      );
}

class _RequiredNote extends StatelessWidget {
  const _RequiredNote();

  @override
  Widget build(BuildContext context) => Text(
        context.l10n.profileSecurityRequiredNote,
        style: const TextStyle(color: AppColors.textSecondary, fontStyle: FontStyle.italic),
      );
}

/// Asks for a TOTP code (or, when offered, a recovery code) and submits it; closes with true
/// once [onSubmit] succeeds, otherwise shows its error.
class _MfaCodeDialog extends StatefulWidget {
  const _MfaCodeDialog({
    required this.title,
    required this.description,
    required this.confirmLabel,
    required this.methods,
    required this.onSubmit,
  });

  final String title;
  final String description;
  final String confirmLabel;
  final List<String> methods;
  final Future<MfaError?> Function(String method, String code) onSubmit;

  @override
  State<_MfaCodeDialog> createState() => _MfaCodeDialogState();
}

class _MfaCodeDialogState extends State<_MfaCodeDialog> {
  final _codeCtrl = TextEditingController();
  late String _method = widget.methods.first;
  MfaError? _error;
  ValidationError? _inputError;
  bool _busy = false;

  bool get _isRecovery => _method == MfaMethod.recoveryCode;

  Future<void> _submit() async {
    // Recovery codes go out as typed: the server ignores case, spaces and hyphens
    final code = _isRecovery ? _codeCtrl.text : _codeCtrl.text.trim();
    final invalid = _isRecovery ? Validators.recoveryCode(code) : Validators.otp(code);
    if (invalid != null) {
      setState(() => _inputError = invalid);
      return;
    }
    setState(() {
      _busy = true;
      _inputError = null;
      _error = null;
    });
    final error = await widget.onSubmit(_method, code);
    if (!mounted) return;
    if (error == null) {
      Navigator.of(context).pop(true);
      return;
    }
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
    final l10n = context.l10n;
    final error = _error;
    return AlertDialog(
      title: Text(widget.title),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(widget.description),
            if (widget.methods.length > 1) ...[
              const SizedBox(height: 12),
              SegmentedButton<String>(
                segments: [
                  for (final method in widget.methods)
                    ButtonSegment(
                      value: method,
                      label: Text(method == MfaMethod.recoveryCode
                          ? l10n.authMfaMethodRecoveryCode
                          : l10n.authMfaMethodTotp),
                    ),
                ],
                selected: {_method},
                showSelectedIcon: false,
                onSelectionChanged: _busy
                    ? null
                    : (selection) => setState(() {
                          _method = selection.first;
                          _codeCtrl.clear();
                          _inputError = null;
                        }),
              ),
            ],
            const SizedBox(height: 12),
            TextField(
              key: const Key('mfa_dialog_code_field'),
              controller: _codeCtrl,
              autofocus: true,
              enabled: !_busy,
              autocorrect: false,
              enableSuggestions: false,
              keyboardType: _isRecovery ? TextInputType.text : TextInputType.number,
              textCapitalization:
                  _isRecovery ? TextCapitalization.characters : TextCapitalization.none,
              inputFormatters: _isRecovery
                  ? [LengthLimitingTextInputFormatter(64)]
                  : [
                      FilteringTextInputFormatter.digitsOnly,
                      LengthLimitingTextInputFormatter(6),
                    ],
              decoration: InputDecoration(
                hintText: _isRecovery ? l10n.authMfaRecoveryCodeHint : l10n.authMfaOtpHint,
                errorText: validationText(l10n, _inputError),
              ),
              onSubmitted: (_) => _submit(),
            ),
            if (error != null) ...[
              const SizedBox(height: 8),
              Text(
                mfaErrorText(l10n, error),
                key: const Key('mfa_error'),
                style: const TextStyle(color: AppColors.error),
              ),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: _busy ? null : () => Navigator.of(context).pop(false),
          child: Text(l10n.commonCancelButton),
        ),
        FilledButton(
          key: const Key('mfa_dialog_confirm'),
          onPressed: _busy ? null : _submit,
          child: _busy
              ? const SizedBox(
                  height: 18,
                  width: 18,
                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                )
              : Text(widget.confirmLabel),
        ),
      ],
    );
  }
}
