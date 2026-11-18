import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_version.dart';
import '../../../core/router/routes.dart';
import '../../../l10n/l10n.dart';
import '../../../shared/widgets/auth_layout.dart';
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

  @override
  void dispose() {
    _usernameCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    if (!_formKey.currentState!.validate()) return;
    final notifier = ref.read(authStateProvider.notifier);
    final loginResponse = await notifier.login(
      _usernameCtrl.text.trim(),
      _passwordCtrl.text,
    );

    if (!mounted) return;

    // MFA_SETUP_REQUIRED / MFA_REQUIRED: the screens read mfaToken and methods from it
    if (loginResponse != null) {
      if (loginResponse.requiresMfaSetup) {
        context.go(Routes.mfaSetup, extra: loginResponse);
      } else if (loginResponse.requiresMfa) {
        context.go(Routes.otp, extra: loginResponse);
      }
      return;
    }

    // A failure is shown inside the card from the state
    final state = ref.read(authStateProvider);
    if (state.error != null) return;

    // Navigate by role
    if (state.role == 'ca') {
      context.go(Routes.caHome);
    } else if (state.role == 'dqtv') {
      context.go(Routes.dqtvHome);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final auth = ref.watch(authStateProvider);
    final notice = auth.notice;
    final error = auth.error;

    return Scaffold(
      body: AuthBackground(
        child: Column(
          children: [
            const AuthBrandHeader(),
            const SizedBox(height: 28),
            AuthCard(
              title: l10n.authLoginCardTitle,
              children: [
                // Why the previous session ended (revoked, password changed, …)
                if (notice != null)
                  AuthBanner.notice(key: const Key('login_notice'), message: failureText(l10n, notice)),
                if (error != null) AuthBanner.error(key: const Key('login_error'), message: failureText(l10n, error)),
                Form(
                  key: _formKey,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      AuthFieldLabel(l10n.authLoginUsernameLabel),
                      TextFormField(
                        controller: _usernameCtrl,
                        decoration: authInputDecoration(
                          hint: l10n.authLoginUsernameHint,
                          icon: Icons.person_outline,
                        ),
                        validator: (v) => (v == null || v.trim().isEmpty) ? l10n.authLoginUsernameRequired : null,
                        textInputAction: TextInputAction.next,
                      ),
                      const SizedBox(height: 16),
                      AuthFieldLabel(l10n.authLoginPasswordLabel),
                      TextFormField(
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
                        validator: (v) => (v == null || v.isEmpty) ? l10n.authLoginPasswordRequired : null,
                        textInputAction: TextInputAction.done,
                        onFieldSubmitted: (_) => _login(),
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
                AuthPrimaryButton(label: l10n.authLoginSubmit, loading: auth.isLoading, onPressed: _login),
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
