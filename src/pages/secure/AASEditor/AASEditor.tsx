import { useState, useCallback, useEffect } from 'react';
import {
  Box,
  Button,
  Chip,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  FormLabel,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextareaAutosize,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  AccountTreeRounded,
  AddRounded,
  CheckCircleRounded,
  CheckRounded,
  CloseRounded,
  DeleteRounded,
  EditRounded,
  ErrorOutlineRounded,
  ExpandMoreRounded,
  FormatListBulletedRounded,
  HistoryRounded,
  WarningAmberRounded,
  EditNoteRounded,
  ArchiveRounded,
  ArrowDropDownRounded,
} from '@mui/icons-material';

import VersionHistoryDrawer from './components/VersionHistoryDrawer';
import GraphView from './components/GraphView';

import { useAASContext, XsdValueType, AASModel, SubmodelTemplate, validateAAS, ValidationResult } from '@/context/AASContext';
import { useDialogContext } from '@/context/DialogContext';
import { useAASVersioning } from '@/hooks/useAASVersioning';
import { useCustomSnackbar } from '@/context/SnackbarContext';

import ValidationDialog from './dialogs/ValidationDialog';
import AddSubmodelDialog from './dialogs/AddSubmodelDialog';
import AddEntityDialog from './dialogs/AddEntityDialog';
import CommitDialog from './dialogs/CommitDialog';
import ConnectServerDialog from './dialogs/ConnectServerDialog';
import ConfirmExportDialog from './dialogs/ConfirmExportDialog';
import type { CommitStatus } from '@/hooks/useAASVersioning';
import { buildAasEnvironment } from '@/utils/aas-builder';
import { verifyWithLibrary } from '@/utils/aas-validation';
import { mapElement } from '@/utils/aas-mapper';

// ── Types ─────────────────────────────────────────────────────────────────────
type EditorView = 'list' | 'graph';

// ═══════════════════════
// MAIN PAGE COMPONENT
// ═══════════════════════

const XSD_TYPES: XsdValueType[] = ['xs:string', 'xs:int', 'xs:double', 'xs:float', 'xs:boolean', 'xs:date', 'xs:dateTime', 'xs:long', 'xs:short', 'xs:byte', 'xs:anyURI', 'xs:duration', 'xs:decimal'];

const NO_SUBMODELS: SubmodelTemplate[] = [];

export default function AASEditor() {
  const {
    selectedModelId, setSelectedModelId,
    availableModels,
    currentModel, currentVersion,
    createModel,
    deleteModel,
    updateCurrentModel,
    updateVersionStatus,
    addSubmodel, removeSubmodel, updateSubmodel, updateElement, updateChild,
    importAas, setSubmodels, refreshModels
  } = useAASContext();

  const submodels = currentModel?.submodels ?? NO_SUBMODELS;
  const aasIdShort = currentModel?.idShort ?? '';
  const aasAssetId = currentModel?.assetId ?? '';
  const aasDescription = currentModel?.description ?? '';

  const { setHandlers } = useDialogContext();
  const { createDocument, commitSubmodel } = useAASVersioning();
  const { showSnackbar } = useCustomSnackbar();

  const [editorView, setEditorView] = useState<EditorView>('list');
  const [statusMenuAnchor, setStatusMenuAnchor] = useState<null | HTMLElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [expandedSubmodels, setExpandedSubmodels] = useState<Set<string>>(new Set([submodels[0]?.id]));
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [showValidationDialog, setShowValidationDialog] = useState(false);
  const [initialValidationData, setInitialValidationData] = useState<Record<string, unknown> | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAddEntityDialog, setShowAddEntityDialog] = useState(false);
  const [showCommitDialog, setShowCommitDialog] = useState(false);
  const [showConnectDialog, setShowConnectDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [validationExpanded, setValidationExpanded] = useState(false);
  const [editingSmIdx, setEditingSmIdx] = useState<Set<number>>(new Set());

  useEffect(() => {
    setValidationResult(null);
    setValidationExpanded(false);
  }, [selectedModelId]);

  const toggleEditSm = (idx: number) =>
    setEditingSmIdx(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });

  const versionDocumentId = currentModel?.documentId ?? null;

  const handleValidateInline = useCallback(() => {
    // Authoring-intent checks (required, valueType, idShort format, duplicates)
    // plus the official IDTA metamodel verification from aas-core.
    const custom = validateAAS({ idShort: aasIdShort, assetId: aasAssetId }, submodels);
    const libErrors = verifyWithLibrary(
      aasIdShort, aasAssetId, aasDescription, currentModel?.assetKind ?? 'Instance', submodels
    );
    const seen = new Set(custom.errors.map(f => `${f.path}|${f.msg}`));
    const errors = [...custom.errors];
    for (const f of libErrors) {
      const key = `${f.path}|${f.msg}`;
      if (!seen.has(key)) { seen.add(key); errors.push(f); }
    }
    const result: ValidationResult = {
      errors, warnings: custom.warnings, infos: custom.infos, valid: errors.length === 0,
    };
    setValidationResult(result);
    setValidationExpanded(errors.length + result.warnings.length > 0);
    if (!result.valid) {
      const errorSmIndices = new Set(
        result.errors
          .map(f => f.path.match(/^SM\[(\d+)\]/)?.[1])
          .filter((v): v is string => v !== undefined)
      );
      setExpandedSubmodels(prev => {
        const next = new Set(prev);
        submodels.forEach((sm, i) => { if (errorSmIndices.has(String(i))) next.add(sm.id); });
        return next;
      });
    }
  }, [aasIdShort, aasAssetId, aasDescription, currentModel?.assetKind, submodels]);

  const handleExport = useCallback(() => {
    const env = buildAasEnvironment(aasIdShort, aasAssetId, aasDescription, currentModel?.assetKind ?? 'Instance', submodels);
    const data = JSON.stringify(env, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${aasIdShort || 'aas'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [aasIdShort, aasAssetId, aasDescription, currentModel?.assetKind, submodels]);

  // Register secondary menu handlers
  useEffect(() => {
    setHandlers({
      onValidateAAS: handleValidateInline,
      onConnectServer: () => setShowConnectDialog(true),
      onAddSubmodel: () => setShowAddDialog(true),
      onAddEntity: () => setShowAddEntityDialog(true),
      onExportAASX: () => setShowExportDialog(true),
    });
    return () => setHandlers({});
  }, [setHandlers, handleExport, handleValidateInline]);

  const handleSaveToServer = useCallback(async (
    message: string, version: string, revision: string, status: CommitStatus
  ) => {
    setIsSaving(true);
    setShowCommitDialog(false);
    try {
      const content = { submodels, idShort: aasIdShort, assetId: aasAssetId, description: aasDescription };

      if (!currentModel.documentId) {
        const res = await createDocument({
          id_short: aasIdShort,
          aas_id: currentModel.id,
          asset_id: aasAssetId,
          asset_kind: currentModel.assetKind,
          description: aasDescription,
          message,
          version,
          revision,
          content,
        });
        if (res.status !== 'Success') {
          showSnackbar(res.message || 'Errore durante il salvataggio', 'error');
          return;
        }
        const docId = res.data?.document?.document_id;
        if (docId) {
          // Adopt the server-normalized snapshot (with documentId) for this model,
          // replacing the local working copy now that it is persisted.
          await refreshModels(currentModel.id);
          showSnackbar('AAS salvato sul server', 'success');
        }
      } else {
        const res = await commitSubmodel(currentModel.documentId, {
          message,
          content,
          version,
          revision,
          status,
        });
        if (res.status !== 'Success') {
          showSnackbar(res.message || 'Errore durante il commit', 'error');
          return;
        }
        await refreshModels(currentModel.id);
        showSnackbar('Commit salvato sul server', 'success');
      }
    } catch (err: any) {
      showSnackbar(err?.message || 'Errore durante il salvataggio sul server', 'error');
    } finally {
      setIsSaving(false);
    }
  }, [aasIdShort, aasAssetId, aasDescription, submodels, currentModel, createDocument, commitSubmodel, refreshModels, showSnackbar]);

  // Empty state: no AAS model yet (fresh DB / nothing imported). Placed after
  // ALL hooks so the hook order never changes between renders; the "Nuova
  // entità" menu handler is already registered above, so it works here too.
  if (!currentModel) {
    return (
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
        <Stack alignItems="center" spacing={1.5} sx={{ maxWidth: 420, textAlign: 'center' }}>
          <Typography fontSize={48}>🗂️</Typography>
          <Typography variant="h6" fontWeight={600}>Nessun modello AAS</Typography>
          <Typography variant="body2" color="text.secondary">
            Crea una nuova entità AAS o importa un file JSON standard per iniziare.
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddRounded />}
            onClick={() => setShowAddEntityDialog(true)}
            sx={{ mt: 1 }}
          >
            Nuova entità
          </Button>
        </Stack>
        <AddEntityDialog
          open={showAddEntityDialog}
          onClose={() => setShowAddEntityDialog(false)}
          onAdd={createModel}
          onImport={importAas}
        />
      </Box>
    );
  }

  const toggleSubmodel = (id: string) => {
    setExpandedSubmodels(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Toolbar ── */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={1.5}
        sx={{ px: 3, py: 1.25, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper', flexShrink: 0 }}
      >
        <FormControl size="small">
          <Select
            value={selectedModelId}
            onChange={(e) => setSelectedModelId(e.target.value)}
            sx={{ fontFamily: 'monospace', fontSize: 11 }}
          >
            {availableModels.map(m => (
              <MenuItem key={m.id} value={m.id} sx={{ fontFamily: 'monospace', fontSize: 11 }}>
                {m.idShort.replace('AAS_', '')}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Tooltip title="Cambia stato del commit corrente" arrow>
          <Chip
            size="small"
            label={
              <Stack direction="row" alignItems="center" spacing={0.4}>
                <span>{currentVersion.status}</span>
                <ArrowDropDownRounded sx={{ fontSize: 16, ml: -0.25 }} />
              </Stack>
            }
            color={currentVersion.status === 'Active' ? 'success' : currentVersion.status === 'Draft' ? 'warning' : 'default'}
            variant="outlined"
            onClick={(e) => setStatusMenuAnchor(e.currentTarget)}
            sx={{ cursor: 'pointer', pr: 0.5 }}
          />
        </Tooltip>

        <Typography
          variant="caption"
          fontFamily="monospace"
          sx={{ px: 1, py: 0.25, border: 1, borderColor: 'divider', borderRadius: 1, color: 'text.secondary', userSelect: 'none' }}
        >
          v{currentVersion.version}&nbsp;rev.{currentVersion.revision}
        </Typography>

        <Menu
          anchorEl={statusMenuAnchor}
          open={Boolean(statusMenuAnchor)}
          onClose={() => setStatusMenuAnchor(null)}
          transformOrigin={{ horizontal: 'left', vertical: 'top' }}
          anchorOrigin={{ horizontal: 'left', vertical: 'bottom' }}
          slotProps={{ paper: { sx: { minWidth: 220, mt: 0.5 } } }}
        >
          <Box sx={{ px: 2, pt: 1.25, pb: 0.75 }}>
            <Typography variant="caption" color="text.disabled" fontWeight={700} textTransform="uppercase" letterSpacing={0.6}>
              Stato commit locale
            </Typography>
          </Box>
          {([
            { status: 'Draft',      icon: <EditNoteRounded fontSize="small" />,      color: 'warning.main', desc: 'In lavorazione, modificabile' },
            { status: 'Active',     icon: <CheckCircleRounded fontSize="small" />,   color: 'success.main', desc: 'Approvato e in uso operativo' },
            { status: 'Deprecated', icon: <ArchiveRounded fontSize="small" />,       color: 'text.disabled', desc: 'Sorpassato da versione più recente' },
          ] as const).map(({ status, icon, color, desc }) => (
            <MenuItem
              key={status}
              selected={currentVersion.status === status}
              onClick={() => { updateVersionStatus(status); setStatusMenuAnchor(null); }}
              sx={{ borderRadius: 1, mx: 0.5, mb: 0.25 }}
            >
              <ListItemIcon sx={{ color }}>{icon}</ListItemIcon>
              <ListItemText
                primary={status}
                secondary={desc}
                primaryTypographyProps={{ fontWeight: 700, fontSize: 13 }}
                secondaryTypographyProps={{ fontSize: 11 }}
              />
            </MenuItem>
          ))}
        </Menu>

        <Box flexGrow={1} />

        <ToggleButtonGroup
          size="small"
          exclusive
          value={editorView}
          onChange={(_, v) => v && setEditorView(v as EditorView)}
        >
          <ToggleButton value="list">
            <FormatListBulletedRounded sx={{ fontSize: 16, mr: 0.5 }} /> Lista
          </ToggleButton>
          <ToggleButton value="graph">
            <AccountTreeRounded sx={{ fontSize: 16, mr: 0.5 }} /> Grafo
          </ToggleButton>
        </ToggleButtonGroup>

        <Button
          variant={showHistory ? 'contained' : 'outlined'}
          size="small"
          startIcon={<HistoryRounded />}
          onClick={() => setShowHistory(v => !v)}
          sx={{ ml: 0.5 }}
        >
          History
        </Button>

        <Button
          variant="outlined"
          color="error"
          size="small"
          startIcon={<DeleteRounded />}
          onClick={() => setShowDeleteConfirm(true)}
          disabled={!currentModel}
        >
          Elimina
        </Button>
      </Stack>

      {/* ── Content ── */}
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>

        {/* Left: AAS Properties */}
        <Box
          sx={{
            width: 280,
            borderRight: 1,
            borderColor: 'divider',
            bgcolor: 'background.paper',
            overflowY: 'auto',
            p: 2.25,
            flexShrink: 0,
          }}
        >
          <Typography variant="overline" color="text.disabled" display="block" mb={1.5}>
            AAS Properties
          </Typography>
          <Stack spacing={1.5}>
            {([
              ['idShort', aasIdShort, (v: string) => updateCurrentModel({ idShort: v })],
              ['globalAssetId', aasAssetId, (v: string) => updateCurrentModel({ assetId: v })],
            ] as [string, string, (v: string) => void][]).map(([label, value, setter]) => (
              <Box key={label}>
                <FormLabel sx={{ fontSize: 10, mb: 0.5, display: 'block' }}>{label}</FormLabel>
                <TextField
                  value={value}
                  onChange={(e) => setter(e.target.value)}
                  size="small"
                  fullWidth
                  inputProps={{ style: { fontFamily: 'monospace', fontSize: 11 } }}
                />
              </Box>
            ))}
            <Box>
              <FormLabel sx={{ fontSize: 10, mb: 0.5, display: 'block' }}>description</FormLabel>
              {/* Frame replicating the theme's OutlinedInput so a standalone
                  TextareaAutosize matches the other fields' style. */}
              <Box
                sx={(theme) => ({
                  display: 'flex',
                  padding: '8px 12px',
                  color: (theme.vars || theme).palette.text.primary,
                  borderRadius: `${theme.shape.borderRadius}px`,
                  border: `1px solid ${(theme.vars || theme).palette.divider}`,
                  backgroundColor: (theme.vars || theme).palette.background.default,
                  transition: 'border 120ms ease-in',
                  fontFamily: 'monospace',
                  fontSize: 11,
                  '&:hover': { borderColor: (theme.vars || theme).palette.grey[500] },
                  '&:focus-within': {
                    outline: theme.vars
                      ? `3px solid rgba(${theme.vars.palette.primary.mainChannel} / 0.5)`
                      : `3px solid ${alpha(theme.palette.primary.main, 0.5)}`,
                    borderColor: (theme.vars || theme).palette.primary.light,
                  },
                })}
              >
                <TextareaAutosize
                  minRows={1}
                  maxRows={3}
                  value={aasDescription}
                  onChange={(e) => updateCurrentModel({ description: e.target.value })}
                  style={{
                    width: '100%',
                    margin: 0,
                    padding: 0,
                    color: 'inherit',
                    fontSize: 'inherit',
                    fontFamily: 'inherit',
                    lineHeight: 'inherit',
                    border: 'none',
                    outline: 'none',
                    resize: 'none',
                    background: 'transparent',
                    display: 'block',
                    boxSizing: 'border-box',
                  }}
                />
              </Box>
            </Box>
            <Box>
              <FormLabel sx={{ fontSize: 10, mb: 0.5, display: 'block' }}>assetKind</FormLabel>
              <TextField
                value={currentModel.assetKind}
                size="small"
                fullWidth
                inputProps={{ readOnly: true, style: { fontFamily: 'monospace', fontSize: 11 } }}
              />
            </Box>
          </Stack>

          <Paper variant="outlined" sx={{ mt: 2.5, p: 1.5 }}>
            <Typography variant="overline" color="text.disabled" display="block" mb={1}>
              Stats
            </Typography>
            {([
              ['Submodels', submodels.length],
              ['Properties', submodels.flatMap(s => s.elements).filter(e => e.type === 'Property').length],
              ['Collections', submodels.flatMap(s => s.elements).filter(e => e.type === 'SubmodelElementCollection').length],
            ] as [string, number][]).map(([k, v]) => (
              <Stack key={k} direction="row" justifyContent="space-between" mb={0.5}>
                <Typography variant="caption" color="text.secondary" fontFamily="monospace">{k}</Typography>
                <Typography variant="caption" color="primary.main" fontFamily="monospace">{v}</Typography>
              </Stack>
            ))}
          </Paper>
        </Box>

        {/* Right: Editor Area */}
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            border: '2px dashed',
            borderColor: dragOver ? 'primary.main' : 'transparent',
            bgcolor: dragOver ? 'rgba(99,102,241,.04)' : 'background.default',
            transition: 'all .2s',
            overflow: 'hidden',
          }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.getData('nt') === 'Submodel') setShowAddDialog(true);
          }}
        >
          {editorView === 'graph' ? (
            <GraphView aasId={aasIdShort} sms={submodels} />
          ) : (
            <>
              {/* Scrollable content area */}
              <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 3, pb: 1 }}>
              {/* ── Validation summary bar ── */}
              {validationResult && (
                <Paper
                  variant="outlined"
                  sx={{
                    mb: 2,
                    borderColor: validationResult.valid ? 'success.main' : 'error.main',
                    bgcolor: validationResult.valid ? 'rgba(16,185,129,.06)' : 'rgba(239,68,68,.06)',
                  }}
                >
                  <Box sx={{ px: 2, py: 1.25, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    {validationResult.valid
                      ? <CheckRounded sx={{ color: 'success.main', fontSize: 18 }} />
                      : <ErrorOutlineRounded sx={{ color: 'error.main', fontSize: 18 }} />}
                    <Box flex={1}>
                      {validationResult.valid ? (
                        validationResult.warnings.length > 0 ? (
                          <Typography variant="body2" color="warning.main" fontWeight={600}>
                            Conforme agli standard IDTA — {validationResult.warnings.length} {validationResult.warnings.length === 1 ? 'avviso' : 'avvisi'}
                          </Typography>
                        ) : (
                          <Typography variant="body2" color="success.main" fontWeight={600}>Modello conforme agli standard IDTA</Typography>
                        )
                      ) : (
                        <Stack direction="row" spacing={1.5} alignItems="center">
                          <Typography variant="body2" color="error.main" fontWeight={600}>
                            {validationResult.errors.length} {validationResult.errors.length === 1 ? 'errore' : 'errori'}
                          </Typography>
                          {validationResult.warnings.length > 0 && (
                            <Typography variant="body2" color="warning.main" fontWeight={600}>
                              {validationResult.warnings.length} {validationResult.warnings.length === 1 ? 'avviso' : 'avvisi'}
                            </Typography>
                          )}
                        </Stack>
                      )}
                    </Box>
                    {(validationResult.errors.length + validationResult.warnings.length) > 0 && (
                      <IconButton size="small" onClick={() => setValidationExpanded(e => !e)} sx={{ color: 'text.disabled' }}>
                        <ExpandMoreRounded sx={{ fontSize: 18, transition: 'transform .2s', transform: validationExpanded ? 'rotate(180deg)' : 'none' }} />
                      </IconButton>
                    )}
                    <IconButton size="small" onClick={() => setValidationResult(null)} sx={{ color: 'text.disabled' }}>
                      <CloseRounded sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Box>
                  <Collapse in={validationExpanded}>
                    <Stack spacing={0.5} sx={{ px: 2, pb: 1.5, pt: 0.5, borderTop: 1, borderColor: 'divider' }}>
                      {[
                        ...validationResult.errors.map(f => ({ ...f, sev: 'error' as const })),
                        ...validationResult.warnings.map(f => ({ ...f, sev: 'warning' as const })),
                      ].map((f, i) => (
                        <Stack key={i} direction="row" alignItems="flex-start" spacing={0.75} sx={{ mt: i === 0 ? 0.5 : 0 }}>
                          {f.sev === 'error'
                            ? <ErrorOutlineRounded sx={{ fontSize: 14, color: 'error.main', flexShrink: 0, mt: '2px' }} />
                            : <WarningAmberRounded sx={{ fontSize: 14, color: 'warning.main', flexShrink: 0, mt: '2px' }} />}
                          <Box>
                            <Typography variant="caption" color={f.sev === 'error' ? 'error.main' : 'warning.main'} fontWeight={600} sx={{ display: 'block' }}>
                              {f.msg}
                            </Typography>
                            <Typography variant="caption" color="text.disabled" fontFamily="monospace" sx={{ display: 'block' }}>
                              {f.path}
                            </Typography>
                          </Box>
                        </Stack>
                      ))}
                    </Stack>
                  </Collapse>
                </Paper>
              )}

              {!submodels.length && !dragOver && (
                <Stack alignItems="center" justifyContent="center" sx={{ height: '100%', minHeight: 200 }} spacing={0.75}>
                  <Typography fontSize={36}>🟩</Typography>
                  <Typography variant="body2" fontWeight={500} color="text.disabled">Trascina un Submodel qui</Typography>
                  <Typography variant="caption" fontFamily="monospace" color="text.disabled">oppure clicca + sotto</Typography>
                </Stack>
              )}

              {submodels.map((sm, idx) => {
                const isOpen = expandedSubmodels.has(sm.id);
                const isEditing = editingSmIdx.has(idx);
                const smPrefix = `SM[${idx}]`;
                const smErrors = validationResult?.errors.filter(f => f.path.startsWith(smPrefix)) ?? [];
                const smWarnings = validationResult?.warnings.filter(f => f.path.startsWith(smPrefix)) ?? [];
                return (
                  <Paper
                    key={sm.id}
                    variant="outlined"
                    sx={{
                      mb: 1.5,
                      overflow: 'hidden',
                      ...(smErrors.length > 0 && { borderColor: 'error.main', borderLeftWidth: 3 }),
                      ...(smErrors.length === 0 && smWarnings.length > 0 && { borderColor: 'warning.main', borderLeftWidth: 3 }),
                    }}
                  >
                    {/* Submodel header */}
                    <Stack
                      direction="row"
                      alignItems="center"
                      spacing={1.25}
                      sx={{
                        px: 2.25, py: 1.75,
                        cursor: 'pointer',
                        borderBottom: isOpen || isEditing ? 1 : 0,
                        borderColor: 'divider',
                      }}
                      onClick={() => toggleSubmodel(sm.id)}
                    >
                      <Typography fontSize={14}>🟩</Typography>
                      <Box flex={1} minWidth={0}>
                        <Typography variant="body2" fontWeight={600} noWrap>{sm.idShort}</Typography>
                        <Typography variant="caption" color="text.disabled" fontFamily="monospace" display="block" noWrap>
                          {sm.id}
                        </Typography>
                      </Box>
                      <Chip
                        size="small"
                        label={`${sm.elements?.length || 0} el`}
                        color="primary"
                        variant="outlined"
                        sx={{ fontFamily: 'monospace', fontSize: 10 }}
                      />
                      {smErrors.length > 0 && (
                        <Chip size="small" icon={<ErrorOutlineRounded />} label={smErrors.length} color="error" sx={{ fontSize: 10, height: 22 }} />
                      )}
                      {smWarnings.length > 0 && (
                        <Chip size="small" icon={<WarningAmberRounded />} label={smWarnings.length} color="warning" sx={{ fontSize: 10, height: 22 }} />
                      )}
                      <IconButton
                        size="small"
                        onClick={(e) => { e.stopPropagation(); toggleEditSm(idx); }}
                        sx={{ color: isEditing ? 'primary.main' : 'text.disabled' }}
                      >
                        <EditRounded sx={{ fontSize: 15 }} />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={(e) => { e.stopPropagation(); removeSubmodel(sm.id); }}
                        sx={{ color: 'text.disabled' }}
                      >
                        <DeleteRounded sx={{ fontSize: 15 }} />
                      </IconButton>
                      <ExpandMoreRounded
                        sx={{
                          color: 'text.secondary',
                          transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                          transition: 'transform 0.2s',
                          fontSize: 18,
                        }}
                      />
                    </Stack>

                    {/* Submodel identity edit */}
                    <Collapse in={isEditing}>
                      <Box sx={{ px: 2.25, py: 1.75, borderBottom: isOpen ? 1 : 0, borderColor: 'divider', bgcolor: 'action.hover' }}>
                        <Stack spacing={1.25}>
                          <Stack direction="row" spacing={1.25}>
                            <Box sx={{ flex: 1 }}>
                              <FormLabel sx={{ fontSize: 10, mb: 0.5, display: 'block' }}>idShort</FormLabel>
                              <TextField
                                size="small"
                                fullWidth
                                value={sm.idShort}
                                onChange={(e) => updateSubmodel(sm.id, { idShort: e.target.value })}
                                inputProps={{ style: { fontFamily: 'monospace', fontSize: 11 } }}
                              />
                            </Box>
                            <Box sx={{ flex: 2 }}>
                              <FormLabel sx={{ fontSize: 10, mb: 0.5, display: 'block' }}>id (AAS instance IRI)</FormLabel>
                              <TextField
                                size="small"
                                fullWidth
                                value={sm.id}
                                onChange={(e) => updateSubmodel(sm.id, { id: e.target.value })}
                                inputProps={{ style: { fontFamily: 'monospace', fontSize: 11 } }}
                              />
                            </Box>
                          </Stack>
                          <Box>
                            <FormLabel sx={{ fontSize: 10, mb: 0.5, display: 'block' }}>semanticId</FormLabel>
                            <TextField
                              size="small"
                              fullWidth
                              value={sm.semanticId}
                              onChange={(e) => updateSubmodel(sm.id, { semanticId: e.target.value })}
                              inputProps={{ style: { fontFamily: 'monospace', fontSize: 11 } }}
                            />
                          </Box>
                          <Box>
                            <FormLabel sx={{ fontSize: 10, mb: 0.5, display: 'block' }}>Descrizione</FormLabel>
                            <TextField
                              size="small"
                              fullWidth
                              value={sm.description}
                              onChange={(e) => updateSubmodel(sm.id, { description: e.target.value })}
                            />
                          </Box>
                        </Stack>
                      </Box>
                    </Collapse>

                    {/* Elements */}
                    {isOpen && (
                      <Box sx={{ p: 1.5 }}>
                        {(sm.elements || []).map((el, ei) => {
                          const typeColor: 'default' | 'warning' | 'info' =
                            el.type === 'SubmodelElementCollection' || el.type === 'SubmodelElementList' ? 'warning' :
                            el.type === 'Operation' ? 'info' : 'default';
                          const elErrors = validationResult?.errors.filter(
                            f => f.path.startsWith(smPrefix) && f.path.includes(`→ ${el.idShort}`)
                          ) ?? [];
                          const elWarnings = validationResult?.warnings.filter(
                            f => f.path.startsWith(smPrefix) && f.path.includes(`→ ${el.idShort}`)
                          ) ?? [];
                          return (
                            <Paper
                              key={ei}
                              variant="outlined"
                              sx={{
                                p: 1.5,
                                mb: 0.75,
                                ...(elErrors.length > 0 && { borderColor: 'error.main', bgcolor: 'rgba(239,68,68,.04)' }),
                                ...(elErrors.length === 0 && elWarnings.length > 0 && { borderColor: 'warning.main', bgcolor: 'rgba(245,158,11,.04)' }),
                              }}
                            >
                              <Stack direction="row" alignItems="center" spacing={1} mb={el.type === 'Property' ? 1 : 0}>
                                <Chip
                                  size="small"
                                  label={el.type}
                                  color={typeColor}
                                  variant="outlined"
                                  sx={{ fontFamily: 'monospace', fontSize: 9, height: 18 }}
                                />
                                <Typography variant="caption" fontWeight={600} fontFamily="monospace">
                                  {el.idShort}
                                </Typography>
                                {el.required && (
                                  <Typography variant="caption" color="error.main" fontWeight={700} sx={{ fontSize: 9 }}>
                                    REQ
                                  </Typography>
                                )}
                                <Box flex={1} />
                                {el.semanticId && (
                                  <Typography variant="caption" color="text.disabled" fontFamily="monospace" sx={{ fontSize: 9 }}>
                                    {el.semanticId}
                                  </Typography>
                                )}
                              </Stack>

                              {el.type === 'Property' && (
                                <Stack direction="row" spacing={1}>
                                  <TextField
                                    size="small"
                                    value={typeof el.value === 'string' ? el.value : ''}
                                    onChange={(e) => updateElement(sm.id, ei, 'value', e.target.value)}
                                    placeholder={`valore (${el.valueType || 'string'})…`}
                                    inputProps={{ style: { fontFamily: 'monospace', fontSize: 10 } }}
                                    sx={{ flex: 1 }}
                                  />
                                  <FormControl size="small" sx={{ minWidth: 130 }}>
                                    <Select
                                      value={el.valueType || 'xs:string'}
                                      onChange={(e) => updateElement(sm.id, ei, 'valueType', e.target.value)}
                                      sx={{ fontFamily: 'monospace', fontSize: 10 }}
                                    >
                                      {XSD_TYPES.map(t => (
                                        <MenuItem key={t} value={t} sx={{ fontFamily: 'monospace', fontSize: 10 }}>{t}</MenuItem>
                                      ))}
                                    </Select>
                                  </FormControl>
                                </Stack>
                              )}

                              {el.type === 'MultiLanguageProperty' && (
                                <Stack spacing={0.75} mt={0.5}>
                                  {(['en', 'it', 'de'] as const).map(lang => {
                                    const mlv = typeof el.value === 'object' && el.value !== null ? el.value as Record<string, string> : {};
                                    return (
                                      <Stack key={lang} direction="row" alignItems="center" spacing={0.75}>
                                        <Typography variant="caption" fontFamily="monospace" color="text.disabled" sx={{ width: 20, flexShrink: 0 }}>{lang}</Typography>
                                        <TextField
                                          size="small"
                                          fullWidth
                                          value={mlv[lang] || ''}
                                          onChange={(e) => updateElement(sm.id, ei, 'value', { ...mlv, [lang]: e.target.value })}
                                          placeholder={`testo (${lang})…`}
                                          inputProps={{ style: { fontSize: 10 } }}
                                        />
                                      </Stack>
                                    );
                                  })}
                                </Stack>
                              )}

                              {(el.type === 'SubmodelElementCollection' || el.type === 'SubmodelElementList') && el.children && (
                                <Box sx={{ mt: 0.75, pl: 1.5, borderLeft: '2px solid', borderColor: 'divider' }}>
                                  {el.children.map((ch, ci) => (
                                    <Stack key={ci} direction="row" alignItems="center" spacing={0.75} py={0.4}>
                                      <Typography variant="caption" fontFamily="monospace" color="text.secondary" sx={{ width: 130, flexShrink: 0 }}>
                                        {ch.idShort || `[${ci}]`}
                                        {ch.required && <Box component="span" color="error.main"> *</Box>}
                                        <Box component="span" color="text.disabled"> : {ch.type}</Box>
                                      </Typography>
                                      {ch.type === 'Property' && (
                                        <TextField
                                          size="small"
                                          fullWidth
                                          value={ch.value || ''}
                                          onChange={(e) => updateChild(sm.id, ei, ci, 'value', e.target.value)}
                                          placeholder={ch.valueType ? `(${ch.valueType})` : 'valore…'}
                                          inputProps={{ style: { fontFamily: 'monospace', fontSize: 10 } }}
                                        />
                                      )}
                                    </Stack>
                                  ))}
                                  {!el.children.length && (
                                    <Typography variant="caption" fontFamily="monospace" color="text.disabled">vuoto</Typography>
                                  )}
                                </Box>
                              )}

                              {elErrors.map((f, fi) => (
                                <Stack key={fi} direction="row" alignItems="center" spacing={0.5} mt={0.75}>
                                  <ErrorOutlineRounded sx={{ fontSize: 13, color: 'error.main', flexShrink: 0 }} />
                                  <Typography variant="caption" color="error.main" fontFamily="monospace">{f.msg}</Typography>
                                </Stack>
                              ))}
                              {elWarnings.map((f, fi) => (
                                <Stack key={fi} direction="row" alignItems="center" spacing={0.5} mt={0.75}>
                                  <WarningAmberRounded sx={{ fontSize: 13, color: 'warning.main', flexShrink: 0 }} />
                                  <Typography variant="caption" color="warning.main" fontFamily="monospace">{f.msg}</Typography>
                                </Stack>
                              ))}
                            </Paper>
                          );
                        })}
                        {!(sm.elements || []).length && (
                          <Typography variant="caption" fontFamily="monospace" color="text.disabled" textAlign="center" display="block" py={2.5}>
                            Submodel vuoto
                          </Typography>
                        )}
                      </Box>
                    )}
                  </Paper>
                );
              })}

              </Box>{/* end scrollable content */}

              {/* Fixed footer button */}
              <Box sx={{ flexShrink: 0, p: 2, pt: 1, borderTop: 1, borderColor: 'divider' }}>
                <Button
                  variant="outlined"
                  fullWidth
                  startIcon={<AddRounded />}
                  onClick={() => setShowAddDialog(true)}
                  sx={{ borderStyle: 'dashed', fontFamily: 'monospace' }}
                >
                  Aggiungi Submodel
                </Button>
              </Box>
            </>
          )}
        </Box>
      </Box>

      <ConnectServerDialog open={showConnectDialog} onClose={() => setShowConnectDialog(false)} />

      <ConfirmExportDialog
        open={showExportDialog}
        fileName={`${aasIdShort || 'aas'}.json`}
        onClose={() => setShowExportDialog(false)}
        onConfirm={() => { handleExport(); setShowExportDialog(false); }}
      />


      <AddSubmodelDialog open={showAddDialog} onClose={() => setShowAddDialog(false)} onAdd={addSubmodel} />
      <AddEntityDialog open={showAddEntityDialog} onClose={() => setShowAddEntityDialog(false)} onAdd={createModel} onImport={importAas} />

      <Dialog open={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)}>
        <DialogTitle>Elimina AAS</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Sei sicuro di voler eliminare "{currentModel?.idShort}"?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowDeleteConfirm(false)}>No</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => { deleteModel(); setShowDeleteConfirm(false); }}
          >
            Sì
          </Button>
        </DialogActions>
      </Dialog>
      <CommitDialog
        open={showCommitDialog}
        onClose={() => setShowCommitDialog(false)}
        isFirstSave={!currentModel.documentId}
        currentVersion={currentVersion.version}
        currentRevision={currentVersion.revision}
        currentStatus={currentVersion.status as CommitStatus}
        isSaving={isSaving}
        onCommit={({ message, version, revision, status }) => handleSaveToServer(message, version, revision, status)}
      />
      
      <ValidationDialog 
        open={showValidationDialog} 
        onClose={() => { setShowValidationDialog(false); setInitialValidationData(null); }} 
        initialValidationData={initialValidationData} 
        onImport={(rawData) => {
          const data = rawData as any;
          const shell = data.assetAdministrationShells?.[0];
          const importedModel: AASModel = {
            id: shell?.id || `imported-${Date.now()}`,
            idShort: shell?.idShort || 'Imported_AAS',
            assetId: shell?.assetInformation?.globalAssetId || '',
            description: shell?.description?.[0]?.text || '',
            assetKind: shell?.assetInformation?.assetKind || 'Instance',
            versions: [],
            isImported: true,
            submodels: (data.submodels || []).map((sm: any) => ({
              id: sm.id,
              idShort: sm.idShort,
              semanticId: sm.semanticId?.keys?.[0]?.value || '',
              description: sm.description?.[0]?.text || '',
              category: 'Imported',
              elements: (sm.submodelElements || []).map(mapElement)
            }))
          };
          importAas(importedModel);
          setShowValidationDialog(false);
        }}
      />

      <VersionHistoryDrawer
        open={showHistory}
        onClose={() => setShowHistory(false)}
        documentId={versionDocumentId}
        submodels={submodels}
        modelData={{
          idShort: aasIdShort,
          assetId: aasAssetId,
          assetKind: currentModel.assetKind,
          description: aasDescription,
        }}
        onAfterCommit={refreshModels}
        onOpenCommitDialog={() => setShowCommitDialog(true)}
        onDocumentCreated={(id) => updateCurrentModel({ documentId: id })}
        onCheckoutContent={(content) => {
          if (Array.isArray(content?.submodels)) {
            setSubmodels(content.submodels);
          }
        }}
      />
    </Box>
  );
}
