import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_version.dart';
import '../../../core/router/routes.dart';
import '../../../l10n/l10n.dart';
import '../../../shared/widgets/auth_layout.dart';

/// Password recovery has no backend: Web/backend/src/auth/auth.controller.ts has no
/// forgot-password, verify-otp or reset-password route. Passwords are reset by an
/// administrator (POST /admin/users/:id/reset-password), so the screen says so instead of
/// calling routes that do not exist.
class ForgotPasswordScreen extends StatelessWidget {
  const ForgotPasswordScreen({super.key});

  /// Back to the login screen it was opened from, or to the login route when opened directly.
  static void _back(BuildContext context) {
    final navigator = Navigator.of(context);
    if (navigator.canPop()) {
      navigator.pop();
    } else {
      context.go(Routes.login);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Scaffold(
      body: AuthBackground(
        child: Column(
          children: [
            const AuthBrandHeader(),
            const SizedBox(height: 28),
            AuthCard(
              title: l10n.authForgotPasswordTitle.toUpperCase(),
              children: [
                const Icon(Icons.admin_panel_settings_outlined, color: AppColors.primary, size: 48),
                const SizedBox(height: 12),
                Text(
                  l10n.authForgotPasswordUnsupported,
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 14, height: 1.4, color: AppColors.textDark),
                ),
                const SizedBox(height: 24),
                AuthPrimaryButton(label: l10n.authForgotPasswordBack, onPressed: () => _back(context)),
              ],
            ),
            const SizedBox(height: 16),
            AuthFooter(l10n.authLoginVersion(appVersion)),
          ],
        ),
      ),
    );
  }
}
