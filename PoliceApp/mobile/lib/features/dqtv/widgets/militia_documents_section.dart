import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/api_constants.dart';
import '../../../core/constants/app_colors.dart';
import '../../../l10n/l10n.dart';
import '../../../shared/errors/app_failure.dart';
import '../../../shared/files/files.dart';
import '../../../shared/widgets/stored_file_list.dart';
import '../../auth/providers/auth_provider.dart';

/// MILITIA_DOCUMENTS_PER_REQUEST (Web/backend/src/militia/militia.controller.ts)
const maxMilitiaDocumentsPerRequest = 10;

/// Whether the session may attach documents to a militia profile: POST /militia/:id/documents is for
/// MILITIA_STAFF_ROLES, never dqtv or dqtv_member. Every role the app signs in as CA is a staff role.
final canAttachMilitiaDocumentsProvider = Provider<bool>((ref) => ref.watch(authStateProvider).role == 'ca');

/// The documents of a militia profile (GET /militia/:id/documents, newest first) with the
/// authenticated download and viewer. Staff also add documents: uploads for the profile
/// (FilePurpose.militiaProfile), attached together by POST /militia/:id/documents {fileIds}.
class MilitiaDocumentsSection extends ConsumerStatefulWidget {
  const MilitiaDocumentsSection({super.key, required this.militiaId, this.readOnly = false});

  /// The militia profile id
  final String militiaId;

  /// Only lists the documents, whatever the session may do (a member's own profile)
  final bool readOnly;

  @override
  ConsumerState<MilitiaDocumentsSection> createState() => _MilitiaDocumentsSectionState();
}

class _MilitiaDocumentsSectionState extends ConsumerState<MilitiaDocumentsSection> {
  // Created only when staff pick documents: a read-only list never reads the files API, and dispose
  // must not create it (ref is unusable by then)
  AttachmentUploads? _uploadsOrNull;
  AttachmentUploads get _uploads => _uploadsOrNull ??= AttachmentUploads(
        api: ref.read(filesApiProvider),
        purpose: FilePurpose.militiaProfile,
        max: maxMilitiaDocumentsPerRequest,
      );
  List<UploadedFile> _documents = const [];
  AppFailure? _failure;
  bool _loading = true;
  bool _saving = false;

  String get _path => ApiConstants.militiaDocuments.replaceFirst('{id}', widget.militiaId);

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _uploadsOrNull?.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _failure = null;
    });
    try {
      final body = (await ref.read(dioProvider).get(_path)).data;
      if (body is! List) throw const FormatException('GET /militia/:id/documents: expected a list');
      if (!mounted) return;
      setState(() {
        _documents = UploadedFile.listFromJson(body);
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _failure = AppFailure.from(e);
        _loading = false;
      });
    }
  }

  /// The files are claimed in one transaction: a refused file attaches none, and the uploads stay
  Future<void> _save() async {
    final l10n = context.l10n;
    final messenger = ScaffoldMessenger.of(context);
    if (_uploads.isUploading) {
      messenger.showSnackBar(SnackBar(content: Text(l10n.dqtvDocumentsUploading)));
      return;
    }
    if (_uploads.hasFailures) {
      messenger.showSnackBar(
        SnackBar(content: Text(l10n.dqtvDocumentsUploadFailed), backgroundColor: AppColors.error),
      );
      return;
    }
    setState(() => _saving = true);
    try {
      await ref.read(dioProvider).post(_path, data: {'fileIds': _uploads.uploadedIds});
      if (!mounted) return;
      _uploads.clear();
      setState(() => _saving = false);
      messenger.showSnackBar(SnackBar(content: Text(l10n.dqtvDocumentsSaved), backgroundColor: AppColors.success));
      await _load();
    } catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      messenger.showSnackBar(SnackBar(
        content: Text(l10n.dqtvDocumentsSaveFailed(failureText(l10n, AppFailure.from(e)))),
        backgroundColor: AppColors.error,
      ));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final canAdd = !widget.readOnly && ref.watch(canAttachMilitiaDocumentsProvider);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(l10n.dqtvDocumentsTitle,
              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12, color: AppColors.textSecondary)),
          const Divider(height: 16),
          if (_loading)
            const Center(child: Padding(padding: EdgeInsets.all(8), child: CircularProgressIndicator()))
          else if (_failure != null)
            Row(children: [
              Expanded(
                child: Text(
                  l10n.dqtvDocumentsLoadFailed(failureText(l10n, _failure!)),
                  style: const TextStyle(color: AppColors.error, fontSize: 13),
                ),
              ),
              TextButton(onPressed: _load, child: Text(l10n.commonRetry)),
            ])
          else if (_documents.isEmpty)
            Text(l10n.dqtvDocumentsEmpty, style: const TextStyle(color: AppColors.textSecondary, fontSize: 13))
          else
            StoredFileList(files: _documents),
          if (canAdd) ...[
            const SizedBox(height: 12),
            AttachmentPickerField(uploads: _uploads, enabled: !_saving),
            ListenableBuilder(
              listenable: _uploads,
              builder: (context, _) => _uploads.items.isEmpty
                  ? const SizedBox.shrink()
                  : Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: ElevatedButton(
                        onPressed: _saving ? null : _save,
                        style: ElevatedButton.styleFrom(backgroundColor: AppColors.navy, foregroundColor: Colors.white),
                        child: Text(_saving ? l10n.dqtvDocumentsSaving : l10n.dqtvDocumentsSave),
                      ),
                    ),
            ),
          ],
        ]),
      ),
    );
  }
}
