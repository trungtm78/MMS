import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'dart:io';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_constants.dart';
import '../../../shared/widgets/app_header.dart';
import '../../auth/providers/auth_provider.dart';

class ReportWorkScreen extends ConsumerStatefulWidget {
  const ReportWorkScreen({super.key});

  @override
  ConsumerState<ReportWorkScreen> createState() => _ReportWorkScreenState();
}

class _ReportWorkScreenState extends ConsumerState<ReportWorkScreen> with SingleTickerProviderStateMixin {
  late TabController _tabCtrl;
  final _contentCtrl = TextEditingController();
  final _locationCtrl = TextEditingController();
  final _picker = ImagePicker();
  List<File> _images = [];
  bool _submitting = false;
  List<Map<String, dynamic>> _myReports = [];
  bool _loadingReports = true;

  static const _types = ['daily', 'incident', 'monthly'];
  static const _typeLabels = ['Hàng ngày', 'Sự vụ', 'Tháng'];

  @override
  void initState() {
    super.initState();
    _tabCtrl = TabController(length: 3, vsync: this);
    _loadReports();
  }

  @override
  void dispose() {
    _tabCtrl.dispose();
    _contentCtrl.dispose();
    _locationCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadReports() async {
    try {
      final dio = ref.read(dioProvider);
      final resp = await dio.get(ApiConstants.workReports);
      if (!mounted) return;
      setState(() {
        _myReports = List<Map<String, dynamic>>.from(resp.data['data'] as List? ?? []);
        _loadingReports = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() { _loadingReports = false; });
    }
  }

  Future<void> _pickImage() async {
    if (_images.length >= 5) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Tối đa 5 ảnh'), backgroundColor: AppColors.error),
      );
      return;
    }
    final picked = await _picker.pickImage(source: ImageSource.gallery, imageQuality: 80);
    if (picked == null) return;
    final file = File(picked.path);
    final size = await file.length();
    if (size > 5 * 1024 * 1024) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Ảnh quá lớn (tối đa 5MB mỗi ảnh)'), backgroundColor: AppColors.error),
      );
      return;
    }
    setState(() { _images.add(file); });
  }

  Future<void> _submit() async {
    if (_contentCtrl.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Nội dung báo cáo không được để trống'), backgroundColor: AppColors.error),
      );
      return;
    }
    setState(() { _submitting = true; });
    try {
      final dio = ref.read(dioProvider);
      await dio.post(ApiConstants.workReports, data: {
        'reportType': _types[_tabCtrl.index],
        'title': '${_typeLabels[_tabCtrl.index]} - ${DateTime.now().toIso8601String().substring(0, 10)}',
        'content': _contentCtrl.text.trim(),
      });

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Đã gửi báo cáo thành công'), backgroundColor: AppColors.success),
      );
      _contentCtrl.clear();
      _locationCtrl.clear();
      setState(() { _images = []; _submitting = false; });
      _loadReports();
    } catch (e) {
      if (!mounted) return;
      setState(() { _submitting = false; });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Lỗi: $e'), backgroundColor: AppColors.error),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: const AppHeader(title: 'Gửi báo cáo', showBack: false),
      body: Column(children: [
        // Type tabs
        Container(
          color: Colors.white,
          child: TabBar(
            controller: _tabCtrl,
            labelColor: AppColors.navy,
            unselectedLabelColor: AppColors.textSecondary,
            indicatorColor: AppColors.navy,
            tabs: _typeLabels.map((l) => Tab(text: l)).toList(),
          ),
        ),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              // Form
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Text('Địa điểm', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                    const SizedBox(height: 6),
                    TextField(
                      controller: _locationCtrl,
                      decoration: const InputDecoration(hintText: 'Nhập địa điểm (tùy chọn)'),
                    ),
                    const SizedBox(height: 16),
                    const Text('Nội dung *', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                    const SizedBox(height: 6),
                    TextField(
                      controller: _contentCtrl,
                      maxLines: 5,
                      decoration: const InputDecoration(hintText: 'Nhập nội dung báo cáo...'),
                    ),
                    const SizedBox(height: 16),
                    const Text('Hình ảnh đính kèm (tùy chọn, tối đa 5 ảnh)',
                        style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        ..._images.map((f) => Stack(
                          children: [
                            ClipRRect(
                              borderRadius: BorderRadius.circular(8),
                              child: Image.file(f, width: 80, height: 80, fit: BoxFit.cover),
                            ),
                            Positioned(
                              top: 0, right: 0,
                              child: GestureDetector(
                                onTap: () => setState(() => _images.remove(f)),
                                child: Container(
                                  decoration: const BoxDecoration(color: AppColors.error, shape: BoxShape.circle),
                                  child: const Icon(Icons.close, color: Colors.white, size: 16),
                                ),
                              ),
                            ),
                          ],
                        )),
                        if (_images.length < 5)
                          GestureDetector(
                            onTap: _pickImage,
                            child: Container(
                              width: 80, height: 80,
                              decoration: BoxDecoration(
                                color: AppColors.background,
                                borderRadius: BorderRadius.circular(8),
                                border: Border.all(color: AppColors.divider, width: 2, style: BorderStyle.solid),
                              ),
                              child: const Icon(Icons.add_photo_alternate_outlined, color: AppColors.textMuted, size: 32),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 20),
                    SizedBox(
                      width: double.infinity,
                      height: 48,
                      child: ElevatedButton.icon(
                        onPressed: _submitting ? null : _submit,
                        icon: _submitting
                            ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                            : const Icon(Icons.send),
                        label: const Text('GỬI BÁO CÁO', style: TextStyle(fontWeight: FontWeight.w700)),
                        style: ElevatedButton.styleFrom(backgroundColor: AppColors.tertiary, foregroundColor: Colors.white),
                      ),
                    ),
                  ]),
                ),
              ),
              const SizedBox(height: 16),
              const Text('BÁO CÁO ĐÃ GỬI',
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: AppColors.textSecondary)),
              const SizedBox(height: 8),
              if (_loadingReports)
                const Center(child: CircularProgressIndicator(color: AppColors.navy))
              else if (_myReports.isEmpty)
                const Text('Chưa có báo cáo', style: TextStyle(color: AppColors.textMuted))
              else
                ..._myReports.take(5).map((r) => Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    title: Text(r['content'] as String? ?? '', maxLines: 2, overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 13)),
                    subtitle: Text('${r['reportType']} · ${(r['createdAt'] as String? ?? '').substring(0, 10)}'),
                    trailing: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: (r['status'] == 'reviewed' ? AppColors.success : AppColors.warning).withOpacity(0.12),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        r['status'] == 'reviewed' ? 'Đã duyệt' : 'Chờ duyệt',
                        style: TextStyle(fontSize: 11,
                            color: r['status'] == 'reviewed' ? AppColors.success : AppColors.warning),
                      ),
                    ),
                  ),
                )),
            ],
          ),
        ),
      ]),
    );
  }
}
