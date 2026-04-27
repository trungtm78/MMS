import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_constants.dart';
import '../../../core/network/dio_client.dart';
import '../../auth/providers/auth_provider.dart';

// ── Tabs ────────────────────────────────────────────────────────────────────
enum _SosTab { report, contacts }

// ── Screen ──────────────────────────────────────────────────────────────────
class SosScreen extends ConsumerStatefulWidget {
  const SosScreen({super.key});

  @override
  ConsumerState<SosScreen> createState() => _SosScreenState();
}

class _SosScreenState extends ConsumerState<SosScreen> {
  _SosTab _tab = _SosTab.report;
  bool _sosCountdown = false;
  bool _showSuccess = false;

  // Report form state
  String _incidentType = '';
  String _severity = '';
  final _titleCtrl = TextEditingController();
  final _descCtrl = TextEditingController();

  @override
  void dispose() {
    _titleCtrl.dispose();
    _descCtrl.dispose();
    super.dispose();
  }

  Future<void> _activateSos() async {
    setState(() { _sosCountdown = true; });
    try {
      double? lat, lng;
      try {
        final pos = await Geolocator.getCurrentPosition(
          desiredAccuracy: LocationAccuracy.high,
        );
        lat = pos.latitude;
        lng = pos.longitude;
      } catch (_) {}
      final storage = ref.read(secureStorageProvider);
      final dio = DioClient.getInstance(storage);
      await dio.post(ApiConstants.sos, data: {
        'incidentType': 'sos',
        'severity': 'urgent',
        'title': 'SOS',
        if (lat != null) 'lat': lat,
        if (lng != null) 'lng': lng,
      });
    } catch (_) {}
    await Future.delayed(const Duration(seconds: 3));
    if (mounted) setState(() { _sosCountdown = false; });
  }

  Future<void> _submitReport() async {
    setState(() { _showSuccess = true; });
    await Future.delayed(const Duration(milliseconds: 2500));
    if (mounted) context.pop();
  }

  @override
  Widget build(BuildContext context) {
    // SOS Countdown Overlay
    if (_sosCountdown) {
      return Scaffold(
        backgroundColor: AppColors.error,
        body: SafeArea(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const _PulseIcon(Icons.warning_amber_rounded, Colors.white, 96),
              const SizedBox(height: 24),
              const Text(
                'SOS',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 64,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 8,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 12),
              const Text(
                'Đang gọi khẩn cấp...',
                style: TextStyle(color: Colors.white, fontSize: 22),
                textAlign: TextAlign.center,
              ),
              const Text(
                'Công An Khu Vực',
                style: TextStyle(color: Colors.white70, fontSize: 16),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 48),
              Center(
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.white,
                    foregroundColor: AppColors.error,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 12),
                  ),
                  onPressed: () => setState(() { _sosCountdown = false; }),
                  child: const Text('HỦY', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                ),
              ),
            ],
          ),
        ),
      );
    }

    // Success Overlay
    if (_showSuccess) {
      return Scaffold(
        backgroundColor: AppColors.background,
        body: SafeArea(
          child: Center(
            child: Container(
              margin: const EdgeInsets.all(32),
              padding: const EdgeInsets.all(32),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(20),
                boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.1), blurRadius: 20)],
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 80, height: 80,
                    decoration: const BoxDecoration(color: AppColors.success, shape: BoxShape.circle),
                    child: const Icon(Icons.check_circle, color: Colors.white, size: 48),
                  ),
                  const SizedBox(height: 16),
                  const Text('Đã gửi báo cáo!',
                    style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: AppColors.success)),
                  const SizedBox(height: 8),
                  const Text('Mã báo cáo: BC-2024-001',
                    style: TextStyle(color: AppColors.textSecondary)),
                  const SizedBox(height: 4),
                  const Text('CA KV đang xử lý',
                    style: TextStyle(fontSize: 13, color: AppColors.textSecondary)),
                  const SizedBox(height: 4),
                  const Text('Thời gian phản hồi dự kiến: 10-15 phút',
                    style: TextStyle(fontSize: 12, color: AppColors.textMuted)),
                ],
              ),
            ),
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: AppColors.background,
      body: Column(
        children: [
          // ── Navy Header ────────────────────────────────────────────────────
          Container(
            color: AppColors.navy,
            child: SafeArea(
              bottom: false,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                child: Row(
                  children: [
                    GestureDetector(
                      onTap: () => context.pop(),
                      child: Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Icon(Icons.arrow_back, color: Colors.white, size: 20),
                      ),
                    ),
                    const SizedBox(width: 12),
                    const Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('SOS & Báo Cáo Sự Cố',
                            style: TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.bold)),
                          Text('Báo cáo khẩn cấp & liên hệ hỗ trợ',
                            style: TextStyle(color: Colors.white70, fontSize: 12)),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),

          // ── Tab Row ────────────────────────────────────────────────────────
          Container(
            color: Colors.white,
            child: Row(
              children: [
                _TabBtn('Báo Cáo', _SosTab.report, _tab, (t) => setState(() => _tab = t)),
                _TabBtn('Liên Hệ SOS', _SosTab.contacts, _tab, (t) => setState(() => _tab = t)),
              ],
            ),
          ),

          // ── Body ───────────────────────────────────────────────────────────
          Expanded(
            child: _tab == _SosTab.report ? _buildReport() : _buildContacts(),
          ),
        ],
      ),

      // ── Submit Footer ──────────────────────────────────────────────────────
      bottomNavigationBar: _tab == _SosTab.report
          ? _buildSubmitBar()
          : null,
    );
  }

  // ── Report Form ─────────────────────────────────────────────────────────────
  Widget _buildReport() {
    final incidentTypes = [
      ('security', '🚨', 'Mất an ninh'),
      ('fire', '🔥', 'Hỏa hoạn'),
      ('medical', '💊', 'Y tế khẩn cấp'),
      ('accident', '🚗', 'Tai nạn giao thông'),
      ('utility', '⚡', 'Sự cố điện nước'),
      ('other', '📝', 'Khác'),
    ];
    final severities = [
      ('low', '🟢', 'Thấp', 'Quan sát, không khẩn'),
      ('medium', '🟡', 'Trung bình', 'Cần xử lý sớm'),
      ('high', '🟠', 'Cao', 'Cần xử lý ngay'),
      ('urgent', '🔴', 'Khẩn cấp', 'Nguy hiểm, SOS'),
    ];

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Incident type grid
          _SectionCard(
            title: 'Loại sự cố',
            child: GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
              childAspectRatio: 2.0,
              children: incidentTypes.map((t) {
                final selected = _incidentType == t.$1;
                return GestureDetector(
                  onTap: () => setState(() => _incidentType = t.$1),
                  child: Container(
                    decoration: BoxDecoration(
                      color: selected ? AppColors.cardBlueLight : Colors.white,
                      border: Border.all(
                        color: selected ? AppColors.navy : AppColors.divider,
                        width: 2,
                      ),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(t.$2, style: const TextStyle(fontSize: 22)),
                        const SizedBox(width: 8),
                        Text(t.$3,
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: selected ? AppColors.navy : AppColors.textPrimary,
                          )),
                      ],
                    ),
                  ),
                );
              }).toList(),
            ),
          ),
          const SizedBox(height: 12),

          // Severity
          _SectionCard(
            title: 'Mức độ nghiêm trọng',
            child: Column(
              children: severities.map((s) {
                final selected = _severity == s.$1;
                return GestureDetector(
                  onTap: () => setState(() => _severity = s.$1),
                  child: Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    decoration: BoxDecoration(
                      color: selected ? AppColors.cardBlueLight : Colors.white,
                      border: Border.all(
                        color: selected ? AppColors.navy : AppColors.divider,
                        width: 2,
                      ),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      children: [
                        Text(s.$2, style: const TextStyle(fontSize: 22)),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(s.$3,
                                style: TextStyle(
                                  fontWeight: FontWeight.w600,
                                  fontSize: 13,
                                  color: selected ? AppColors.navy : AppColors.textPrimary,
                                )),
                              Text(s.$4,
                                style: const TextStyle(fontSize: 11, color: AppColors.textSecondary)),
                            ],
                          ),
                        ),
                        if (selected)
                          const Icon(Icons.check_circle, color: AppColors.navy, size: 20),
                      ],
                    ),
                  ),
                );
              }).toList(),
            ),
          ),
          const SizedBox(height: 12),

          // Description
          _SectionCard(
            title: 'Mô tả sự cố',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                TextField(
                  controller: _titleCtrl,
                  decoration: InputDecoration(
                    hintText: 'Tiêu đề sự cố',
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                      borderSide: const BorderSide(color: AppColors.divider),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                      borderSide: const BorderSide(color: AppColors.navy),
                    ),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  ),
                  style: const TextStyle(fontSize: 14),
                ),
                const SizedBox(height: 12),
                Stack(
                  children: [
                    TextField(
                      controller: _descCtrl,
                      maxLines: 4,
                      maxLength: 500,
                      onChanged: (_) => setState(() {}),
                      decoration: InputDecoration(
                        hintText: 'Mô tả chi tiết...',
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(8),
                          borderSide: const BorderSide(color: AppColors.divider),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(8),
                          borderSide: const BorderSide(color: AppColors.navy),
                        ),
                        contentPadding: const EdgeInsets.fromLTRB(12, 10, 48, 10),
                        counterText: '',
                      ),
                      style: const TextStyle(fontSize: 13),
                    ),
                    Positioned(
                      bottom: 8, right: 8,
                      child: Container(
                        padding: const EdgeInsets.all(6),
                        decoration: BoxDecoration(
                          color: AppColors.navy,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Icon(Icons.mic, color: Colors.white, size: 16),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  _descCtrl.text.length < 20
                      ? 'Tối thiểu 20 ký tự (còn ${20 - _descCtrl.text.length})'
                      : '${_descCtrl.text.length}/500',
                  style: TextStyle(
                    fontSize: 11,
                    color: _descCtrl.text.length < 20 ? AppColors.error : AppColors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),

          // Evidence
          _SectionCard(
            title: 'Bằng chứng',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Expanded(child: _EvidenceBtn(Icons.camera_alt, 'Chụp ảnh')),
                    const SizedBox(width: 10),
                    Expanded(child: _EvidenceBtn(Icons.upload, 'Tải ảnh')),
                    const SizedBox(width: 10),
                    Expanded(child: _EvidenceBtn(Icons.mic, 'Ghi âm')),
                  ],
                ),
                const SizedBox(height: 8),
                const Text(
                  'Ảnh: Tối đa 10 ảnh • Video: Tối đa 30s • Âm thanh: Tối đa 60s',
                  style: TextStyle(fontSize: 11, color: AppColors.textSecondary),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // ── Contacts Tab ─────────────────────────────────────────────────────────────
  Widget _buildContacts() {
    final contacts = [
      ('Công An Khu Vực', '0901234567', '🚨', AppColors.error),
      ('Công An Phường', '0901234568', '🚓', AppColors.warning),
      ('Cấp cứu 115', '115', '🚑', AppColors.success),
      ('Cứu hỏa 114', '114', '🔥', AppColors.error),
      ('Người thân', '0916789012', '👨‍👩‍👧', AppColors.blue),
    ];

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // SOS activation card
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              gradient: AppColors.sosGradient,
              borderRadius: BorderRadius.circular(16),
              boxShadow: [
                BoxShadow(
                  color: AppColors.error.withOpacity(0.3),
                  blurRadius: 12,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Column(
              children: [
                const Icon(Icons.warning_amber_rounded, color: Colors.white, size: 64),
                const SizedBox(height: 12),
                const Text('Khẩn Cấp SOS',
                  style: TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w900)),
                const SizedBox(height: 4),
                const Text('Nhấn giữ 2 giây để kích hoạt',
                  style: TextStyle(color: Colors.white70, fontSize: 13)),
                const SizedBox(height: 16),
                GestureDetector(
                  onLongPress: _activateSos,
                  child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Text(
                      'KÍCH HOẠT SOS',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: AppColors.error,
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        letterSpacing: 1,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Sẽ tự động gọi CA Khu Vực và gửi vị trí của bạn',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.white70, fontSize: 11),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Emergency contacts list
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 8)],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Liên hệ khẩn cấp',
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15, color: AppColors.textPrimary)),
                const SizedBox(height: 12),
                ...contacts.map((c) => Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppColors.cardHover,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 48, height: 48,
                          decoration: BoxDecoration(color: c.$4, shape: BoxShape.circle),
                          child: Center(
                            child: Text(c.$3, style: const TextStyle(fontSize: 22)),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(c.$1,
                                style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: AppColors.textPrimary)),
                              Text(c.$2,
                                style: const TextStyle(fontSize: 11, color: AppColors.textSecondary)),
                            ],
                          ),
                        ),
                        ElevatedButton.icon(
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppColors.success,
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                          ),
                          icon: const Icon(Icons.phone, size: 14, color: Colors.white),
                          label: const Text('Gọi', style: TextStyle(color: Colors.white, fontSize: 12)),
                          onPressed: () {},
                        ),
                      ],
                    ),
                  ),
                )),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // ── Submit Bar ───────────────────────────────────────────────────────────────
  Widget _buildSubmitBar() {
    final isValid = _incidentType.isNotEmpty && _severity.isNotEmpty
        && _descCtrl.text.length >= 20 && _titleCtrl.text.isNotEmpty;

    Color btnColor;
    String btnText;
    if (!isValid) {
      btnColor = AppColors.textMuted;
      btnText = 'GỬI BÁO CÁO';
    } else if (_severity == 'urgent') {
      btnColor = AppColors.error;
      btnText = 'GỬI BÁO CÁO KHẨN';
    } else if (_severity == 'high') {
      btnColor = AppColors.warning;
      btnText = 'GỬI BÁO CÁO';
    } else {
      btnColor = AppColors.navy;
      btnText = 'GỬI BÁO CÁO';
    }

    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: AppColors.divider)),
      ),
      padding: EdgeInsets.fromLTRB(16, 12, 16, 12 + MediaQuery.of(context).padding.bottom),
      child: SizedBox(
        width: double.infinity,
        height: 48,
        child: ElevatedButton(
          style: ElevatedButton.styleFrom(
            backgroundColor: isValid ? btnColor : AppColors.textMuted,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
          onPressed: isValid ? _submitReport : null,
          child: Text(btnText,
            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 15)),
        ),
      ),
    );
  }
}

// ── Helper Widgets ──────────────────────────────────────────────────────────

class _TabBtn extends StatelessWidget {
  final String label;
  final _SosTab value;
  final _SosTab current;
  final ValueChanged<_SosTab> onTap;
  const _TabBtn(this.label, this.value, this.current, this.onTap);

  @override
  Widget build(BuildContext context) => Expanded(
    child: GestureDetector(
      onTap: () => onTap(value),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          border: Border(
            bottom: BorderSide(
              color: current == value ? AppColors.navy : Colors.transparent,
              width: 2,
            ),
          ),
        ),
        child: Text(
          label,
          textAlign: TextAlign.center,
          style: TextStyle(
            fontWeight: FontWeight.w600,
            fontSize: 13,
            color: current == value ? AppColors.navy : AppColors.textSecondary,
          ),
        ),
      ),
    ),
  );
}

class _SectionCard extends StatelessWidget {
  final String title;
  final Widget child;
  const _SectionCard({required this.title, required this.child});

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(12),
      boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 8)],
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15, color: AppColors.textPrimary)),
        const SizedBox(height: 12),
        child,
      ],
    ),
  );
}

class _EvidenceBtn extends StatelessWidget {
  final IconData icon;
  final String label;
  const _EvidenceBtn(this.icon, this.label);

  @override
  Widget build(BuildContext context) => AspectRatio(
    aspectRatio: 1,
    child: Container(
      decoration: BoxDecoration(
        border: Border.all(color: AppColors.divider, width: 2, style: BorderStyle.solid),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, color: AppColors.textSecondary, size: 24),
          const SizedBox(height: 4),
          Text(label, style: const TextStyle(fontSize: 11, color: AppColors.textSecondary)),
        ],
      ),
    ),
  );
}

class _PulseIcon extends StatefulWidget {
  final IconData icon;
  final Color color;
  final double size;
  const _PulseIcon(this.icon, this.color, this.size);

  @override
  State<_PulseIcon> createState() => _PulseIconState();
}

class _PulseIconState extends State<_PulseIcon> with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _anim;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    )..repeat(reverse: true);
    _anim = Tween<double>(begin: 0.7, end: 1.0).animate(_ctrl);
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FadeTransition(
    opacity: _anim,
    child: Icon(widget.icon, color: widget.color, size: widget.size),
  );
}
