import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/router/routes.dart';
import '../../../l10n/l10n.dart';
import '../auth_texts.dart';
import '../providers/auth_provider.dart';

/// Route extra for [Routes.recoveryCodes].
class RecoveryCodesArgs {
  const RecoveryCodesArgs(this.codes, {this.completesLogin = false});

  final List<String> codes;

  /// The codes come from enrolment during sign-in: continuing starts the session.
  final bool completesLogin;
}

/// New recovery codes, shown once (POST /auth/mfa/enroll/confirm, /auth/mfa/confirm,
/// /auth/mfa/recovery-codes/regenerate). The user must confirm they saved them.
class RecoveryCodesScreen extends ConsumerStatefulWidget {
  const RecoveryCodesScreen({
    super.key,
    required this.codes,
    this.completesLogin = false,
    this.replacesSession = false,
  });

  final List<String> codes;
  final bool completesLogin;

  /// The codes come from enabling MFA while signed in: that ended the earlier session, and
  /// continuing stores the replacement held by AuthNotifier.
  final bool replacesSession;

  @override
  ConsumerState<RecoveryCodesScreen> createState() => _RecoveryCodesScreenState();
}

class _RecoveryCodesScreenState extends ConsumerState<RecoveryCodesScreen> {
  bool _saved = false;
  bool _continuing = false;

  String get _plainText => widget.codes.join('\n');

  /// A session waits for this acknowledgement: only the continue button may leave the screen.
  bool get _holdsSession => widget.completesLogin || widget.replacesSession;

  void _notify(String message) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _copyAll() async {
    await Clipboard.setData(ClipboardData(text: _plainText));
    if (mounted) _notify(context.l10n.authRecoveryCodesCopied);
  }

  Future<void> _share() async {
    final l10n = context.l10n;
    try {
      await Share.share(
        l10n.authRecoveryCodesShareText(_plainText),
        subject: l10n.authRecoveryCodesShareSubject,
      );
    } catch (e) {
      debugPrint('[RecoveryCodes] share failed: $e');
      if (mounted) _notify(l10n.authRecoveryCodesShareFailed);
    }
  }

  Future<void> _continue() async {
    if (!_holdsSession) {
      Navigator.of(context).pop();
      return;
    }
    setState(() => _continuing = true);
    await ref.read(authStateProvider.notifier).acknowledgeRecoveryCodes();
    if (!mounted) return;
    final auth = ref.read(authStateProvider);
    if (auth.isAuthenticated) {
      if (widget.completesLogin) {
        context.go(Routes.home);
      } else {
        Navigator.of(context).pop();
      }
      return;
    }
    setState(() => _continuing = false);
    final error = auth.error;
    final l10n = context.l10n;
    _notify(error == null ? l10n.authRecoveryCodesCompleteFailed : authErrorText(l10n, error));
    context.go(Routes.login);
  }

  @override
  Widget build(BuildContext context) {
    final codes = widget.codes;
    final l10n = context.l10n;
    return PopScope(
      canPop: !_holdsSession && _saved,
      child: Scaffold(
        appBar: AppBar(
          title: Text(l10n.authRecoveryCodesTitle),
          automaticallyImplyLeading: false,
        ),
        body: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppColors.warning.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: AppColors.warning),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(Icons.warning_amber_rounded, color: AppColors.warning),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          l10n.authRecoveryCodesWarning,
                          style: const TextStyle(color: AppColors.textPrimary, fontSize: 13),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 20),
                for (var i = 0; i < codes.length; i += 2)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Row(
                      children: [
                        Expanded(child: _CodeTile(codes[i])),
                        const SizedBox(width: 8),
                        Expanded(
                          child: i + 1 < codes.length ? _CodeTile(codes[i + 1]) : const SizedBox(),
                        ),
                      ],
                    ),
                  ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        key: const Key('copy_all_codes'),
                        icon: const Icon(Icons.copy),
                        label: Text(l10n.authRecoveryCodesCopyAll),
                        onPressed: _copyAll,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: OutlinedButton.icon(
                        key: const Key('share_codes'),
                        icon: const Icon(Icons.share),
                        label: Text(l10n.authRecoveryCodesShare),
                        onPressed: _share,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                CheckboxListTile(
                  key: const Key('ack_checkbox'),
                  value: _saved,
                  onChanged: _continuing ? null : (value) => setState(() => _saved = value ?? false),
                  controlAffinity: ListTileControlAffinity.leading,
                  contentPadding: EdgeInsets.zero,
                  title: Text(l10n.authRecoveryCodesAcknowledge),
                ),
                const SizedBox(height: 12),
                ElevatedButton(
                  key: const Key('continue_button'),
                  onPressed: _saved && !_continuing ? _continue : null,
                  child: _continuing
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : Text(l10n.authRecoveryCodesContinue),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _CodeTile extends StatelessWidget {
  const _CodeTile(this.code);
  final String code;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(vertical: 10),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: AppColors.divider),
        ),
        child: Text(
          code,
          style: const TextStyle(
            fontFamily: 'monospace',
            fontWeight: FontWeight.bold,
            fontSize: 14,
            letterSpacing: 1.5,
          ),
        ),
      );
}
