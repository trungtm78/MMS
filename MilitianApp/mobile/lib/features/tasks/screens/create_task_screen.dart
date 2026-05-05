import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// DQTV members do not create tasks — only leaders/officers do (PoliceApp).
/// This screen was a UI placeholder with hardcoded assignees and fake success.
/// It is intentionally left as a "forbidden" screen so any stale router entry
/// surfaces visibly instead of letting members submit fake task data.
///
/// If task creation is ever needed for DQTV (e.g. self-reported activities),
/// design the proper flow + backend endpoint first; do not revive the fake screen.
class CreateTaskScreen extends ConsumerWidget {
  const CreateTaskScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(title: const Text('Tạo nhiệm vụ')),
      body: const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text(
            'Tính năng tạo nhiệm vụ chỉ dành cho cán bộ chỉ huy. '
            'DQTV nhận nhiệm vụ từ chỉ huy, không tự tạo.',
            textAlign: TextAlign.center,
          ),
        ),
      ),
    );
  }
}
