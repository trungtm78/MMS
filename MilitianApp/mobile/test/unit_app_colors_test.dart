// Unit Tests: status colours follow the codes the backend writes
//   tasks.status in_progress (Web/backend/migrations/003_tasks.sql:25), attendance and leave statuses
// Run: flutter test test/unit_app_colors_test.dart

import 'package:flutter_test/flutter_test.dart';
import 'package:militian_app/core/constants/app_colors.dart';

void main() {
  test('UT-COLOR-01: statusColor groups backend statuses', () {
    for (final s in ['on_time', 'completed', 'approved', 'checked_out']) {
      expect(AppColors.statusColor(s), AppColors.success, reason: s);
    }
    for (final s in ['late', 'pending', 'early_leave']) {
      expect(AppColors.statusColor(s), AppColors.warning, reason: s);
    }
    for (final s in ['overdue', 'rejected']) {
      expect(AppColors.statusColor(s), AppColors.error, reason: s);
    }
    for (final s in ['in_progress', 'checked_in']) {
      expect(AppColors.statusColor(s), AppColors.blue, reason: s);
    }
    // The old spelling is not a backend status
    expect(AppColors.statusColor('in-progress'), AppColors.textSecondary);
  });
}
