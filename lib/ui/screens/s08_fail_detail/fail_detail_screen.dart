import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../data/models/audit_result.dart';
import '../../../data/models/photo.dart';
import '../../../data/photo_service.dart';
import '../../../data/repositories/audit_repository.dart';
import '../../../providers/draft_audit_provider.dart';
import '../../theme/app_colors.dart';

/// S8 Fail Detail — capture finding text, CRO involved, and evidence photos
/// for the current FAIL mark. S9 photo capture is collapsed into this screen
/// as an inline "Add photo" tile (still launches the OS camera).
///
/// Per Spec §5 S8:
///   * Finding text: required, ≤200 chars
///   * CRO involved: optional (from this audit's selected CROs)
///   * Photos: max 5; if checkpoint.requires_photo_on_fail = 1, at least one
///     photo must be attached before Save is allowed
class FailDetailScreen extends ConsumerStatefulWidget {
  const FailDetailScreen({super.key});

  @override
  ConsumerState<FailDetailScreen> createState() => _FailDetailScreenState();
}

class _FailDetailScreenState extends ConsumerState<FailDetailScreen> {
  final _findingController = TextEditingController();
  String? _selectedCroId;
  AuditResult? _result;
  List<Photo> _photos = const [];
  bool _saving = false;
  String? _error;

  static const _maxPhotos = 5;

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  @override
  void dispose() {
    _findingController.dispose();
    super.dispose();
  }

  Future<void> _bootstrap() async {
    final state = ref.read(draftAuditProvider);
    final cp = state.currentCheckpoint;
    final audit = state.audit;
    if (cp == null || audit == null) return;

    final result = await AuditRepository.instance.findResult(
      auditId: audit.id,
      checkpointId: cp.id,
    );
    if (result == null) return;
    final photos =
        await AuditRepository.instance.photosForResult(result.id);
    if (!mounted) return;
    setState(() {
      _result = result;
      _photos = photos;
      _findingController.text = result.findingText ?? '';
      _selectedCroId = result.croId;
    });
  }

  Future<void> _addPhoto() async {
    final result = _result;
    final audit = ref.read(draftAuditProvider).audit;
    if (result == null || audit == null) return;
    if (_photos.length >= _maxPhotos) return;

    final path = await PhotoService.instance.captureAndStore(
      auditId: audit.id,
    );
    if (path == null || !mounted) return;
    final size = await PhotoService.instance.fileSize(path);
    final photo = await AuditRepository.instance.attachPhoto(
      auditResultId: result.id,
      localPath: path,
      fileSizeBytes: size,
    );
    if (!mounted) return;
    setState(() => _photos = [..._photos, photo]);
  }

  Future<void> _save() async {
    final finding = _findingController.text.trim();
    final state = ref.read(draftAuditProvider);
    final cp = state.currentCheckpoint;
    if (cp == null) return;

    if (finding.length < 5) {
      setState(
        () => _error = 'Describe the finding (at least 5 characters).',
      );
      return;
    }
    if (finding.length > 200) {
      setState(() => _error = 'Finding must be 200 characters or fewer.');
      return;
    }
    if (cp.requiresPhotoOnFail && _photos.isEmpty) {
      setState(
        () => _error =
            'Photo evidence is required for this checkpoint (Cash / Inventory).',
      );
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });

    await ref.read(draftAuditProvider.notifier).completeFailDetail(
          findingText: finding,
          croId: _selectedCroId,
        );

    if (!mounted) return;
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(draftAuditProvider);
    final cp = state.currentCheckpoint;
    if (cp == null) {
      return const Scaffold(
        body: Center(child: Text('No active checkpoint')),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Fail — record finding'),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.redPale,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: AppColors.red),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.error_outline, color: AppColors.red),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        'CP ${cp.id} — ${cp.textEn}',
                        style: const TextStyle(
                          color: AppColors.red,
                          fontFamily: 'DMSans',
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),
              const Text(
                'What did you find?',
                style: TextStyle(
                  fontFamily: 'DMSerifDisplay',
                  fontSize: 18,
                  color: AppColors.navy,
                ),
              ),
              const SizedBox(height: 6),
              TextField(
                controller: _findingController,
                maxLength: 200,
                maxLines: 3,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(
                  hintText:
                      'e.g. CRO Suresh had no name badge at opening of shift',
                ),
              ),
              const SizedBox(height: 16),
              const Text(
                'CRO involved (optional)',
                style: TextStyle(
                  fontFamily: 'DMSans',
                  fontSize: 14,
                  color: AppColors.gray600,
                ),
              ),
              const SizedBox(height: 6),
              DropdownButtonFormField<String?>(
                value: _selectedCroId,
                items: [
                  const DropdownMenuItem<String?>(
                    value: null,
                    child: Text('— not attributed —'),
                  ),
                  for (final c in state.cros)
                    DropdownMenuItem<String?>(
                      value: c.id,
                      child: Text('${c.name}  ·  ${c.counter}'),
                    ),
                ],
                onChanged: (v) => setState(() => _selectedCroId = v),
              ),
              const SizedBox(height: 20),
              Row(
                children: [
                  const Text(
                    'Photo evidence',
                    style: TextStyle(
                      fontFamily: 'DMSerifDisplay',
                      fontSize: 18,
                      color: AppColors.navy,
                    ),
                  ),
                  const SizedBox(width: 8),
                  if (cp.requiresPhotoOnFail)
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: AppColors.red,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Text(
                        'REQUIRED',
                        style: TextStyle(
                          color: AppColors.white,
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 1,
                        ),
                      ),
                    ),
                  const Spacer(),
                  Text(
                    '${_photos.length} / $_maxPhotos',
                    style: const TextStyle(color: AppColors.gray600),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              _photoGrid(),
              if (_error != null) ...[
                const SizedBox(height: 12),
                Text(
                  _error!,
                  style: const TextStyle(color: AppColors.red),
                ),
              ],
              const SizedBox(height: 24),
              ElevatedButton(
                onPressed: _saving ? null : _save,
                child: _saving
                    ? const SizedBox(
                        height: 18,
                        width: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Save & next checkpoint'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _photoGrid() {
    return GridView.count(
      crossAxisCount: 3,
      crossAxisSpacing: 8,
      mainAxisSpacing: 8,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      children: [
        for (final ph in _photos)
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: Image.file(
              File(ph.localPath),
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => Container(
                color: AppColors.gray200,
                child: const Center(child: Icon(Icons.broken_image)),
              ),
            ),
          ),
        if (_photos.length < _maxPhotos)
          InkWell(
            onTap: _addPhoto,
            child: Container(
              decoration: BoxDecoration(
                color: AppColors.gray100,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: AppColors.gray300,
                  style: BorderStyle.solid,
                ),
              ),
              child: const Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.camera_alt_outlined,
                        color: AppColors.gray600),
                    SizedBox(height: 4),
                    Text(
                      'Add photo',
                      style: TextStyle(
                        fontSize: 12,
                        color: AppColors.gray600,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
      ],
    );
  }
}
