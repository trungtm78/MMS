import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:dio/dio.dart' show Options;

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_constants.dart';
import '../../../core/router/routes.dart';
import '../providers/auth_provider.dart';
import '../models/auth_models.dart';

class MfaSetupScreen extends ConsumerStatefulWidget {
  final String tempToken;
  const MfaSetupScreen({super.key, required this.tempToken});

  @override
  ConsumerState<MfaSetupScreen> createState() => _MfaSetupScreenState();
}

class _MfaSetupScreenState extends ConsumerState<MfaSetupScreen> {
  MfaSetupResponse? _setupData;
  bool _loading = true;
  bool _confirming = false;
  String? _error;
  final _codeCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _loadSetup();
  }

  @override
  void dispose() {
    _codeCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadSetup() async {
    setState(() { _loading = true; _error = null; });
    try {
      final dio = ref.read(dioProvider);
      final resp = await dio.post(
        ApiConstants.setupMfa,
        options: Options(headers: {'Authorization': 'Bearer ${widget.tempToken}'}),
      );
      setState(() {
        _setupData = MfaSetupResponse.fromJson(resp.data as Map<String, dynamic>);
        _loading = false;
      });
    } catch (e) {
      setState(() { _error = 'Lỗi tải thiết lập MFA'; _loading = false; });
    }
  }

  Future<void> _confirmSetup() async {
    if (_codeCtrl.text.trim().isEmpty) return;
    setState(() { _confirming = true; _error = null; });
    try {
      final dio = ref.read(dioProvider);
      await dio.post(
        ApiConstants.setupMfaConfirm,
        data: {'tempToken': widget.tempToken, 'code': _codeCtrl.text.trim()},
      );
      if (!mounted) return;
      // Show recovery codes if available
      context.go(Routes.recoveryCodes, extra: _setupData?.recoveryCodes);
    } catch (e) {
      setState(() { _error = 'Mã xác thực không đúng'; _confirming = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(gradient: AppColors.headerGradient),
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Column(
                children: [
                  const Icon(Icons.security, size: 64, color: AppColors.primary),
                  const SizedBox(height: 8),
                  const Text('Thiết lập MFA', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 4),
                  const Text('Quét mã QR bằng ứng dụng Authenticator',
                      style: TextStyle(color: AppColors.textSecondary)),
                  const SizedBox(height: 24),
                  if (_loading)
                    const CircularProgressIndicator(color: AppColors.navy)
                  else if (_error != null && _setupData == null)
                    Column(children: [
                      Text(_error!, style: const TextStyle(color: AppColors.error)),
                      const SizedBox(height: 8),
                      ElevatedButton(onPressed: _loadSetup, child: const Text('Thử lại')),
                    ])
                  else if (_setupData != null) ...[
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(children: [
                          // Secret key display (instead of QR in MVP)
                          const Text('Secret Key:', style: TextStyle(fontWeight: FontWeight.w600)),
                          const SizedBox(height: 8),
                          SelectableText(
                            _setupData!.secret,
                            style: const TextStyle(
                              fontFamily: 'monospace', fontSize: 14,
                              backgroundColor: Color(0xFFF1F5F9),
                            ),
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: 12),
                          const Text(
                            'Nhập secret key trên vào ứng dụng Google Authenticator hoặc tương đương.',
                            style: TextStyle(color: AppColors.textSecondary, fontSize: 12),
                            textAlign: TextAlign.center,
                          ),
                        ]),
                      ),
                    ),
                    const SizedBox(height: 16),
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(children: [
                          const Text('Nhập mã OTP để xác nhận', style: TextStyle(fontWeight: FontWeight.w600)),
                          const SizedBox(height: 12),
                          TextFormField(
                            controller: _codeCtrl,
                            keyboardType: TextInputType.number,
                            maxLength: 6,
                            decoration: const InputDecoration(
                              hintText: '6 chữ số',
                              prefixIcon: Icon(Icons.pin_outlined),
                              counterText: '',
                            ),
                            textInputAction: TextInputAction.done,
                            onFieldSubmitted: (_) => _confirmSetup(),
                          ),
                          if (_error != null) ...[
                            const SizedBox(height: 8),
                            Text(_error!, style: const TextStyle(color: AppColors.error, fontSize: 12)),
                          ],
                          const SizedBox(height: 16),
                          SizedBox(
                            width: double.infinity,
                            height: 48,
                            child: ElevatedButton(
                              onPressed: _confirming ? null : _confirmSetup,
                              style: ElevatedButton.styleFrom(
                                backgroundColor: AppColors.navy,
                                foregroundColor: Colors.white,
                              ),
                              child: _confirming
                                  ? const SizedBox(width: 20, height: 20,
                                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                                  : const Text('XÁC NHẬN', style: TextStyle(fontWeight: FontWeight.w700)),
                            ),
                          ),
                        ]),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}


