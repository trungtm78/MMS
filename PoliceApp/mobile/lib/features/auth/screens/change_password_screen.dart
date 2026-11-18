import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_colors.dart';
import '../../../l10n/l10n.dart';
import '../../../shared/errors/app_failure.dart';
import '../../../shared/widgets/app_header.dart';
import '../providers/auth_provider.dart';

/// The backend rule for a new password (Web/backend/src/users/users.service.ts:201-206)
final _passwordRule = RegExp(r'^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z\d]).{8,}$');

/// POST /users/me/change-password. Success ends every session of the account, this one included;
/// the router then shows the login screen with the notice set by [AuthNotifier.changePassword].
class ChangePasswordScreen extends ConsumerStatefulWidget {
  const ChangePasswordScreen({super.key});

  @override
  ConsumerState<ChangePasswordScreen> createState() => _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends ConsumerState<ChangePasswordScreen> {
  final _formKey = GlobalKey<FormState>();
  final _currentCtrl = TextEditingController();
  final _newCtrl = TextEditingController();
  final _confirmCtrl = TextEditingController();
  bool _obscure = true;
  bool _saving = false;
  AppFailure? _error;

  @override
  void dispose() {
    _currentCtrl.dispose();
    _newCtrl.dispose();
    _confirmCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _error = null);
    if (!_formKey.currentState!.validate()) return;
    setState(() => _saving = true);
    final error = await ref
        .read(authStateProvider.notifier)
        .changePassword(currentPassword: _currentCtrl.text, newPassword: _newCtrl.text);
    if (!mounted) return;
    setState(() {
      _saving = false;
      _error = error;
    });
  }

  InputDecoration _decoration(String label) => InputDecoration(
        labelText: label,
        prefixIcon: const Icon(Icons.lock_outline),
      );

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final error = _error;
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppHeader(title: l10n.authChangePasswordTitle, showBack: true),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  l10n.authChangePasswordNote,
                  style: const TextStyle(fontSize: 13, color: AppColors.textSecondary),
                ),
                const SizedBox(height: 16),
                TextFormField(
                  key: const Key('current_password'),
                  controller: _currentCtrl,
                  obscureText: _obscure,
                  decoration: _decoration(l10n.authChangePasswordCurrentLabel).copyWith(
                    suffixIcon: IconButton(
                      tooltip: _obscure ? l10n.authChangePasswordShow : l10n.authChangePasswordHide,
                      icon: Icon(_obscure ? Icons.visibility_off : Icons.visibility),
                      onPressed: () => setState(() => _obscure = !_obscure),
                    ),
                  ),
                  validator: (v) => v == null || v.isEmpty ? l10n.authChangePasswordCurrentRequired : null,
                  textInputAction: TextInputAction.next,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  key: const Key('new_password'),
                  controller: _newCtrl,
                  obscureText: _obscure,
                  decoration: _decoration(l10n.authChangePasswordNewLabel),
                  validator: (v) {
                    if (v == null || !_passwordRule.hasMatch(v)) return l10n.errorPasswordComplexity;
                    if (v == _currentCtrl.text) return l10n.authChangePasswordMustDiffer;
                    return null;
                  },
                  textInputAction: TextInputAction.next,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  key: const Key('confirm_password'),
                  controller: _confirmCtrl,
                  obscureText: _obscure,
                  decoration: _decoration(l10n.authChangePasswordConfirmLabel),
                  validator: (v) => v != _newCtrl.text ? l10n.authChangePasswordMismatch : null,
                  textInputAction: TextInputAction.done,
                  onFieldSubmitted: (_) => _saving ? null : _submit(),
                ),
                if (error != null) ...[
                  const SizedBox(height: 12),
                  Text(failureText(l10n, error), style: const TextStyle(color: AppColors.error)),
                ],
                const SizedBox(height: 20),
                SizedBox(
                  height: 48,
                  child: ElevatedButton(
                    onPressed: _saving ? null : _submit,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.navy,
                      foregroundColor: Colors.white,
                    ),
                    child: _saving
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                          )
                        : Text(l10n.authChangePasswordSubmit, style: const TextStyle(fontWeight: FontWeight.w700)),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
