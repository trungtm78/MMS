import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/constants/app_colors.dart';
import '../../l10n/l10n.dart';
import '../errors/app_failure.dart';
import 'attachment_uploads.dart';
import 'authenticated_image.dart';
import 'photo_picker.dart';
import 'uploaded_file.dart';

/// Thumbnails of a record's stored files: images through [AuthenticatedImage], opening
/// [showFileViewer] on tap; other files by name.
class AttachmentThumbnails extends StatelessWidget {
  const AttachmentThumbnails({super.key, required this.files, this.size = 64});

  final List<UploadedFile> files;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final file in files)
          if (file.isImage)
            GestureDetector(
              onTap: () => showFileViewer(context, file),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: AuthenticatedImage(fileId: file.id, width: size, height: size, semanticLabel: file.name),
              ),
            )
          else
            Container(
              constraints: const BoxConstraints(maxWidth: 220),
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
              decoration: BoxDecoration(
                color: AppColors.background,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: AppColors.divider),
              ),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                const Icon(Icons.insert_drive_file_outlined, size: 16, color: AppColors.textSecondary),
                const SizedBox(width: 4),
                Flexible(
                  child: Text(file.name,
                      maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12)),
                ),
              ]),
            ),
      ],
    );
  }
}

/// Shows a stored image full screen, zoomable, with its name
Future<void> showFileViewer(BuildContext context, UploadedFile file) => showDialog<void>(
      context: context,
      builder: (context) => Dialog.fullscreen(
        backgroundColor: Colors.black,
        child: Stack(children: [
          Positioned.fill(
            child: InteractiveViewer(
              maxScale: 5,
              child: AuthenticatedImage(fileId: file.id, fit: BoxFit.contain, semanticLabel: file.name),
            ),
          ),
          SafeArea(
            child: Row(children: [
              IconButton(
                tooltip: context.l10n.filesViewerClose,
                icon: const Icon(Icons.close, color: Colors.white),
                onPressed: () => Navigator.of(context).pop(),
              ),
              Expanded(
                child: Text(file.name,
                    maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white)),
              ),
            ]),
          ),
        ]),
      ),
    );

/// Photos being attached to a record: camera and gallery buttons, the count against the limit,
/// and a tile per photo with its upload state, retry when it failed, and removal.
class AttachmentPickerField extends ConsumerWidget {
  const AttachmentPickerField({super.key, required this.uploads, this.enabled = true});

  final AttachmentUploads uploads;

  /// False while the record is being submitted
  final bool enabled;

  Future<void> _pick(BuildContext context, WidgetRef ref, PhotoSource source) async {
    final l10n = context.l10n;
    final messenger = ScaffoldMessenger.of(context);
    try {
      final photos = await ref.read(photoPickerProvider).pick(source, max: uploads.remaining);
      if (!context.mounted) return;
      if (uploads.add(photos).skipped > 0) {
        messenger.showSnackBar(SnackBar(content: Text(l10n.filesAttachmentsLimitReached(uploads.max))));
      }
    } on AppFailure catch (failure) {
      messenger.showSnackBar(
        SnackBar(content: Text(failureText(l10n, failure)), backgroundColor: AppColors.error),
      );
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    return ListenableBuilder(
      listenable: uploads,
      builder: (context, _) {
        final items = uploads.items;
        final canAdd = enabled && uploads.remaining > 0;
        return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Wrap(spacing: 8, runSpacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [
            OutlinedButton.icon(
              onPressed: canAdd ? () => _pick(context, ref, PhotoSource.camera) : null,
              icon: const Icon(Icons.photo_camera_outlined),
              label: Text(l10n.filesPickCamera),
            ),
            OutlinedButton.icon(
              onPressed: canAdd ? () => _pick(context, ref, PhotoSource.gallery) : null,
              icon: const Icon(Icons.photo_library_outlined),
              label: Text(l10n.filesPickGallery),
            ),
            Text(l10n.filesAttachmentsCount(items.length, uploads.max),
                style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
          ]),
          if (items.isNotEmpty) ...[
            const SizedBox(height: 8),
            Wrap(spacing: 8, runSpacing: 8, children: [
              for (final item in items)
                _AttachmentTile(
                  item: item,
                  enabled: enabled,
                  onRetry: () => uploads.retry(item),
                  onRemove: () => uploads.remove(item),
                ),
            ]),
          ],
          for (final item in items)
            if (item.failure case final failure?)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(l10n.filesUploadFailedItem(item.name, failureText(l10n, failure)),
                    style: const TextStyle(fontSize: 12, color: AppColors.error)),
              ),
        ]);
      },
    );
  }
}

class _AttachmentTile extends StatelessWidget {
  const _AttachmentTile({
    required this.item,
    required this.enabled,
    required this.onRetry,
    required this.onRemove,
  });

  final AttachmentItem item;
  final bool enabled;
  final VoidCallback onRetry;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final bytes = item.bytes;
    return SizedBox.square(
      dimension: 84,
      child: Stack(children: [
        Positioned.fill(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: bytes == null
                ? const ColoredBox(color: AppColors.background)
                : Image.memory(bytes, fit: BoxFit.cover, gaplessPlayback: true, semanticLabel: item.name),
          ),
        ),
        if (item.status == AttachmentStatus.uploading)
          Positioned.fill(
            child: ColoredBox(
              color: Colors.black38,
              child: Center(
                child: SizedBox.square(
                  dimension: 24,
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: Colors.white, semanticsLabel: l10n.filesUploading),
                ),
              ),
            ),
          ),
        if (item.status == AttachmentStatus.failed)
          Positioned.fill(
            child: ColoredBox(
              color: AppColors.error.withValues(alpha: 0.6),
              child: Center(
                child: IconButton(
                  tooltip: l10n.filesUploadRetry,
                  onPressed: enabled ? onRetry : null,
                  icon: const Icon(Icons.refresh, color: Colors.white),
                ),
              ),
            ),
          ),
        Positioned(
          top: 0,
          right: 0,
          child: IconButton(
            tooltip: l10n.filesAttachmentRemove,
            visualDensity: VisualDensity.compact,
            onPressed: enabled ? onRemove : null,
            style: IconButton.styleFrom(backgroundColor: Colors.black54),
            icon: const Icon(Icons.close, size: 16, color: Colors.white),
          ),
        ),
      ]),
    );
  }
}
