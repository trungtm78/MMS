import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/router/routes.dart';
import '../../../l10n/l10n.dart';
import '../auth_texts.dart';
import '../models/mfa_enrollment.dart';
import '../models/mfa_error.dart';
import '../providers/auth_provider.dart';
import '../widgets/mfa_enrollment_panel.dart';
import 'recovery_codes_screen.dart';

/// MFA_SETUP_REQUIRED sign-in: enrol an authenticator (POST /auth/mfa/enroll), confirm the
/// first code (POST /auth/mfa/enroll/confirm), then show the recovery codes.
class MfaEnrollScreen extends ConsumerStatefulWidget {
  const MfaEnrollScreen({super.key, required this.mfaToken});

  /// Setup challenge from POST /auth/login.
  final String mfaToken;

  @override
  ConsumerState<MfaEnrollScreen> createState() => _MfaEnrollScreenState();
}

class _MfaEnrollScreenState extends ConsumerState<MfaEnrollScreen> {
  MfaEnrollment? _enrollment;
  MfaError? _loadError;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    if (widget.mfaToken.trim().isEmpty) {
      _loadError = MfaError.missingChallenge();
      _loading = false;
    } else {
      _load();
    }
  }

  Future<void> _load() async {
    try {
      final enrollment = await ref.read(authRepositoryProvider).enrollMfa(widget.mfaToken);
      if (!mounted) return;
      setState(() {
        _enrollment = enrollment;
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

  void _retry() {
    setState(() {
      _loading = true;
      _loadError = null;
    });
    _load();
  }

  Future<MfaError?> _confirm(String code) async {
    final notifier = ref.read(authStateProvider.notifier);
    final attempt = await notifier.confirmEnrollment(
      mfaToken: _enrollment?.mfaToken ?? widget.mfaToken,
      code: code,
    );
    if (!attempt.success || !mounted) return attempt.error;

    if (attempt.recoveryCodes.isEmpty) {
      // Nothing to show: start the session straight away
      await notifier.acknowledgeRecoveryCodes();
      if (mounted) context.go(Routes.home);
      return null;
    }
    context.go(
      Routes.recoveryCodes,
      extra: RecoveryCodesArgs(attempt.recoveryCodes, completesLogin: true),
    );
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final enrollment = _enrollment;
    final l10n = context.l10n;
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.authMfaEnrollTitle),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go(Routes.login),
        ),
      ),
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : SingleChildScrollView(
                padding: const EdgeInsets.all(24),
                child: enrollment != null
                    ? Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text(
                            l10n.authMfaEnrollIntro,
                            style: const TextStyle(fontSize: 13, color: AppColors.textSecondary),
                          ),
                          const SizedBox(height: 16),
                          MfaEnrollmentPanel(
                            enrollment: enrollment,
                            onConfirm: _confirm,
                            onRestart: () => context.go(Routes.login),
                          ),
                        ],
                      )
                    : _buildLoadError(l10n, _loadError ?? MfaError.missingChallenge()),
              ),
      ),
    );
  }

  Widget _buildLoadError(AppLocalizations l10n, MfaError error) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Icon(Icons.error_outline, size: 56, color: AppColors.error),
        const SizedBox(height: 12),
        Text(
          mfaErrorText(l10n, error),
          key: const Key('mfa_error'),
          style: const TextStyle(color: AppColors.error),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 24),
        if (!error.restartLogin) ...[
          ElevatedButton(
            key: const Key('retry_enroll'),
            onPressed: _retry,
            child: Text(l10n.authMfaEnrollRetryButton),
          ),
          const SizedBox(height: 12),
        ],
        OutlinedButton(
          key: const Key('restart_login'),
          onPressed: () => context.go(Routes.login),
          child: Text(l10n.authMfaRestartLoginButton),
        ),
      ],
    );
  }
}
