import 'package:flutter/material.dart';

class AppColors {
  AppColors._();

  // ─── Brand Core ─────────────────────────────────────────────────────────────
  static const primary       = Color(0xFFDC2626); // Red     — header border/text DQTV
  static const secondary     = Color(0xFFFBBF24); // Yellow  — gradient start
  static const gradientMid   = Color(0xFFFDE047); // gradient mid
  static const gradientEnd   = Color(0xFFFEF08A); // gradient end
  static const tertiary      = Color(0xFF15803D); // Green   — submit button, completed
  static const darkGreen     = Color(0xFF166534); // Darker green — button hover/border
  static const navy          = Color(0xFF366092); // Navy    — primary actions, active nav
  static const navyLight     = Color(0xFF4A90E2); // Light navy — gradient end, charts

  // ─── Semantic ────────────────────────────────────────────────────────────────
  static const background    = Color(0xFFF8FAFC); // Light gray — page background
  static const surface       = Color(0xFFFFFFFF); // White   — cards
  static const error         = Color(0xFFEF4444); // Red-500 — errors, SOS, urgent
  static const warning       = Color(0xFFF59E0B); // Amber   — pending, late
  static const success       = Color(0xFF10B981); // Emerald — completed, online
  static const blue          = Color(0xFF3B82F6); // Blue    — in-progress, notifications
  static const blueLight     = Color(0xFF60A5FA); // Blue-400— weather widget
  static const purple        = Color(0xFF8B5CF6); // Purple  — messages

  // ─── KPI Podium ──────────────────────────────────────────────────────────────
  static const gold          = Color(0xFFFFD700); // Gold    — #1 ranking
  static const silver        = Color(0xFFC0C0C0); // Silver  — #2 ranking
  static const bronze        = Color(0xFFCD7F32); // Bronze  — #3 ranking

  // ─── Text ────────────────────────────────────────────────────────────────────
  static const textPrimary   = Color(0xFF0F172A);
  static const textDark      = Color(0xFF1E293B);
  static const textSecondary = Color(0xFF64748B);
  static const textMuted     = Color(0xFF94A3B8);
  static const divider       = Color(0xFFE2E8F0);
  static const cardBorder    = Color(0xFFFDE047);

  // ─── Card backgrounds ────────────────────────────────────────────────────────
  static const cardYellowStart = Color(0xFFFEF9C3);
  static const cardYellowEnd   = Color(0xFFFEF3C7);
  static const cardBlueLight   = Color(0xFFEFF6FF); // selected item bg
  static const cardHover       = Color(0xFFF1F5F9);
  static const errorBg         = Color(0xFFFEF2F2);
  static const errorBorder     = Color(0xFFFEE2E2);

  // ─── Gradients ───────────────────────────────────────────────────────────────

  /// Yellow header gradient (DQTV screens)
  static const headerGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFFFBBF24), Color(0xFFFDE047), Color(0xFFFEF08A)],
  );

  /// Login card background gradient (light yellow)
  static const cardYellowGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFFFEF9C3), Color(0xFFFEF3C7)],
  );

  /// Check-in button gradient (navy blue)
  static const checkInGradient = LinearGradient(
    begin: Alignment.centerLeft,
    end: Alignment.centerRight,
    colors: [Color(0xFF366092), Color(0xFF4A90E2)],
  );

  /// Check-out button gradient (red → amber)
  static const checkOutGradient = LinearGradient(
    begin: Alignment.centerLeft,
    end: Alignment.centerRight,
    colors: [Color(0xFFEF4444), Color(0xFFF59E0B)],
  );

  /// Dark green button gradient (submit on Login, stats bars)
  static const greenGradient = LinearGradient(
    begin: Alignment.centerLeft,
    end: Alignment.centerRight,
    colors: [Color(0xFF15803D), Color(0xFF166534)],
  );

  /// Red SOS gradient (SOS card)
  static const sosGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFFEF4444), Color(0xFFDC2626)],
  );

  /// Weather widget gradient
  static const weatherGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF3B82F6), Color(0xFF60A5FA)],
  );

  // ─── Status helpers ──────────────────────────────────────────────────────────
  static Color statusColor(String status) {
    switch (status) {
      case 'on_time':
      case 'completed':
      case 'approved':
      case 'checked_out':
        return success;
      case 'late':
      case 'pending':
      case 'early_leave':
        return warning;
      case 'overdue':
      case 'rejected':
        return error;
      case 'in-progress':
      case 'checked_in':
        return blue;
      default:
        return textSecondary;
    }
  }

  static Color priorityColor(String priority) {
    switch (priority) {
      case 'urgent':
      case 'critical':
        return error;
      case 'high':
        return warning;
      case 'medium':
        return blue;
      default:
        return textMuted;
    }
  }

  static Color taskStatusColor(String status) {
    switch (status) {
      case 'completed': return success;
      case 'in_progress': return blue;
      case 'assigned': return warning;
      case 'overdue': return error;
      case 'cancelled': return textSecondary;
      default: return textMuted;
    }
  }

  static String taskStatusLabel(String status) {
    switch (status) {
      case 'pending': return 'Chờ giao';
      case 'assigned': return 'Chưa tiếp nhận';
      case 'in_progress': return 'Đang thực hiện';
      case 'completed': return 'Hoàn thành';
      case 'overdue': return 'Trễ hạn';
      case 'cancelled': return 'Đã hủy';
      default: return status;
    }
  }

  static Color kpiScoreColor(double score) {
    if (score >= 90) return success;
    if (score >= 80) return blue;
    if (score >= 70) return warning;
    return error;
  }

  static Color gpsStatusColor(String status) {
    switch (status) {
      case 'online': return success;
      case 'moving': return warning;
      default: return textMuted;
    }
  }

  static Color severityColor(String severity) {
    switch (severity) {
      case 'urgent':
      case 'critical': return error;
      case 'warning':
      case 'high': return warning;
      case 'info': return blue;
      default: return textSecondary;
    }
  }

  static Color leaveStatusColor(String status) {
    switch (status) {
      case 'approved': return success;
      case 'rejected': return error;
      case 'pending': return warning;
      default: return textMuted;
    }
  }

  static String leaveStatusLabel(String status) {
    switch (status) {
      case 'pending': return 'Chờ duyệt';
      case 'approved': return 'Đã duyệt';
      case 'rejected': return 'Từ chối';
      case 'cancelled': return 'Đã hủy';
      default: return status;
    }
  }
}
