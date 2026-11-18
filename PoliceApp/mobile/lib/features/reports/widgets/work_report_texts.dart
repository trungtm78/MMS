import 'package:flutter/material.dart';

import '../../../core/constants/app_colors.dart';
import '../../../l10n/l10n.dart';

/// Texts of work report data; the model keeps the backend's codes
extension WorkReportTexts on AppLocalizations {
  /// A report type (work-reports.dto.ts WORK_REPORT_TYPES); an unknown one shows as sent
  String workReportType(String type) => switch (type) {
        'daily' => reportsTypeDaily,
        'incident' => reportsTypeIncident,
        'monthly' => reportsTypeMonthly,
        _ => type,
      };

  /// A review status (work-reports.dto.ts REVIEW_STATUSES); an unknown one shows as sent
  String workReviewStatus(String status) => switch (status) {
        'pending' => reportsReviewStatusPending,
        'approved' => reportsReviewStatusApproved,
        'rejected' => reportsReviewStatusRejected,
        _ => status,
      };
}

Color workReviewStatusColor(String status) => switch (status) {
      'approved' => AppColors.success,
      'rejected' => AppColors.error,
      _ => AppColors.warning,
    };

/// A small rounded label: a report's type or review status
class WorkReportBadge extends StatelessWidget {
  const WorkReportBadge({super.key, required this.text, required this.color});

  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(text, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: color)),
    );
  }
}
