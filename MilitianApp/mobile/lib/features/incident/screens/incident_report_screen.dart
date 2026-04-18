import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_constants.dart';
import '../../../core/network/dio_client.dart';
import '../../auth/providers/auth_provider.dart';

class IncidentReportScreen extends ConsumerStatefulWidget {
  const IncidentReportScreen({super.key});

  @override
  ConsumerState<IncidentReportScreen> createState() => _IncidentReportScreenState();
}

class _IncidentReportScreenState extends ConsumerState<IncidentReportScreen> {
  String _selectedTask = '';
  final _descCtrl = TextEditingController();
  final _locationCtrl = TextEditingController();
  bool _isRecording = false;
  bool _hasVoiceNote = false;
  int _recordingSeconds = 0;
  Timer? _recordingTimer;
  bool _loading = false;
  bool _showSuccess = false;
  bool _gettingLocation = false;
  List<String> _photos = [];

  static const _tasks = [
    ('1', 'Tuần tra khu vực chợ Bến Thành'),
    ('2', 'Kiểm tra an ninh khu dân cư KP1'),
    ('3', 'Hỗ trợ điều tiết giao thông'),
    ('4', 'Tuyên truyền phòng cháy chữa cháy'),
    ('5', 'Khác (Tự nhập tiêu đề)'),
  ];

  @override
  void dispose() {
    _recordingTimer?.cancel();
    _descCtrl.dispose();
    _locationCtrl.dispose();
    super.dispose();
  }

  String _formatTime(int s) => '${(s ~/ 60).toString().padLeft(2, '0')}:${(s % 60).toString().padLeft(2, '0')}';

  void _startRecording() {
    setState(() { _isRecording = true; _recordingSeconds = 0; });
    _recordingTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() => _recordingSeconds++);
    });
  }

  void _stopRecording() {
    _recordingTimer?.cancel();
    setState(() { _isRecording = false; _hasVoiceNote = true; });
    // Simulate speech-to-text
    Future.delayed(const Duration(milliseconds: 500), () {
      if (mounted) {
        _descCtrl.text =
            'Báo cáo công việc ngày hôm nay. Tôi đã hoàn thành nhiệm vụ tuần tra khu vực. '
            'Tình hình an ninh ổn định, không phát hiện điểm bất thường. '
            'Đã kiểm tra các điểm trọng yếu và ghi nhận các hoạt động thường ngày của người dân.';
        setState(() {});
      }
    });
  }

  void _deleteVoice() {
    setState(() { _hasVoiceNote = false; _recordingSeconds = 0; });
  }

  Future<void> _getGPS() async {
    setState(() => _gettingLocation = true);
    try {
      final pos = await Geolocator.getCurrentPosition(desiredAccuracy: LocationAccuracy.high);
      if (mounted) {
        _locationCtrl.text = '${pos.latitude.toStringAsFixed(6)}, ${pos.longitude.toStringAsFixed(6)} (GPS)';
      }
    } catch (_) {
      if (mounted) {
        _locationCtrl.text = 'Trụ sở UBND Phường Phú Định, TP.HCM';
      }
    } finally {
      if (mounted) setState(() => _gettingLocation = false);
    }
  }

  Future<void> _submit() async {
    if (_selectedTask.isEmpty || _descCtrl.text.trim().isEmpty) return;
    setState(() => _loading = true);
    try {
      final storage = ref.read(secureStorageProvider);
      final dio = DioClient.getInstance(storage);
      await dio.post(ApiConstants.incidentReport, data: {
        'taskId': _selectedTask,
        'description': _descCtrl.text.trim(),
        'location': _locationCtrl.text.trim(),
      });
      if (mounted) {
        setState(() { _loading = false; _showSuccess = true; });
        await Future.delayed(const Duration(seconds: 2));
        if (mounted) context.pop();
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_showSuccess) {
      return Scaffold(
        backgroundColor: Colors.black54,
        body: Center(
          child: Container(
            margin: const EdgeInsets.all(32),
            padding: const EdgeInsets.all(32),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(20),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 64, height: 64,
                  decoration: const BoxDecoration(color: AppColors.success, shape: BoxShape.circle),
                  child: const Icon(Icons.check_circle, color: Colors.white, size: 40),
                ),
                const SizedBox(height: 12),
                const Text('Gửi Báo Cáo Thành Công!',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppColors.textPrimary)),
                const SizedBox(height: 8),
                const Text('Báo cáo của bạn đã được ghi nhận',
                  style: TextStyle(fontSize: 12, color: AppColors.textSecondary)),
              ],
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
                          Text('Báo Cáo Công Việc',
                            style: TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.bold)),
                          Text('Ghi âm, chụp hình, gọi SOS',
                            style: TextStyle(color: Colors.white70, fontSize: 12)),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),

          // ── Body ───────────────────────────────────────────────────────────
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // SOS Emergency button
                  GestureDetector(
                    onTap: () {
                      showDialog(
                        context: context,
                        builder: (_) => AlertDialog(
                          title: const Text('GỌI KHẨN CẤP SOS?'),
                          content: const Text('Bạn có chắc chắn muốn gọi điện khẩn cấp đến Công An Khu Vực?'),
                          actions: [
                            TextButton(onPressed: () => Navigator.pop(context), child: const Text('Hủy')),
                            ElevatedButton(
                              style: ElevatedButton.styleFrom(backgroundColor: AppColors.error),
                              onPressed: () => Navigator.pop(context),
                              child: const Text('Gọi ngay', style: TextStyle(color: Colors.white)),
                            ),
                          ],
                        ),
                      );
                    },
                    child: Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: AppColors.error,
                        borderRadius: BorderRadius.circular(12),
                        boxShadow: [BoxShadow(color: AppColors.error.withOpacity(0.3), blurRadius: 12, offset: const Offset(0, 4))],
                      ),
                      child: const Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.phone, color: Colors.white, size: 22),
                          SizedBox(width: 10),
                          Text('🚨 GỌI KHẨN CẤP SOS',
                            style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold, letterSpacing: 0.5)),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),

                  // Task selection
                  _SectionCard(
                    title: 'Chọn công việc *',
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                      decoration: BoxDecoration(
                        border: Border.all(color: AppColors.divider, width: 2),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: DropdownButtonHideUnderline(
                        child: DropdownButton<String>(
                          value: _selectedTask.isEmpty ? null : _selectedTask,
                          hint: const Text('Chọn công việc', style: TextStyle(color: AppColors.textMuted, fontSize: 13)),
                          isExpanded: true,
                          items: _tasks.map((t) => DropdownMenuItem(
                            value: t.$1,
                            child: Text(t.$2, style: const TextStyle(fontSize: 13)),
                          )).toList(),
                          onChanged: (v) => setState(() => _selectedTask = v ?? ''),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),

                  // Voice recording
                  _SectionCard(
                    title: 'Ghi âm giọng nói để báo cáo',
                    child: _hasVoiceNote
                        ? _buildVoiceNote()
                        : _buildVoiceRecorder(),
                  ),
                  const SizedBox(height: 12),

                  // Photo upload
                  _SectionCard(
                    title: 'Chụp hình hiện trạng',
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        GestureDetector(
                          onTap: () {
                            // Simulate adding a photo
                            setState(() => _photos.add('photo_${_photos.length + 1}'));
                          },
                          child: Container(
                            padding: const EdgeInsets.symmetric(vertical: 12),
                            decoration: BoxDecoration(
                              color: AppColors.success,
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: const Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(Icons.camera_alt, color: Colors.white, size: 20),
                                SizedBox(width: 8),
                                Text('Chụp Ảnh / Tải Lên',
                                  style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
                              ],
                            ),
                          ),
                        ),
                        if (_photos.isNotEmpty) ...[
                          const SizedBox(height: 10),
                          GridView.builder(
                            shrinkWrap: true,
                            physics: const NeverScrollableScrollPhysics(),
                            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                              crossAxisCount: 3,
                              mainAxisSpacing: 6,
                              crossAxisSpacing: 6,
                            ),
                            itemCount: _photos.length,
                            itemBuilder: (ctx, i) => Stack(
                              children: [
                                Container(
                                  decoration: BoxDecoration(
                                    color: AppColors.cardHover,
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: const Center(
                                    child: Icon(Icons.image, size: 32, color: AppColors.textSecondary),
                                  ),
                                ),
                                Positioned(
                                  top: 4, right: 4,
                                  child: GestureDetector(
                                    onTap: () => setState(() => _photos.removeAt(i)),
                                    child: Container(
                                      width: 20, height: 20,
                                      decoration: const BoxDecoration(color: AppColors.error, shape: BoxShape.circle),
                                      child: const Icon(Icons.close, size: 12, color: Colors.white),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text('${_photos.length} ảnh đã chọn',
                            style: const TextStyle(fontSize: 11, color: AppColors.textSecondary)),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),

                  // Description
                  _SectionCard(
                    title: 'Mô tả chi tiết (Tùy chọn)',
                    child: TextField(
                      controller: _descCtrl,
                      maxLines: 4,
                      onChanged: (_) => setState(() {}),
                      decoration: InputDecoration(
                        hintText: 'Nhập thông tin chi tiết về công việc...',
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(8),
                          borderSide: const BorderSide(color: AppColors.divider, width: 2),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(8),
                          borderSide: const BorderSide(color: AppColors.navy, width: 2),
                        ),
                        contentPadding: const EdgeInsets.all(12),
                      ),
                      style: const TextStyle(fontSize: 13),
                    ),
                  ),
                  const SizedBox(height: 12),

                  // Location
                  _SectionCard(
                    title: 'Vị trí thực hiện *',
                    child: Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _locationCtrl,
                            decoration: InputDecoration(
                              hintText: 'Nhập địa chỉ...',
                              prefixIcon: const Icon(Icons.location_on_outlined,
                                  color: AppColors.textSecondary, size: 18),
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(8),
                                borderSide: const BorderSide(color: AppColors.divider, width: 2),
                              ),
                              focusedBorder: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(8),
                                borderSide: const BorderSide(color: AppColors.navy, width: 2),
                              ),
                              contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                            ),
                            style: const TextStyle(fontSize: 13),
                          ),
                        ),
                        const SizedBox(width: 8),
                        GestureDetector(
                          onTap: _gettingLocation ? null : _getGPS,
                          child: Container(
                            padding: const EdgeInsets.all(10),
                            decoration: BoxDecoration(
                              color: AppColors.navy,
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: _gettingLocation
                                ? const SizedBox(width: 20, height: 20,
                                    child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                                : const Icon(Icons.my_location, color: Colors.white, size: 20),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Submit
                  GestureDetector(
                    onTap: (_loading || _selectedTask.isEmpty || _descCtrl.text.trim().isEmpty)
                        ? null
                        : _submit,
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      decoration: BoxDecoration(
                        color: (_selectedTask.isEmpty || _descCtrl.text.trim().isEmpty)
                            ? AppColors.textMuted
                            : AppColors.navy,
                        borderRadius: BorderRadius.circular(12),
                        boxShadow: [
                          if (_selectedTask.isNotEmpty && _descCtrl.text.isNotEmpty)
                            BoxShadow(color: AppColors.navy.withOpacity(0.3), blurRadius: 8, offset: const Offset(0, 4)),
                        ],
                      ),
                      child: _loading
                          ? const Center(child: SizedBox(width: 22, height: 22,
                              child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2)))
                          : const Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(Icons.send, color: Colors.white, size: 18),
                                SizedBox(width: 8),
                                Text('Gửi Báo Cáo',
                                  style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
                              ],
                            ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildVoiceRecorder() {
    if (_isRecording) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppColors.error.withOpacity(0.08),
              border: Border.all(color: AppColors.error, width: 2),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Column(
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Container(
                      width: 10, height: 10,
                      decoration: const BoxDecoration(color: AppColors.error, shape: BoxShape.circle),
                    ),
                    const SizedBox(width: 8),
                    const Text('Đang ghi âm...',
                      style: TextStyle(color: AppColors.error, fontWeight: FontWeight.bold, fontSize: 15)),
                  ],
                ),
                const SizedBox(height: 6),
                Text(_formatTime(_recordingSeconds),
                  style: const TextStyle(fontSize: 28, fontWeight: FontWeight.bold, color: AppColors.error,
                      fontFamily: 'monospace')),
              ],
            ),
          ),
          const SizedBox(height: 10),
          GestureDetector(
            onTap: _stopRecording,
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 12),
              decoration: BoxDecoration(color: AppColors.error, borderRadius: BorderRadius.circular(8)),
              child: const Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.stop_circle_outlined, color: Colors.white, size: 20),
                  SizedBox(width: 8),
                  Text('Dừng Ghi Âm',
                    style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
                ],
              ),
            ),
          ),
        ],
      );
    }

    return GestureDetector(
      onTap: _startRecording,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(color: AppColors.navy, borderRadius: BorderRadius.circular(8)),
        child: const Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.mic, color: Colors.white, size: 20),
            SizedBox(width: 8),
            Text('Bắt Đầu Ghi Âm',
              style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
          ],
        ),
      ),
    );
  }

  Widget _buildVoiceNote() => Container(
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(
      color: AppColors.success.withOpacity(0.08),
      border: Border.all(color: AppColors.success, width: 2),
      borderRadius: BorderRadius.circular(8),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Container(
              width: 40, height: 40,
              decoration: const BoxDecoration(color: AppColors.success, shape: BoxShape.circle),
              child: const Icon(Icons.mic, color: Colors.white, size: 20),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Ghi âm (${_formatTime(_recordingSeconds)})',
                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: AppColors.textPrimary)),
                  const Text('✓ Đã chuyển thành văn bản',
                    style: TextStyle(fontSize: 11, color: AppColors.success)),
                ],
              ),
            ),
            GestureDetector(
              onTap: _deleteVoice,
              child: Container(
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(
                  color: AppColors.error.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: const Icon(Icons.close, size: 16, color: AppColors.error),
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: AppColors.divider),
          ),
          child: Text(
            _descCtrl.text.length > 100
                ? '"${_descCtrl.text.substring(0, 100)}..."'
                : '"${_descCtrl.text}"',
            style: const TextStyle(fontSize: 12, color: AppColors.textSecondary, fontStyle: FontStyle.italic),
          ),
        ),
      ],
    ),
  );
}

// ── Helper Widget ─────────────────────────────────────────────────────────────
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
        Text(title,
          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: AppColors.textSecondary)),
        const SizedBox(height: 12),
        child,
      ],
    ),
  );
}
