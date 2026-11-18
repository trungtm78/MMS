// Unit Tests: texts and colours of report and leave data, mapped in the UI layer
//   lib/features/reports/widgets/work_report_texts.dart, lib/features/approvals/widgets/leave_status_texts.dart
// Run: flutter test test/unit_reports_approvals_texts_test.dart

import 'package:flutter_test/flutter_test.dart';
import 'package:police_app/core/constants/app_colors.dart';
import 'package:police_app/features/approvals/widgets/leave_status_texts.dart';
import 'package:police_app/features/reports/widgets/work_report_texts.dart';

import 'helpers/l10n.dart';

void main() {
  test('UT-TXT-01: every work report type and review status has its text; unknown values show as sent', () {
    expect(viL10n.workReportType('daily'), viL10n.reportsTypeDaily);
    expect(viL10n.workReportType('incident'), viL10n.reportsTypeIncident);
    expect(viL10n.workReportType('monthly'), viL10n.reportsTypeMonthly);
    expect(viL10n.workReportType('weekly'), 'weekly');
    expect(viL10n.workReviewStatus('pending'), viL10n.reportsReviewStatusPending);
    expect(viL10n.workReviewStatus('approved'), viL10n.reportsReviewStatusApproved);
    expect(viL10n.workReviewStatus('rejected'), viL10n.reportsReviewStatusRejected);
    expect(viL10n.workReviewStatus('archived'), 'archived');
  });

  test('UT-TXT-02: review statuses keep their colours', () {
    expect(workReviewStatusColor('approved'), AppColors.success);
    expect(workReviewStatusColor('rejected'), AppColors.error);
    expect(workReviewStatusColor('pending'), AppColors.warning);
  });

  test('UT-TXT-03: every leave status has its text; an unknown one shows as sent', () {
    expect(viL10n.leaveStatus('pending'), viL10n.approvalsLeaveStatusPending);
    expect(viL10n.leaveStatus('approved'), viL10n.approvalsLeaveStatusApproved);
    expect(viL10n.leaveStatus('rejected'), viL10n.approvalsLeaveStatusRejected);
    expect(viL10n.leaveStatus('cancelled'), viL10n.approvalsLeaveStatusCancelled);
    expect(viL10n.leaveStatus('draft'), 'draft');
  });
}
