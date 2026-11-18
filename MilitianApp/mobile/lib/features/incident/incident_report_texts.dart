// Work report (incident report) wording: local checks and the report-specific reading of a refusal.
// Backend codes the error table knows (attachment codes, network failures) are worded by it
// (lib/l10n/error_texts.dart).

import '../../l10n/app_localizations.dart';
import '../../l10n/error_texts.dart';
import '../../shared/utils/api_failure.dart';
import 'repositories/incident_report_repository.dart';

String incidentReportIssueText(AppLocalizations l10n, IncidentReportIssue issue) => switch (issue) {
      IncidentReportIssue.titleRequired => l10n.incidentReportIssueTitleRequired,
      IncidentReportIssue.titleTooLong => l10n.incidentReportIssueTitleTooLong(IncidentReportRepository.maxTitleLength),
      IncidentReportIssue.contentRequired => l10n.incidentReportIssueContentRequired,
      IncidentReportIssue.contentTooLong =>
        l10n.incidentReportIssueContentTooLong(IncidentReportRepository.maxContentLength),
      IncidentReportIssue.locationRequired => l10n.incidentReportIssueLocationRequired,
      IncidentReportIssue.locationTooLong =>
        l10n.incidentReportIssueLocationTooLong(IncidentReportRepository.maxLocationLength),
      IncidentReportIssue.tooManyAttachments =>
        l10n.incidentReportIssueTooManyAttachments(IncidentReportRepository.maxAttachments),
      IncidentReportIssue.duplicateAttachments => l10n.incidentReportIssueDuplicateAttachments,
    };

/// Text for a report that was not sent:
/// - a local check: its issue;
/// - a 5xx: the report was not sent;
/// - a 400 validation_failed: the first class-validator message;
/// - a 400 whose code the error table does not know (it would only say "bad request"): the report
///   is invalid;
/// - anything else (attachment codes, 409 file_already_attached, network failures): the error table.
String incidentReportErrorText(AppLocalizations l10n, Object error) {
  if (error case IncidentReportException(issue: final IncidentReportIssue issue)) {
    return incidentReportIssueText(l10n, issue);
  }
  final failure = ApiFailure.from(error);
  final status = failure.status;
  if (failure.kind == FailureKind.response && status != null) {
    if (status >= 500) return l10n.incidentReportServerError;
    if (status == 400) {
      final detail = failure.firstValidationError;
      if (detail != null) return l10n.incidentReportInvalidDetail(detail);
      final text = failure.text(l10n);
      return text == l10n.errorStatusBadRequest ? l10n.incidentReportInvalid : text;
    }
  }
  return failure.text(l10n);
}
