import 'package:flutter/material.dart';

import '../../core/constants/app_colors.dart';
import '../../l10n/l10n.dart';
import 'app_logo.dart';

// The building blocks of the signed-out screens (login, forgot password). The Công An app has the
// same file, so both apps' sign-in screens look alike: C:\MMS\DESIGN.md, Mobile auth screens.

/// The yellow gradient over the whole screen, with the content centred and scrollable.
class AuthBackground extends StatelessWidget {
  final Widget child;

  const AuthBackground({super.key, required this.child});

  static const _padding = 24.0;

  @override
  Widget build(BuildContext context) => DecoratedBox(
        decoration: const BoxDecoration(gradient: AppColors.headerGradient),
        child: SizedBox.expand(
          child: SafeArea(
            child: LayoutBuilder(
              builder: (context, constraints) => SingleChildScrollView(
                padding: const EdgeInsets.all(_padding),
                child: ConstrainedBox(
                  constraints: BoxConstraints(minHeight: constraints.maxHeight - _padding * 2),
                  child: Center(child: child),
                ),
              ),
            ),
          ),
        ),
      );
}

/// The logo, the app name, the system name and the owning authority.
class AuthBrandHeader extends StatelessWidget {
  const AuthBrandHeader({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Column(
      children: [
        const AppLogo(height: 120),
        const SizedBox(height: 12),
        Text(
          l10n.appTitle.toUpperCase(),
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontSize: 26,
            fontWeight: FontWeight.w900,
            color: AppColors.primary,
            letterSpacing: 1.2,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          l10n.authLoginSubtitle,
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.textDark),
        ),
        const SizedBox(height: 2),
        Text(
          l10n.authLoginUnit,
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
        ),
      ],
    );
  }
}

/// The white card holding the form, under an optional centred title.
class AuthCard extends StatelessWidget {
  final String? title;
  final List<Widget> children;

  const AuthCard({super.key, this.title, required this.children});

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: AppColors.cardBorder, width: 1.5),
          boxShadow: [
            BoxShadow(color: Colors.black.withValues(alpha: 0.10), blurRadius: 24, offset: const Offset(0, 8)),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (title != null) ...[
              Text(
                title!,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: AppColors.textPrimary,
                  letterSpacing: 1,
                ),
              ),
              const SizedBox(height: 20),
            ],
            ...children,
          ],
        ),
      );
}

/// The label above a field.
class AuthFieldLabel extends StatelessWidget {
  final String text;

  const AuthFieldLabel(this.text, {super.key});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Text(
          text,
          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.textDark),
        ),
      );
}

/// The decoration of a sign-in field.
InputDecoration authInputDecoration({required String hint, required IconData icon, Widget? suffix}) {
  OutlineInputBorder border(Color color, double width) => OutlineInputBorder(
        borderRadius: const BorderRadius.all(Radius.circular(12)),
        borderSide: BorderSide(color: color, width: width),
      );
  return InputDecoration(
    hintText: hint,
    prefixIcon: Icon(icon, color: AppColors.textSecondary),
    suffixIcon: suffix,
    filled: true,
    fillColor: AppColors.background,
    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
    border: border(AppColors.divider, 1),
    enabledBorder: border(AppColors.divider, 1),
    focusedBorder: border(AppColors.primary, 2),
    errorBorder: border(AppColors.error, 1),
    focusedErrorBorder: border(AppColors.error, 2),
  );
}

/// A link inside the card ("Quên mật khẩu?").
const authLinkStyle = TextStyle(color: AppColors.primary, fontSize: 13, fontWeight: FontWeight.w600);

/// A message inside the card: why the last session ended, or why sign-in failed.
class AuthBanner extends StatelessWidget {
  final String message;
  final IconData _icon;
  final Color _foreground;
  final Color _background;

  const AuthBanner.notice({super.key, required this.message})
      : _icon = Icons.info_outline,
        _foreground = AppColors.navy,
        _background = AppColors.cardBlueLight;

  const AuthBanner.error({super.key, required this.message})
      : _icon = Icons.error_outline,
        _foreground = AppColors.primary,
        _background = AppColors.errorBg;

  @override
  Widget build(BuildContext context) => Semantics(
        liveRegion: true,
        child: Container(
          margin: const EdgeInsets.only(bottom: 16),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: _background,
            border: Border.all(color: _foreground, width: 1.5),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            children: [
              Icon(_icon, color: _foreground, size: 18),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  message,
                  style: TextStyle(color: _foreground, fontSize: 13, fontWeight: FontWeight.w500),
                ),
              ),
            ],
          ),
        ),
      );
}

/// The red full-width action of the card; a spinner replaces the label while [loading].
class AuthPrimaryButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final bool loading;

  /// Given to the button itself, so tests can read its onPressed.
  final Key? buttonKey;

  const AuthPrimaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.loading = false,
    this.buttonKey,
  });

  @override
  Widget build(BuildContext context) => SizedBox(
        height: 52,
        child: ElevatedButton(
          key: buttonKey,
          onPressed: loading ? null : onPressed,
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.primary,
            foregroundColor: Colors.white,
            disabledBackgroundColor: AppColors.primary.withValues(alpha: 0.6),
            minimumSize: const Size(double.infinity, 52),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
          child: loading
              ? const SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white),
                )
              : Text(label, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, letterSpacing: 1)),
        ),
      );
}

/// The small line under the card (app version).
class AuthFooter extends StatelessWidget {
  final String text;

  const AuthFooter(this.text, {super.key});

  @override
  Widget build(BuildContext context) => Text(
        text,
        textAlign: TextAlign.center,
        style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
      );
}
