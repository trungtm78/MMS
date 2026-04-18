// Unit Tests: AppColors helpers
// Task ID: TASK-2026-002
// Run: flutter test test/

import 'package:flutter_test/flutter_test.dart';
import 'package:police_app/core/constants/app_colors.dart';

void main() {
  group('AppColors.taskStatusColor', () {
    test('UT-COLOR-01: completed → success color', () {
      expect(AppColors.taskStatusColor('completed'), equals(AppColors.success));
    });
    test('UT-COLOR-02: in_progress → blue color', () {
      expect(AppColors.taskStatusColor('in_progress'), equals(AppColors.blue));
    });
    test('UT-COLOR-03: assigned → warning color', () {
      expect(AppColors.taskStatusColor('assigned'), equals(AppColors.warning));
    });
    test('UT-COLOR-04: overdue → error color', () {
      expect(AppColors.taskStatusColor('overdue'), equals(AppColors.error));
    });
    test('UT-COLOR-05: cancelled → textSecondary color', () {
      expect(AppColors.taskStatusColor('cancelled'), equals(AppColors.textSecondary));
    });
    test('UT-COLOR-06: unknown status → textMuted color', () {
      expect(AppColors.taskStatusColor('unknown_xyz'), equals(AppColors.textMuted));
    });
  });

  group('AppColors.taskStatusLabel', () {
    test('UT-LABEL-01: pending → Chờ giao', () {
      expect(AppColors.taskStatusLabel('pending'), equals('Chờ giao'));
    });
    test('UT-LABEL-02: assigned → Chưa tiếp nhận', () {
      expect(AppColors.taskStatusLabel('assigned'), equals('Chưa tiếp nhận'));
    });
    test('UT-LABEL-03: in_progress → Đang thực hiện', () {
      expect(AppColors.taskStatusLabel('in_progress'), equals('Đang thực hiện'));
    });
    test('UT-LABEL-04: completed → Hoàn thành', () {
      expect(AppColors.taskStatusLabel('completed'), equals('Hoàn thành'));
    });
    test('UT-LABEL-05: overdue → Trễ hạn', () {
      expect(AppColors.taskStatusLabel('overdue'), equals('Trễ hạn'));
    });
    test('UT-LABEL-06: cancelled → Đã hủy', () {
      expect(AppColors.taskStatusLabel('cancelled'), equals('Đã hủy'));
    });
    test('UT-LABEL-07: unknown → returns raw value', () {
      expect(AppColors.taskStatusLabel('raw_value'), equals('raw_value'));
    });
  });

  group('AppColors.kpiScoreColor — boundary values', () {
    // BR: score ≥ 90 → success, ≥ 80 → blue, ≥ 70 → warning, < 70 → error
    test('UT-KPI-01: score 90 (boundary) → success', () {
      expect(AppColors.kpiScoreColor(90.0), equals(AppColors.success));
    });
    test('UT-KPI-02: score 89.9 (below 90 boundary) → blue', () {
      expect(AppColors.kpiScoreColor(89.9), equals(AppColors.blue));
    });
    test('UT-KPI-03: score 80 (boundary) → blue', () {
      expect(AppColors.kpiScoreColor(80.0), equals(AppColors.blue));
    });
    test('UT-KPI-04: score 79.9 (below 80 boundary) → warning', () {
      expect(AppColors.kpiScoreColor(79.9), equals(AppColors.warning));
    });
    test('UT-KPI-05: score 70 (boundary) → warning', () {
      expect(AppColors.kpiScoreColor(70.0), equals(AppColors.warning));
    });
    test('UT-KPI-06: score 69.9 (below 70 boundary) → error', () {
      expect(AppColors.kpiScoreColor(69.9), equals(AppColors.error));
    });
    test('UT-KPI-07: score 100 → success', () {
      expect(AppColors.kpiScoreColor(100.0), equals(AppColors.success));
    });
    test('UT-KPI-08: score 0 → error', () {
      expect(AppColors.kpiScoreColor(0.0), equals(AppColors.error));
    });
  });

  group('AppColors.severityColor', () {
    test('UT-SEV-01: urgent → error', () {
      expect(AppColors.severityColor('urgent'), equals(AppColors.error));
    });
    test('UT-SEV-02: critical → error', () {
      expect(AppColors.severityColor('critical'), equals(AppColors.error));
    });
    test('UT-SEV-03: warning → warning', () {
      expect(AppColors.severityColor('warning'), equals(AppColors.warning));
    });
    test('UT-SEV-04: high → warning', () {
      expect(AppColors.severityColor('high'), equals(AppColors.warning));
    });
    test('UT-SEV-05: info → blue', () {
      expect(AppColors.severityColor('info'), equals(AppColors.blue));
    });
    test('UT-SEV-06: unknown → textSecondary', () {
      expect(AppColors.severityColor('unknown'), equals(AppColors.textSecondary));
    });
  });

  group('AppColors.leaveStatusColor', () {
    test('UT-LEAVE-01: approved → success', () {
      expect(AppColors.leaveStatusColor('approved'), equals(AppColors.success));
    });
    test('UT-LEAVE-02: rejected → error', () {
      expect(AppColors.leaveStatusColor('rejected'), equals(AppColors.error));
    });
    test('UT-LEAVE-03: pending → warning', () {
      expect(AppColors.leaveStatusColor('pending'), equals(AppColors.warning));
    });
    test('UT-LEAVE-04: unknown → textMuted', () {
      expect(AppColors.leaveStatusColor('unknown'), equals(AppColors.textMuted));
    });
  });

  group('AppColors.leaveStatusLabel', () {
    test('UT-LLABEL-01: pending → Chờ duyệt', () {
      expect(AppColors.leaveStatusLabel('pending'), equals('Chờ duyệt'));
    });
    test('UT-LLABEL-02: approved → Đã duyệt', () {
      expect(AppColors.leaveStatusLabel('approved'), equals('Đã duyệt'));
    });
    test('UT-LLABEL-03: rejected → Từ chối', () {
      expect(AppColors.leaveStatusLabel('rejected'), equals('Từ chối'));
    });
    test('UT-LLABEL-04: cancelled → Đã hủy', () {
      expect(AppColors.leaveStatusLabel('cancelled'), equals('Đã hủy'));
    });
    test('UT-LLABEL-05: unknown → returns raw value', () {
      expect(AppColors.leaveStatusLabel('xyz'), equals('xyz'));
    });
  });
}
