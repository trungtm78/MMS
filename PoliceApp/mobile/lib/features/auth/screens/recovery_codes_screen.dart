import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/router/routes.dart';

/// Displays the 10 one-time recovery codes returned by /auth/setup-mfa.
///
/// Pass codes via `context.go(Routes.recoveryCodes, extra: <List<String>>[...])`.
/// User can copy all codes to clipboard, then must confirm they have saved them
/// before continuing — server will not show these codes again.
class RecoveryCodesScreen extends StatefulWidget {
  final List<String> codes;
  const RecoveryCodesScreen({super.key, required this.codes});

  @override
  State<RecoveryCodesScreen> createState() => _RecoveryCodesScreenState();
}

class _RecoveryCodesScreenState extends State<RecoveryCodesScreen> {
  bool _confirmed = false;

  Future<void> _copyAll() async {
    await Clipboard.setData(ClipboardData(text: widget.codes.join('\n')));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Đã sao chép tất cả mã khôi phục')),
    );
  }

  void _continue() {
    if (!_confirmed) return;
    // After successful MFA setup, route to whichever home is appropriate.
    context.go(Routes.caHome);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Mã khôi phục'),
        backgroundColor: AppColors.navy,
        foregroundColor: Colors.white,
        automaticallyImplyLeading: false,
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Lưu 10 mã sau ở nơi an toàn (giấy / ứng dụng password manager).',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 4),
              const Text(
                'Mỗi mã chỉ dùng được một lần. Mã thay thế cho OTP khi mất thiết bị.',
                style: TextStyle(fontSize: 13, color: AppColors.textSecondary),
              ),
              const SizedBox(height: 16),
              Expanded(
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: AppColors.divider),
                  ),
                  child: ListView.separated(
                    itemCount: widget.codes.length,
                    separatorBuilder: (_, __) => const Divider(height: 1),
                    itemBuilder: (_, i) => Row(
                      children: [
                        Text(
                          '${i + 1}.'.padLeft(3),
                          style: const TextStyle(color: AppColors.textMuted),
                        ),
                        const SizedBox(width: 8),
                        SelectableText(
                          widget.codes[i],
                          style: const TextStyle(
                            fontFamily: 'monospace',
                            fontSize: 16,
                            letterSpacing: 1.2,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: _copyAll,
                icon: const Icon(Icons.copy),
                label: const Text('Sao chép tất cả'),
              ),
              const SizedBox(height: 8),
              CheckboxListTile(
                value: _confirmed,
                onChanged: (v) => setState(() => _confirmed = v ?? false),
                contentPadding: EdgeInsets.zero,
                controlAffinity: ListTileControlAffinity.leading,
                title: const Text(
                  'Tôi đã lưu các mã ở nơi an toàn',
                  style: TextStyle(fontSize: 13),
                ),
              ),
              ElevatedButton(
                onPressed: _confirmed ? _continue : null,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.navy,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
                child: const Text('Tiếp tục'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
