import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/utils/validators.dart';
import '../../../l10n/error_texts.dart';
import '../../../l10n/l10n.dart';
import '../../../l10n/validation_texts.dart';
import '../../../shared/utils/api_failure.dart';
import '../../../shared/widgets/app_header.dart';
import '../../auth/providers/auth_provider.dart';

/// POST /users/me/change-password (Web/backend/src/users/users.controller.ts:42-47). A successful
/// change ends every session of the account, this one too: AuthNotifier signs out and the router
/// shows the login screen with a notice.
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
  bool _submitting = false;

  /// The refused change, worded with the change-password rules of the error table.
  ApiFailure? _failure;

  @override
  void dispose() {
    _currentCtrl.dispose();
    _newCtrl.dispose();
    _confirmCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_submitting) return;
    setState(() => _failure = null);
    if (!_formKey.currentState!.validate()) return;
    setState(() => _submitting = true);
    final failure = await ref.read(authStateProvider.notifier).changePassword(
          currentPassword: _currentCtrl.text,
          newPassword: _newCtrl.text,
        );
    // After a successful change the router has already left for the login screen
    if (!mounted) return;
    setState(() {
      _submitting = false;
      _failure = failure;
    });
  }

  String? _validateNew(AppLocalizations l10n, String? value) {
    final invalid = validationText(l10n, Validators.newPassword(value));
    if (invalid != null) return invalid;
    if (value == _currentCtrl.text) return l10n.profileChangePasswordSameAsCurrent;
    return null;
  }

  String? _validateConfirm(AppLocalizations l10n, String? value) {
    if (value == null || value.isEmpty) return validationText(l10n, ValidationError.required);
    if (value != _newCtrl.text) return l10n.profileChangePasswordMismatch;
    return null;
  }

  InputDecoration _decoration(String label) => InputDecoration(
        labelText: label,
        errorMaxLines: 3,
        prefixIcon: const Icon(Icons.lock_outline),
        suffixIcon: IconButton(
          icon: Icon(_obscure ? Icons.visibility_off : Icons.visibility),
          onPressed: () => setState(() => _obscure = !_obscure),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final failure = _failure;
    return Scaffold(
      appBar: AppHeader(title: l10n.profileChangePasswordTitle, showBack: true),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  l10n.profileChangePasswordRules,
                  style: const TextStyle(fontSize: 13, color: AppColors.textSecondary),
                ),
                const SizedBox(height: 16),
                TextFormField(
                  key: const Key('current_password'),
                  controller: _currentCtrl,
                  obscureText: _obscure,
                  enabled: !_submitting,
                  decoration: _decoration(l10n.profileChangePasswordCurrentLabel),
                  textInputAction: TextInputAction.next,
                  validator: (value) => validationText(l10n, Validators.required(value)),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  key: const Key('new_password'),
                  controller: _newCtrl,
                  obscureText: _obscure,
                  enabled: !_submitting,
                  decoration: _decoration(l10n.profileChangePasswordNewLabel),
                  textInputAction: TextInputAction.next,
                  validator: (value) => _validateNew(l10n, value),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  key: const Key('confirm_password'),
                  controller: _confirmCtrl,
                  obscureText: _obscure,
                  enabled: !_submitting,
                  decoration: _decoration(l10n.profileChangePasswordConfirmLabel),
                  textInputAction: TextInputAction.done,
                  validator: (value) => _validateConfirm(l10n, value),
                  onFieldSubmitted: (_) => _submit(),
                ),
                if (failure != null) ...[
                  const SizedBox(height: 12),
                  Text(
                    failure.text(l10n, flow: ErrorFlow.changePassword),
                    key: const Key('change_password_error'),
                    style: const TextStyle(color: AppColors.error),
                  ),
                ],
                const SizedBox(height: 20),
                ElevatedButton(
                  key: const Key('change_password_submit'),
                  onPressed: _submitting ? null : _submit,
                  child: _submitting
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : Text(l10n.profileChangePasswordSubmitButton),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
