import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_colors.dart';
import '../../../l10n/l10n.dart';
import '../../../shared/widgets/app_header.dart';
import '../../auth/providers/auth_provider.dart';
import '../chat_texts.dart';
import '../models/conversation.dart';
import '../repositories/chat_repository.dart';

/// Picks the people for a conversation and opens it (POST /chat/conversations). Pops the
/// [Conversation] the server answered: a new one, or the pair's existing direct conversation.
class NewConversationScreen extends ConsumerStatefulWidget {
  const NewConversationScreen({super.key});

  @override
  ConsumerState<NewConversationScreen> createState() => _NewConversationScreenState();
}

class _NewConversationScreenState extends ConsumerState<NewConversationScreen> {
  static const _debounceDelay = Duration(milliseconds: 300);

  final _searchCtrl = TextEditingController();
  final _titleCtrl = TextEditingController();
  Timer? _debounce;

  bool _group = false;
  bool _searching = false;
  bool _creating = false;
  String _lastQuery = '';
  String? _searchError;
  String? _error;
  List<ChatParticipant> _results = [];
  final List<ChatParticipant> _selected = [];

  /// The signed-in user (secure storage), left out of the results
  late final Future<String?> _myUserId = ref.read(secureStorageProvider).getUserId();

  @override
  void dispose() {
    _debounce?.cancel();
    _searchCtrl.dispose();
    _titleCtrl.dispose();
    super.dispose();
  }

  void _onQueryChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(_debounceDelay, () => _search(value));
  }

  Future<void> _search(String value) async {
    final q = value.trim();
    _lastQuery = q;
    if (q.runes.length < ChatRepository.minSearchLength) {
      setState(() {
        _results = [];
        _searchError = null;
        _searching = false;
      });
      return;
    }
    setState(() {
      _searching = true;
      _searchError = null;
    });
    try {
      final people = await ref
          .read(chatRepositoryProvider)
          .searchParticipants(q, excludeUserId: await _myUserId);
      // Ignore answers to an older query
      if (!mounted || q != _lastQuery) return;
      setState(() {
        _results = people;
        _searching = false;
      });
    } catch (e) {
      if (!mounted || q != _lastQuery) return;
      setState(() {
        _results = [];
        _searching = false;
        _searchError = chatErrorText(context.l10n, e);
      });
    }
  }

  void _toggle(ChatParticipant person) {
    setState(() {
      _error = null;
      final index = _selected.indexWhere((p) => p.id == person.id);
      if (index >= 0) {
        _selected.removeAt(index);
      } else if (_group) {
        _selected.add(person);
      } else {
        // A direct chat has exactly one other person: the new pick replaces the previous one
        _selected
          ..clear()
          ..add(person);
      }
    });
  }

  void _setGroup(bool group) {
    setState(() {
      _group = group;
      _error = null;
      if (!group && _selected.length > 1) _selected.removeRange(1, _selected.length);
    });
  }

  bool get _canCreate => !_creating && (_group ? _selected.isNotEmpty : _selected.length == 1);

  Future<void> _create() async {
    setState(() {
      _creating = true;
      _error = null;
    });
    try {
      final opened = await ref.read(chatRepositoryProvider).createConversation(
            participantIds: _selected.map((p) => p.id).toList(),
            group: _group,
            title: _titleCtrl.text,
          );
      if (!mounted) return;
      Navigator.of(context).pop(opened);
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = chatErrorText(context.l10n, e);
          _creating = false;
        });
      }
    }
  }

  Widget _buildResults() {
    final l10n = context.l10n;
    if (_searching) {
      return const Center(child: CircularProgressIndicator(color: AppColors.navy));
    }
    if (_searchError != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(_searchError!, textAlign: TextAlign.center, style: const TextStyle(color: AppColors.error)),
        ),
      );
    }
    if (_lastQuery.runes.length < ChatRepository.minSearchLength) {
      return Center(
        child: Text(l10n.chatNewConversationSearchTooShort(ChatRepository.minSearchLength),
            style: const TextStyle(color: AppColors.textMuted)),
      );
    }
    if (_results.isEmpty) {
      return Center(
        child: Text(l10n.chatNewConversationNoResults, style: const TextStyle(color: AppColors.textMuted)),
      );
    }
    return ListView.separated(
      itemCount: _results.length,
      separatorBuilder: (context, index) => const Divider(height: 1, indent: 72),
      itemBuilder: (context, index) {
        final person = _results[index];
        final selected = _selected.any((p) => p.id == person.id);
        final username = person.username.trim();
        return ListTile(
          onTap: () => _toggle(person),
          leading: CircleAvatar(
            backgroundColor: AppColors.navy.withValues(alpha: 0.12),
            child: const Icon(Icons.person, color: AppColors.navy),
          ),
          title: Text(person.displayName),
          subtitle: username.isEmpty ? null : Text(username),
          trailing: Icon(
            selected ? Icons.check_circle : Icons.radio_button_unchecked,
            color: selected ? AppColors.navy : AppColors.textMuted,
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppHeader(title: l10n.chatNewConversationScreenTitle, showBack: true),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            SegmentedButton<bool>(
              segments: [
                ButtonSegment(
                    value: false, label: Text(l10n.chatNewConversationDirectSegment), icon: const Icon(Icons.person_outline)),
                ButtonSegment(
                    value: true, label: Text(l10n.chatNewConversationGroupSegment), icon: const Icon(Icons.group_outlined)),
              ],
              selected: {_group},
              onSelectionChanged: (s) => _setGroup(s.first),
            ),
            const SizedBox(height: 8),
            Text(
              _group ? l10n.chatNewConversationGroupHint : l10n.chatNewConversationDirectHint,
              style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
            ),
            if (_group) ...[
              const SizedBox(height: 8),
              TextField(
                key: const Key('group_title'),
                controller: _titleCtrl,
                maxLength: ChatRepository.maxTitleLength,
                decoration: InputDecoration(labelText: l10n.chatNewConversationGroupTitleLabel, counterText: ''),
              ),
            ],
            const SizedBox(height: 8),
            TextField(
              key: const Key('participant_search'),
              controller: _searchCtrl,
              onChanged: _onQueryChanged,
              // USER_SEARCH_MAX_LENGTH (Web/backend/src/users/users.service.ts)
              maxLength: ChatRepository.maxSearchLength,
              decoration: InputDecoration(
                hintText: l10n.chatNewConversationSearchHint,
                prefixIcon: const Icon(Icons.search),
                counterText: '',
              ),
            ),
            if (_selected.isNotEmpty) ...[
              const SizedBox(height: 8),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  for (final person in _selected)
                    InputChip(label: Text(person.displayName), onDeleted: () => _toggle(person)),
                ],
              ),
            ],
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(_error!, style: const TextStyle(color: AppColors.error)),
            ],
          ]),
        ),
        const Divider(height: 1),
        Expanded(child: _buildResults()),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton(
                onPressed: _canCreate ? _create : null,
                style: ElevatedButton.styleFrom(backgroundColor: AppColors.navy, foregroundColor: Colors.white),
                child: _creating
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : Text(l10n.chatNewConversationCreateButton, style: const TextStyle(fontWeight: FontWeight.w700)),
              ),
            ),
          ),
        ),
      ]),
    );
  }
}
