import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_colors.dart';
import '../../../features/auth/providers/auth_provider.dart';
import '../../../l10n/l10n.dart';
import '../../../shared/errors/app_failure.dart';
import '../../../shared/widgets/app_header.dart';
import '../models/chat_models.dart';
import '../providers/chat_provider.dart';

/// Picks the people for a new conversation and creates it; pops the created [Conversation]
/// (or the pair's existing direct conversation, which the backend returns instead).
class NewConversationScreen extends ConsumerStatefulWidget {
  const NewConversationScreen({super.key});

  @override
  ConsumerState<NewConversationScreen> createState() => _NewConversationScreenState();
}

class _NewConversationScreenState extends ConsumerState<NewConversationScreen> {
  final _searchCtrl = TextEditingController();
  final _titleCtrl = TextEditingController();
  Timer? _debounce;

  bool _group = false;
  bool _searching = false;
  bool _creating = false;
  String _lastQuery = '';
  AppFailure? _searchError;
  AppFailure? _error;
  String? _myUserId;
  List<ChatParticipant> _results = [];
  final List<ChatParticipant> _selected = [];

  @override
  void initState() {
    super.initState();
    _loadMyUserId();
  }

  Future<void> _loadMyUserId() async {
    final uid = await ref.read(secureStorageProvider).getUserId();
    if (mounted) setState(() => _myUserId = uid);
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _searchCtrl.dispose();
    _titleCtrl.dispose();
    super.dispose();
  }

  void _onQueryChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), () => _search(value));
  }

  Future<void> _search(String value) async {
    final q = value.trim();
    _lastQuery = q;
    if (q.length < ChatApi.minSearchLength) {
      setState(() { _results = []; _searchError = null; _searching = false; });
      return;
    }
    setState(() { _searching = true; _searchError = null; });
    try {
      final people = await ref.read(chatApiProvider).searchParticipants(q, excludeUserId: _myUserId);
      // Ignore answers to an older query
      if (!mounted || q != _lastQuery) return;
      setState(() { _results = people; _searching = false; });
    } on ChatException catch (e) {
      if (!mounted || q != _lastQuery) return;
      setState(() { _results = []; _searching = false; _searchError = e.failure; });
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
        // A direct chat has exactly one other person
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
    setState(() { _creating = true; _error = null; });
    try {
      final conversation = await ref.read(chatApiProvider).createConversation(
            participantIds: _selected.map((p) => p.id).toList(),
            group: _group,
            title: _titleCtrl.text,
          );
      if (!mounted) return;
      Navigator.of(context).pop(conversation);
    } on ChatException catch (e) {
      if (mounted) setState(() { _error = e.failure; _creating = false; });
    }
  }

  Widget _buildResults(AppLocalizations l10n) {
    if (_searching) {
      return const Center(child: CircularProgressIndicator(color: AppColors.navy));
    }
    final searchError = _searchError;
    if (searchError != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(failureText(l10n, searchError),
              textAlign: TextAlign.center, style: const TextStyle(color: AppColors.error)),
        ),
      );
    }
    if (_lastQuery.length < ChatApi.minSearchLength) {
      return Center(
        child: Text(l10n.chatNewSearchTooShort(ChatApi.minSearchLength),
            style: const TextStyle(color: AppColors.textMuted)),
      );
    }
    if (_results.isEmpty) {
      return Center(
        child: Text(l10n.chatNewNoResults, style: const TextStyle(color: AppColors.textMuted)),
      );
    }
    return ListView.separated(
      itemCount: _results.length,
      separatorBuilder: (context, index) => const Divider(height: 1, indent: 72),
      itemBuilder: (context, i) {
        final person = _results[i];
        final selected = _selected.any((p) => p.id == person.id);
        final subtitle = person.subtitle;
        return ListTile(
          onTap: () => _toggle(person),
          leading: CircleAvatar(
            backgroundColor: AppColors.navy.withValues(alpha: 0.12),
            child: const Icon(Icons.person, color: AppColors.navy),
          ),
          title: Text(person.displayName),
          subtitle: subtitle == null || subtitle.isEmpty ? null : Text(subtitle),
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
    final error = _error;
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppHeader(title: l10n.chatNewTitle, showBack: true),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            SegmentedButton<bool>(
              segments: [
                ButtonSegment(
                    value: false, label: Text(l10n.chatConversationTypeDirect), icon: const Icon(Icons.person_outline)),
                ButtonSegment(
                    value: true, label: Text(l10n.chatConversationTypeGroup), icon: const Icon(Icons.group_outlined)),
              ],
              selected: {_group},
              onSelectionChanged: (s) => _setGroup(s.first),
            ),
            const SizedBox(height: 8),
            Text(
              _group ? l10n.chatNewInstructionGroup : l10n.chatNewInstructionDirect,
              style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
            ),
            if (_group) ...[
              const SizedBox(height: 8),
              TextField(
                key: const Key('group_title'),
                controller: _titleCtrl,
                maxLength: ChatApi.maxTitleLength,
                decoration: InputDecoration(labelText: l10n.chatNewGroupTitleLabel, counterText: ''),
              ),
            ],
            const SizedBox(height: 8),
            TextField(
              key: const Key('participant_search'),
              controller: _searchCtrl,
              onChanged: _onQueryChanged,
              maxLength: ChatApi.maxSearchLength,
              decoration: InputDecoration(
                hintText: l10n.chatNewSearchHint,
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
            if (error != null) ...[
              const SizedBox(height: 8),
              Text(failureText(l10n, error), style: const TextStyle(color: AppColors.error)),
            ],
          ]),
        ),
        const Divider(height: 1),
        Expanded(child: _buildResults(l10n)),
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
                        width: 20, height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : Text(l10n.chatNewCreate, style: const TextStyle(fontWeight: FontWeight.w700)),
              ),
            ),
          ),
        ),
      ]),
    );
  }
}
