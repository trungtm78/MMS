// Files wording: local upload and picker issues. Backend codes (file_too_large, file_not_found,
// file_already_attached...) go through the one error table (lib/l10n/error_texts.dart).

import '../../l10n/app_localizations.dart';
import '../../l10n/error_texts.dart';
import 'files_repository.dart';

/// A local issue; the two the server also refuses read like its answer.
String filesIssueText(AppLocalizations l10n, FilesIssue issue) => switch (issue) {
      FilesIssue.fileEmpty => errorText(l10n, 'file_empty'),
      FilesIssue.fileTooLarge => errorText(l10n, 'file_too_large'),
      FilesIssue.unreadable => l10n.filesIssueUnreadable,
      FilesIssue.malformedResponse => l10n.filesIssueMalformedResponse,
      FilesIssue.photoAccessDenied => l10n.filesIssuePhotoAccessDenied,
      FilesIssue.photoPickFailed => l10n.filesIssuePhotoPickFailed,
    };

/// Text for any error of a files call: a local [FilesIssue], else the error table.
String filesErrorText(AppLocalizations l10n, Object error) => switch (error) {
      FilesException(issue: final FilesIssue issue) => filesIssueText(l10n, issue),
      _ => errorTextFor(l10n, error),
    };
