import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';

class StatusBadge extends StatelessWidget {
  final String status;
  final String label;
  final Color color;
  final double fontSize;

  const StatusBadge({
    super.key,
    required this.status,
    required this.label,
    required this.color,
    this.fontSize = 11,
  });

  factory StatusBadge.task(String status) => StatusBadge(
        status: status,
        label: AppColors.taskStatusLabel(status),
        color: AppColors.taskStatusColor(status),
      );

  factory StatusBadge.leave(String status) {
    return StatusBadge(
      status: status,
      label: AppColors.leaveStatusLabel(status),
      color: AppColors.leaveStatusColor(status),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color,
          fontSize: fontSize,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}
