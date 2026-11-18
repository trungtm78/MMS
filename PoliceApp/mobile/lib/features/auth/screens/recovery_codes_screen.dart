import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/router/routes.dart';
import '../../../l10n/l10n.dart';
import '../../../shared/errors/app_failure.dart';
import '../../../shared/services/share_service.dart';
import '../providers/auth_provider.dart';

/// Route extra for [RecoveryCodesScreen]
class RecoveryCodesArgs {
  final List<String> codes;

  /// Shown after enrolment during sign-in: acknowledging starts the session
  final bool completesLogin;

  const RecoveryCodesArgs(this.codes, {this.completesLogin = false});
}

/// One-time recovery codes (XXXXX-XXXXX). The server keeps only hashes, so they are shown
/// this once; the user must confirm they saved them before continuing.
class RecoveryCodesScreen extends ConsumerStatefulWidget {
  final List<String> codes;
  final bool completesLogin;

  /// Shown after enabling MFA from a signed-in session: acknowledging starts the replacement
  /// session, because enabling MFA ended the current one
  final bool replacesSession;

  const RecoveryCodesScreen({
    super.key,
    required this.codes,
    this.completesLogin = false,
    this.replacesSession = false,
  });

  @override
  ConsumerState<RecoveryCodesScreen> createState() => _RecoveryCodesScreenState();
}

class _RecoveryCodesScreenState extends ConsumerState<RecoveryCodesScreen> {
  bool _confirmed = false;
  bool _continuing = false;
  bool _sharing = false;

  /// System share sheet (password manager, notes, …); copying stays available when it fails
  Future<void> _share(BuildContext buttonContext) async {
    final l10n = context.l10n;
    final box = buttonContext.findRenderObject() as RenderBox?;
    final origin = box != null && box.hasSize ? box.localToGlobal(Offset.zero) & box.size : null;
    setState(() => _sharing = true);
    try {
      await ref.read(shareTextProvider)(
        widget.codes.join('\n'),
        subject: l10n.authRecoveryCodesShareSubject,
        origin: origin,
      );
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.authRecoveryCodesShareFailed)),
        );
      }
    } finally {
      if (mounted) setState(() => _sharing = false);
    }
  }

  Future<void> _copyAll() async {
    final copied = context.l10n.authRecoveryCodesCopied;
    await Clipboard.setData(ClipboardData(text: widget.codes.join('\n')));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(copied)));
  }

  Future<void> _continue() async {
    if (!_confirmed) return;
    if (!widget.completesLogin && !widget.replacesSession) {
      Navigator.of(context).pop();
      return;
    }
    final l10n = context.l10n;
    setState(() => _continuing = true);
    await ref.read(authStateProvider.notifier).acknowledgeRecoveryCodes();
    if (!mounted) return;
    final auth = ref.read(authStateProvider);
    if (!auth.isAuthenticated) {
      setState(() => _continuing = false);
      final failure = auth.notice ?? auth.error ?? const AppFailure(AppFailure.sessionStartFailed);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(failureText(l10n, failure))));
      return;
    }
    if (widget.replacesSession) {
      Navigator.of(context).pop();
      return;
    }
    context.go(auth.role == 'ca' ? Routes.caHome : Routes.dqtvHome);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final scaffold = Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: Text(l10n.authRecoveryCodesTitle),
        backgroundColor: AppColors.navy,
        foregroundColor: Colors.white,
        automaticallyImplyLeading: false,
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                l10n.authRecoveryCodesSaveInstruction(widget.codes.length),
                style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 4),
              Text(
                l10n.authRecoveryCodesUsageNote,
                style: const TextStyle(fontSize: 13, color: AppColors.textSecondary),
              ),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: AppColors.divider),
                ),
                child: Wrap(
                  spacing: 16,
                  runSpacing: 8,
                  children: [
                    for (final code in widget.codes)
                      SizedBox(
                        width: 140,
                        child: SelectableText(
                          code,
                          style: const TextStyle(fontFamily: 'monospace', fontSize: 15, letterSpacing: 1.2),
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _copyAll,
                      icon: const Icon(Icons.copy),
                      label: Text(l10n.authRecoveryCodesCopyAll),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Builder(
                      builder: (buttonContext) => OutlinedButton.icon(
                        onPressed: _sharing ? null : () => _share(buttonContext),
                        icon: const Icon(Icons.share),
                        label: Text(l10n.authRecoveryCodesShare),
                      ),
                    ),
                  ),
                ],
              ),
              CheckboxListTile(
                value: _confirmed,
                onChanged: (v) => setState(() => _confirmed = v ?? false),
                contentPadding: EdgeInsets.zero,
                controlAffinity: ListTileControlAffinity.leading,
                title: Text(l10n.authRecoveryCodesSavedConfirm, style: const TextStyle(fontSize: 13)),
              ),
              ElevatedButton(
                onPressed: _confirmed && !_continuing ? _continue : null,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.navy,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
                child: Text(l10n.authRecoveryCodesContinue),
              ),
            ],
          ),
        ),
      ),
    );
    // Enabling MFA ended the old session: leaving before acknowledging would lose the only valid one
    return PopScope(canPop: !widget.replacesSession, child: scaffold);
  }
}
