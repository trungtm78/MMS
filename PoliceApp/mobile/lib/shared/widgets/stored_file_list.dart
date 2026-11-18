import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/constants/app_colors.dart';
import '../../l10n/l10n.dart';
import '../errors/app_failure.dart';
import '../files/files.dart';

/// Hands a downloaded file to another app
typedef ShareFile = Future<void> Function(Uint8List bytes, {required String name, required String mimeType});

/// The system share sheet, where the user opens or saves a downloaded file. Tests override it, so no
/// platform channel is needed.
final shareFileProvider = Provider<ShareFile>((ref) => _shareWithSystem);

Future<void> _shareWithSystem(Uint8List bytes, {required String name, required String mimeType}) =>
    Share.shareXFiles([XFile.fromData(bytes, name: name, mimeType: mimeType)]);

/// The stored files of a record (task attachments, militia profile documents): images as thumbnails
/// that open the viewer ([AttachmentThumbnails]), other files as entries that download the content
/// with the session ([FilesApi.download]) and hand it to [shareFileProvider].
class StoredFileList extends ConsumerStatefulWidget {
  const StoredFileList({super.key, required this.files});

  final List<UploadedFile> files;

  @override
  ConsumerState<StoredFileList> createState() => _StoredFileListState();
}

class _StoredFileListState extends ConsumerState<StoredFileList> {
  final _opening = <String>{};

  Future<void> _open(UploadedFile file) async {
    final l10n = context.l10n;
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _opening.add(file.id));
    try {
      final bytes = await ref.read(filesApiProvider).download(file.id);
      await ref.read(shareFileProvider)(bytes, name: file.name, mimeType: file.mimeType);
    } catch (e) {
      messenger.showSnackBar(SnackBar(
        content: Text(l10n.commonFileOpenFailed(failureText(l10n, AppFailure.from(e)))),
        backgroundColor: AppColors.error,
      ));
    } finally {
      if (mounted) setState(() => _opening.remove(file.id));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final images = widget.files.where((f) => f.isImage).toList();
    final others = widget.files.where((f) => !f.isImage).toList();
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      if (images.isNotEmpty) AttachmentThumbnails(files: images),
      for (final file in others)
        ListTile(
          contentPadding: EdgeInsets.zero,
          leading: const Icon(Icons.insert_drive_file_outlined, color: AppColors.textSecondary),
          title: Text(file.name, maxLines: 1, overflow: TextOverflow.ellipsis),
          onTap: _opening.contains(file.id) ? null : () => _open(file),
          trailing: _opening.contains(file.id)
              ? const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2))
              : IconButton(
                  tooltip: l10n.commonFileOpenTooltip,
                  icon: const Icon(Icons.download_outlined),
                  onPressed: () => _open(file),
                ),
        ),
    ]);
  }
}
