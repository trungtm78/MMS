import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_version.dart';
import '../../../core/router/routes.dart';
import '../../../core/utils/validators.dart';
import '../../../l10n/l10n.dart';
import '../../../l10n/validation_texts.dart';
import '../../../shared/services/biometric_service.dart';
import '../../../shared/widgets/auth_layout.dart';
import '../auth_texts.dart';
import '../models/login_response.dart';
import '../providers/auth_provider.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});
  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _usernameCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  bool _obscurePassword = true;
  bool _biometricAvailable = false;

  @override
  void initState() {
    super.initState();
    _checkBiometric();
  }

  Future<void> _checkBiometric() async {
    final storage = ref.read(secureStorageProvider);
    final enabled = await storage.isBiometricEnabled();
    final bio = BiometricService();
    final available = await bio.isAvailable();
    if (mounted) setState(() => _biometricAvailable = enabled && available);
  }

  Future<void> _login() async {
    if (!_formKey.currentState!.validate()) return;
    final notifier = ref.read(authStateProvider.notifier);
    final result = await notifier.login(
      _usernameCtrl.text.trim(),
      _passwordCtrl.text,
    );
    if (!mounted || result == null) return;
    // The router builds the second-factor screens from the whole response
    switch (result.status) {
      case LoginStatus.mfaRequired:
        context.push(Routes.otpVerify, extra: result);
      case LoginStatus.mfaSetupRequired:
        context.push(Routes.mfaSetup, extra: result);
      case LoginStatus.success:
        break;
    }
  }

  Future<void> _biometricLogin() async {
    final reason = context.l10n.authLoginBiometricReason;
    final bio = BiometricService();
    final ok = await bio.authenticate(reason);
    if (!ok || !mounted) return;
    final storage = ref.read(secureStorageProvider);
    final token = await storage.getAccessToken();
    if (token != null) ref.read(authStateProvider.notifier).refreshAuthState();
  }

  @override
  void dispose() {
    _usernameCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authStateProvider);
    final l10n = context.l10n;
    final notice = authState.notice;
    final error = authState.error;
    return Scaffold(
      body: AuthBackground(
        child: Column(
          children: [
            const AuthBrandHeader(),
            const SizedBox(height: 28),
            AuthCard(
              title: l10n.authLoginCardTitle,
              children: [
                // Why the session ended (refused refresh, password changed): information, not an error
                if (notice != null)
                  AuthBanner.notice(key: const Key('login_notice'), message: sessionEndText(l10n, notice)),
                if (error != null)
                  AuthBanner.error(key: const Key('login_error'), message: authErrorText(l10n, error)),
                Form(
                  key: _formKey,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      AuthFieldLabel(l10n.authLoginUsernameLabel),
                      TextFormField(
                        key: const Key('username_field'),
                        controller: _usernameCtrl,
                        decoration: authInputDecoration(
                          hint: l10n.authLoginUsernameHint,
                          icon: Icons.person_outline,
                        ),
                        textInputAction: TextInputAction.next,
                        validator: (value) => validationText(l10n, Validators.username(value)),
                      ),
                      const SizedBox(height: 16),
                      AuthFieldLabel(l10n.authLoginPasswordLabel),
                      TextFormField(
                        key: const Key('password_field'),
                        controller: _passwordCtrl,
                        obscureText: _obscurePassword,
                        decoration: authInputDecoration(
                          hint: l10n.authLoginPasswordHint,
                          icon: Icons.lock_outline,
                          suffix: IconButton(
                            tooltip: _obscurePassword ? l10n.authLoginShowPassword : l10n.authLoginHidePassword,
                            icon: Icon(_obscurePassword ? Icons.visibility_off : Icons.visibility),
                            onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
                          ),
                        ),
                        textInputAction: TextInputAction.done,
                        onFieldSubmitted: (_) => _login(),
                        validator: (value) => validationText(l10n, Validators.password(value)),
                      ),
                    ],
                  ),
                ),
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(
                    onPressed: () => context.push(Routes.forgotPassword),
                    child: Text(l10n.authLoginForgotPassword, style: authLinkStyle),
                  ),
                ),
                const SizedBox(height: 4),
                AuthPrimaryButton(
                  buttonKey: const Key('login_button'),
                  label: l10n.authLoginSubmitButton,
                  loading: authState.isLoading,
                  onPressed: _login,
                ),
                if (_biometricAvailable) ...[
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    key: const Key('biometric_button'),
                    onPressed: _biometricLogin,
                    icon: const Icon(Icons.fingerprint, color: AppColors.navy),
                    label: Text(
                      l10n.authLoginBiometricButton,
                      style: const TextStyle(color: AppColors.navy),
                    ),
                    style: OutlinedButton.styleFrom(
                      side: const BorderSide(color: AppColors.navy, width: 1.5),
                      minimumSize: const Size(double.infinity, 48),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                  ),
                ],
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
