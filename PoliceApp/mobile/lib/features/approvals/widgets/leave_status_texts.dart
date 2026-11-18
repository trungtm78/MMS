import '../../../l10n/l10n.dart';

/// Texts of leave request statuses; the model keeps the backend's codes
extension LeaveStatusTexts on AppLocalizations {
  /// pending | approved | rejected | cancelled (leave.service.ts); an unknown one shows as sent
  String leaveStatus(String status) => switch (status) {
        'pending' => approvalsLeaveStatusPending,
        'approved' => approvalsLeaveStatusApproved,
        'rejected' => approvalsLeaveStatusRejected,
        'cancelled' => approvalsLeaveStatusCancelled,
        _ => status,
      };
}
