import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/router/routes.dart';
import '../../../l10n/l10n.dart';
import '../models/auth_models.dart';
import '../models/mfa_error.dart';
import '../providers/auth_provider.dart';
import '../providers/mfa_provider.dart';
import '../widgets/mfa_enrollment_panel.dart';
import 'recovery_codes_screen.dart';

/// MFA_SETUP_REQUIRED sign-in: POST /auth/mfa/enroll, then /auth/mfa/enroll/confirm; the
/// recovery codes are shown before the session starts.
class MfaSetupScreen extends ConsumerStatefulWidget {
  final String mfaToken;
  const MfaSetupScreen({super.key, required this.mfaToken});

  @override
  ConsumerState<MfaSetupScreen> createState() => _MfaSetupScreenState();
}

class _MfaSetupScreenState extends ConsumerState<MfaSetupScreen> {
  MfaEnrollment? _enrollment;
  MfaError? _loadError;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _loadError = null; });
    try {
      final enrollment = await ref.read(mfaApiProvider).enroll(widget.mfaToken);
      if (!mounted) return;
      setState(() { _enrollment = enrollment; _loading = false; });
    } catch (e) {
      if (mounted) setState(() { _loadError = MfaError.from(e); _loading = false; });
    }
  }

  Future<MfaError?> _confirm(String code) async {
    final enrollment = _enrollment!;
    final attempt = await ref
        .read(authStateProvider.notifier)
        .confirmEnrollment(mfaToken: enrollment.mfaToken, code: code);
    if (!mounted) return null;
    if (attempt.success) {
      context.go(Routes.recoveryCodes, extra: RecoveryCodesArgs(attempt.recoveryCodes, completesLogin: true));
      return null;
    }
    return attempt.error;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final loadError = _loadError;
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(gradient: AppColors.headerGradient),
        child: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Icon(Icons.security, size: 56, color: AppColors.primary),
                const SizedBox(height: 8),
                Text(l10n.authMfaSetupTitle,
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
                const SizedBox(height: 4),
                Text(l10n.authMfaSetupRequiredNotice,
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: AppColors.textSecondary)),
                const SizedBox(height: 16),
                if (_loading)
                  const Center(child: CircularProgressIndicator(color: AppColors.navy))
                else if (loadError != null)
                  Column(children: [
                    Text(failureText(l10n, loadError.failure),
                        textAlign: TextAlign.center, style: const TextStyle(color: AppColors.error)),
                    const SizedBox(height: 8),
                    if (!loadError.restartLogin)
                      ElevatedButton(onPressed: _load, child: Text(l10n.commonRetry)),
                    OutlinedButton(
                      key: const Key('restart_login'),
                      onPressed: () => context.go(Routes.login),
                      child: Text(l10n.authRestartLogin),
                    ),
                  ])
                else if (_enrollment != null)
                  MfaEnrollmentPanel(
                    enrollment: _enrollment!,
                    onConfirm: _confirm,
                    onRestart: () => context.go(Routes.login),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
