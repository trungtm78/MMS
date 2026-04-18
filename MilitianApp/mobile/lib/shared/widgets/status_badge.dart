import 'package:flutter/material.dart';

import '../../core/constants/app_colors.dart';

class StatusBadge extends StatelessWidget {
  final String label;
  final Color? color;

  const StatusBadge({super.key, required this.label, this.color});

  @override
  Widget build(BuildContext context) {
    final bg = color ?? AppColors.statusColor(label);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: bg.withOpacity(0.15),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: bg, width: 1),
      ),
      child: Text(
        label,
        style: TextStyle(color: bg, fontSize: 12, fontWeight: FontWeight.w600),
      ),
    );
  }
}
