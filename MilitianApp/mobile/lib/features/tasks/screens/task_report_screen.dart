import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:just_audio/just_audio.dart';
import 'package:geolocator/geolocator.dart';
import 'package:path_provider/path_provider.dart';
import 'package:dio/dio.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/network/dio_client.dart';
import '../../auth/providers/auth_provider.dart';

// record package removed: record_linux-0.7.2 incompatible with record_platform_interface-1.5.0
class _AudioRecorderStub {
  Future<bool> hasPermission() async => false;
  Future<void> start(dynamic config, {required String path}) async {}
  Future<String?> stop() async => null;
  void dispose() {}
}

class TaskReportScreen extends ConsumerStatefulWidget {
  final String taskId;
  const TaskReportScreen({super.key, required this.taskId});

  @override
  ConsumerState<TaskReportScreen> createState() => _TaskReportScreenState();
}

class _TaskReportScreenState extends ConsumerState<TaskReportScreen> {
  final _formKey = GlobalKey<FormState>();
  final _descCtrl = TextEditingController();
  final _locationCtrl = TextEditingController();

  // Task info (loaded from API)
  Map<String, dynamic>? _task;
  bool _loadingTask = true;

  // Photos
  final List<File> _photos = [];
  final _picker = ImagePicker();

  // Audio (recording disabled — record package removed for build compatibility)
  final _recorder = _AudioRecorderStub();
  final _player = AudioPlayer();
  String? _audioPath;
  bool _isRecording = false;
  bool _isPlaying = false;
  int _recordingSecs = 0;

  // Date/time
  DateTime _completedAt = DateTime.now();

  // Location presets
  static const _presets = [
    'Trụ sở',
    'Địa bàn A',
    'Địa bàn B',
    'Khu vực 1',
    'Khu vực 2',
  ];

  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _loadTask();
    _player.playerStateStream.listen((state) {
      if (!mounted) return;
      setState(() => _isPlaying = state.playing);
    });
  }

  @override
  void dispose() {
    _descCtrl.dispose();
    _locationCtrl.dispose();
    _recorder.dispose();
    _player.dispose();
    super.dispose();
  }

  Future<void> _loadTask() async {
    try {
      final storage = ref.read(secureStorageProvider);
      final dio = DioClient.getInstance(storage);
      final res = await dio.get('/tasks/${widget.taskId}');
      if (mounted) setState(() { _task = res.data as Map<String, dynamic>?; _loadingTask = false; });
    } catch (_) {
      if (mounted) setState(() => _loadingTask = false);
    }
  }

  Future<void> _pickPhoto() async {
    final xfile = await _picker.pickImage(
      source: ImageSource.camera,
      imageQuality: 80,
    );
    if (xfile == null) return;
    setState(() => _photos.add(File(xfile.path)));
  }

  Future<void> _startRecording() async {
    final hasPermission = await _recorder.hasPermission();
    if (!hasPermission) return;
    final dir = await getTemporaryDirectory();
    final path = '${dir.path}/task_voice_${DateTime.now().millisecondsSinceEpoch}.m4a';
    await _recorder.start(null, path: path);
    setState(() { _isRecording = true; _recordingSecs = 0; _audioPath = null; });
    // Count seconds
    _countRecordingSecs();
  }

  void _countRecordingSecs() async {
    while (_isRecording && mounted) {
      await Future.delayed(const Duration(seconds: 1));
      if (mounted && _isRecording) setState(() => _recordingSecs++);
    }
  }

  Future<void> _stopRecording() async {
    final path = await _recorder.stop();
    setState(() { _isRecording = false; _audioPath = path; });
  }

  Future<void> _playAudio() async {
    if (_audioPath == null) return;
    if (_isPlaying) {
      await _player.pause();
    } else {
      await _player.setFilePath(_audioPath!);
      await _player.play();
    }
  }

  void _deleteAudio() => setState(() { _audioPath = null; _isRecording = false; });

  Future<void> _getGPS() async {
    try {
      final pos = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.medium,
      );
      if (mounted) _locationCtrl.text = '${pos.latitude.toStringAsFixed(5)}, ${pos.longitude.toStringAsFixed(5)}';
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Không lấy được vị trí GPS')),
        );
      }
    }
  }

  Future<void> _pickDateTime() async {
    final date = await showDatePicker(
      context: context,
      initialDate: _completedAt,
      firstDate: DateTime.now().subtract(const Duration(days: 30)),
      lastDate: DateTime.now(),
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(_completedAt),
    );
    if (time == null) return;
    setState(() => _completedAt = DateTime(date.year, date.month, date.day, time.hour, time.minute));
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _submitting = true);
    try {
      final storage = ref.read(secureStorageProvider);
      final dio = DioClient.getInstance(storage);

      // Upload photos first
      final photoIds = <String>[];
      for (final photo in _photos) {
        final fd = FormData.fromMap({'file': await MultipartFile.fromFile(photo.path)});
        final res = await dio.post('/files/upload', data: fd);
        final fileId = (res.data as Map<String, dynamic>)['fileId'] as String?;
        if (fileId != null) photoIds.add(fileId);
      }

      // Upload audio if present
      String? audioNoteUrl;
      if (_audioPath != null) {
        final fd = FormData.fromMap({'file': await MultipartFile.fromFile(_audioPath!)});
        final res = await dio.post('/files/upload', data: fd);
        final data = res.data as Map<String, dynamic>;
        audioNoteUrl = data['url'] as String?;
      }

      await dio.post('/tasks/${widget.taskId}/report', data: {
        'description': _descCtrl.text.trim(),
        'completedAt': _completedAt.toIso8601String(),
        'location': _locationCtrl.text.trim().isNotEmpty ? _locationCtrl.text.trim() : null,
        'audioNoteUrl': audioNoteUrl,
        'photoIds': photoIds,
      });

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Báo cáo đã được gửi thành công!'),
          backgroundColor: AppColors.success,
        ),
      );
      Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Lỗi gửi báo cáo: $e'), backgroundColor: AppColors.error),
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Báo cáo nhiệm vụ', style: TextStyle(fontWeight: FontWeight.w700)),
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
      ),
      body: _loadingTask
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Task info card
                    if (_task != null) _TaskInfoCard(task: _task!),
                    const SizedBox(height: 16),

                    // Description
                    _SectionLabel('Mô tả kết quả *'),
                    TextFormField(
                      controller: _descCtrl,
                      maxLines: 4,
                      decoration: const InputDecoration(
                        hintText: 'Mô tả công việc đã thực hiện...',
                        border: OutlineInputBorder(),
                      ),
                      validator: (v) => (v == null || v.trim().length < 10)
                          ? 'Nhập ít nhất 10 ký tự'
                          : null,
                    ),
                    const SizedBox(height: 16),

                    // DateTime
                    _SectionLabel('Thời điểm hoàn thành'),
                    InkWell(
                      onTap: _pickDateTime,
                      child: InputDecorator(
                        decoration: const InputDecoration(
                          border: OutlineInputBorder(),
                          suffixIcon: Icon(Icons.calendar_today),
                        ),
                        child: Text(
                          '${_completedAt.day}/${_completedAt.month}/${_completedAt.year} ${_completedAt.hour.toString().padLeft(2, '0')}:${_completedAt.minute.toString().padLeft(2, '0')}',
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),

                    // Location
                    _SectionLabel('Vị trí'),
                    Row(
                      children: [
                        Expanded(
                          child: TextFormField(
                            controller: _locationCtrl,
                            decoration: const InputDecoration(
                              hintText: 'Nhập địa điểm hoặc chọn',
                              border: OutlineInputBorder(),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        IconButton.filled(
                          onPressed: _getGPS,
                          icon: const Icon(Icons.my_location),
                          style: IconButton.styleFrom(backgroundColor: AppColors.primary),
                        ),
                        const SizedBox(width: 4),
                        PopupMenuButton<String>(
                          icon: const Icon(Icons.arrow_drop_down_circle_outlined),
                          onSelected: (v) => _locationCtrl.text = v,
                          itemBuilder: (_) => _presets
                              .map((p) => PopupMenuItem(value: p, child: Text(p)))
                              .toList(),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),

                    // Photos
                    _SectionLabel('Ảnh đính kèm'),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        ..._photos.asMap().entries.map((e) => Stack(
                          children: [
                            ClipRRect(
                              borderRadius: BorderRadius.circular(8),
                              child: Image.file(e.value, width: 80, height: 80, fit: BoxFit.cover),
                            ),
                            Positioned(
                              top: 2, right: 2,
                              child: GestureDetector(
                                onTap: () => setState(() => _photos.removeAt(e.key)),
                                child: const CircleAvatar(
                                  radius: 10,
                                  backgroundColor: Colors.red,
                                  child: Icon(Icons.close, size: 12, color: Colors.white),
                                ),
                              ),
                            ),
                          ],
                        )),
                        if (_photos.length < 5)
                          GestureDetector(
                            onTap: _pickPhoto,
                            child: Container(
                              width: 80, height: 80,
                              decoration: BoxDecoration(
                                border: Border.all(color: AppColors.primary, width: 2),
                                borderRadius: BorderRadius.circular(8),
                                color: AppColors.primary.withOpacity(0.05),
                              ),
                              child: const Icon(Icons.add_a_photo, color: AppColors.primary),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 16),

                    // Voice note
                    _SectionLabel('Ghi âm báo cáo'),
                    _AudioRecorderWidget(
                      isRecording: _isRecording,
                      isPlaying: _isPlaying,
                      audioPath: _audioPath,
                      recordingSecs: _recordingSecs,
                      onStartRecord: _startRecording,
                      onStopRecord: _stopRecording,
                      onPlayAudio: _playAudio,
                      onDeleteAudio: _deleteAudio,
                    ),
                    const SizedBox(height: 24),

                    // Submit
                    SizedBox(
                      width: double.infinity,
                      height: 50,
                      child: ElevatedButton(
                        onPressed: _submitting ? null : _submit,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.primary,
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        ),
                        child: _submitting
                            ? const SizedBox(
                                width: 20, height: 20,
                                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                              )
                            : const Text('GỬI BÁO CÁO', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                      ),
                    ),
                    const SizedBox(height: 24),
                  ],
                ),
              ),
            ),
    );
  }
}

class _TaskInfoCard extends StatelessWidget {
  final Map<String, dynamic> task;
  const _TaskInfoCard({required this.task});

  @override
  Widget build(BuildContext context) {
    return Card(
      color: AppColors.primary.withOpacity(0.07),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              task['title'] as String? ?? 'Nhiệm vụ',
              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
            ),
            if (task['type'] != null)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text('Loại: ${task['type']}', style: const TextStyle(fontSize: 13, color: Colors.black54)),
              ),
          ],
        ),
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  final String text;
  const _SectionLabel(this.text);

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(text, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
      );
}

class _AudioRecorderWidget extends StatelessWidget {
  final bool isRecording;
  final bool isPlaying;
  final String? audioPath;
  final int recordingSecs;
  final VoidCallback onStartRecord;
  final VoidCallback onStopRecord;
  final VoidCallback onPlayAudio;
  final VoidCallback onDeleteAudio;

  const _AudioRecorderWidget({
    required this.isRecording,
    required this.isPlaying,
    required this.audioPath,
    required this.recordingSecs,
    required this.onStartRecord,
    required this.onStopRecord,
    required this.onPlayAudio,
    required this.onDeleteAudio,
  });

  String _fmtSecs(int s) => '${(s ~/ 60).toString().padLeft(2, '0')}:${(s % 60).toString().padLeft(2, '0')}';

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        border: Border.all(color: Colors.grey.shade300),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          if (isRecording) ...[
            const Icon(Icons.fiber_manual_record, color: Colors.red, size: 16),
            const SizedBox(width: 6),
            Text(_fmtSecs(recordingSecs), style: const TextStyle(fontWeight: FontWeight.w600)),
            const Spacer(),
            IconButton(onPressed: onStopRecord, icon: const Icon(Icons.stop_circle, color: Colors.red, size: 32)),
          ] else if (audioPath != null) ...[
            IconButton(
              onPressed: onPlayAudio,
              icon: Icon(isPlaying ? Icons.pause_circle : Icons.play_circle, color: AppColors.primary, size: 32),
            ),
            const SizedBox(width: 4),
            const Expanded(child: Text('Ghi âm sẵn sàng', style: TextStyle(fontWeight: FontWeight.w500))),
            IconButton(onPressed: onDeleteAudio, icon: const Icon(Icons.delete_outline, color: Colors.red)),
          ] else ...[
            const Icon(Icons.mic_none, color: Colors.grey),
            const SizedBox(width: 8),
            const Expanded(child: Text('Chưa có ghi âm', style: TextStyle(color: Colors.grey))),
            IconButton(onPressed: onStartRecord, icon: const Icon(Icons.mic, color: AppColors.primary, size: 32)),
          ],
        ],
      ),
    );
  }
}
