import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/constants/app_colors.dart';
import '../../l10n/l10n.dart';
import 'attachment_uploads.dart';
import 'authenticated_image.dart';
import 'files_repository.dart';
import 'files_texts.dart';
import 'photo_picker.dart';

/// Photos being attached to a record: camera and library buttons, the count against the limit, and a
/// tile per photo with its upload state, retry when it failed, and removal. The picker comes from
/// [photoPickerProvider].
class AttachmentPickerField extends ConsumerWidget {
  const AttachmentPickerField({super.key, required this.uploads, this.enabled = true});

  final AttachmentUploads uploads;

  /// False while the record is being sent
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
    } on FilesException catch (e) {
      messenger.showSnackBar(
        SnackBar(content: Text(filesErrorText(l10n, e)), backgroundColor: AppColors.error),
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
                  key: ValueKey(item.key),
                  item: item,
                  enabled: enabled,
                  onRetry: () => uploads.retry(item),
                  onRemove: () => uploads.remove(item),
                ),
            ]),
          ],
          for (final item in items)
            if (item.status == AttachmentStatus.failed && item.error != null)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(l10n.filesUploadFailedItem(item.name, filesErrorText(l10n, item.error!)),
                    style: const TextStyle(fontSize: 12, color: AppColors.error)),
              ),
        ]);
      },
    );
  }
}

class _AttachmentTile extends StatelessWidget {
  const _AttachmentTile({
    super.key,
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
                : Image.memory(
                    bytes,
                    fit: BoxFit.cover,
                    gaplessPlayback: true,
                    semanticLabel: item.name,
                    errorBuilder: AuthenticatedImage.unreadable,
                  ),
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
