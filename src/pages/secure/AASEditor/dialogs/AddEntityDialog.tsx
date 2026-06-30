import { useState, useRef, type ChangeEvent, type DragEvent } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  FormLabel,
  Grow,
  IconButton,
  MenuItem,
  Select,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  Alert,
} from '@mui/material';
import { AddRounded, CloseRounded, FileUploadRounded, UploadFileRounded } from '@mui/icons-material';
import type { AASModel, AssetKind, SubmodelTemplate } from '@/context/AASContext';
import { mapElement } from '@/utils/aas-mapper';

type Mode = 'create' | 'import';

interface AddEntityDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (data: { idShort: string; assetId: string; description: string; assetKind: AssetKind }) => void;
  onImport: (model: AASModel) => void;
}

function parseAasJson(raw: unknown): AASModel {
  const data = raw as any;
  const shell = data.assetAdministrationShells?.[0];
  if (!shell) throw new Error('Nessun assetAdministrationShell trovato nel JSON');

  return {
    id: shell.id || `imported-${Date.now()}`,
    idShort: shell.idShort || 'Imported_AAS',
    assetId: shell.assetInformation?.globalAssetId || '',
    description: shell.description?.[0]?.text || '',
    assetKind: (shell.assetInformation?.assetKind as AssetKind) || 'Instance',
    versions: [],
    isImported: true,
    submodels: ((data.submodels || []) as any[]).map((sm): SubmodelTemplate => ({
      id: sm.id,
      idShort: sm.idShort,
      semanticId: sm.semanticId?.keys?.[0]?.value || '',
      description: sm.description?.[0]?.text || '',
      category: 'Imported',
      elements: ((sm.submodelElements || []) as any[]).map(mapElement),
    })),
  };
}

export default function AddEntityDialog({ open, onClose, onAdd, onImport }: AddEntityDialogProps) {
  const [mode, setMode] = useState<Mode>('create');

  // create form state
  const [idShort, setIdShort] = useState('');
  const [assetId, setAssetId] = useState('urn:');
  const [description, setDescription] = useState('');
  const [assetKind, setAssetKind] = useState<AssetKind>('Instance');

  // import state
  const [dragOver, setDragOver] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<AASModel | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canAdd = idShort.trim().length > 0 && assetId.trim().length > 0;

  const reset = () => {
    setIdShort('');
    setAssetId('urn:');
    setDescription('');
    setAssetKind('Instance');
    setImportError(null);
    setImportPreview(null);
    setDragOver(false);
    setMode('create');
  };

  const handleClose = () => { reset(); onClose(); };

  const handleAdd = () => {
    if (!canAdd) return;
    onAdd({ idShort: idShort.trim(), assetId: assetId.trim(), description, assetKind });
    handleClose();
  };

  const processFile = (file: File) => {
    if (!file.name.endsWith('.json')) {
      setImportError('Il file deve essere in formato JSON');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target?.result as string);
        const model = parseAasJson(parsed);
        setImportPreview(model);
        setImportError(null);
      } catch (err) {
        setImportError(err instanceof Error ? err.message : 'Errore nel parsing del JSON');
        setImportPreview(null);
      }
    };
    reader.readAsText(file);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handleImport = () => {
    if (!importPreview) return;
    onImport(importPreview);
    handleClose();
  };

  return (
    <Dialog
      open={open}
      onClose={(_: unknown, reason: string) => { if (reason !== 'backdropClick') handleClose(); }}
      fullWidth
      maxWidth="sm"
      slots={{ transition: Grow }}
      slotProps={{ transition: { timeout: 250 } }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <AddRounded />
        <Box>
          <Typography variant="subtitle1" fontWeight={700} lineHeight={1.2}>Nuova Entità AAS</Typography>
          <Typography variant="caption" color="text.disabled" fontFamily="monospace">
            {mode === 'create' ? 'Crea un nuovo oggetto AAS' : 'Importa da file JSON'}
          </Typography>
        </Box>
        <Box flexGrow={1} />
        <IconButton size="small" onClick={handleClose}>
          <CloseRounded fontSize="small" />
        </IconButton>
      </DialogTitle>

      <Box px={3} pb={1}>
        <ToggleButtonGroup
          value={mode}
          exclusive
          onChange={(_, v) => { if (v) { setMode(v); setImportError(null); setImportPreview(null); } }}
          size="small"
          fullWidth
        >
          <ToggleButton value="create" sx={{ fontFamily: 'monospace', fontSize: 11 }}>
            <AddRounded fontSize="small" sx={{ mr: 0.5 }} />
            Crea da zero
          </ToggleButton>
          <ToggleButton value="import" sx={{ fontFamily: 'monospace', fontSize: 11 }}>
            <FileUploadRounded fontSize="small" sx={{ mr: 0.5 }} />
            Importa JSON
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <DialogContent>
        {mode === 'create' ? (
          <Stack spacing={2} pt={1}>
            <Box>
              <FormLabel sx={{ fontSize: 11, mb: 0.5, display: 'block' }}>idShort *</FormLabel>
              <TextField
                size="small"
                fullWidth
                value={idShort}
                placeholder="MyDevice"
                onChange={(e: ChangeEvent<HTMLInputElement>) => setIdShort(e.target.value)}
                slotProps={{ input: { style: { fontFamily: 'monospace', fontSize: 12 } } }}
              />
            </Box>

            <Box>
              <FormLabel sx={{ fontSize: 11, mb: 0.5, display: 'block' }}>globalAssetId *</FormLabel>
              <TextField
                size="small"
                fullWidth
                value={assetId}
                placeholder="urn:org:device:type:serial"
                onChange={(e: ChangeEvent<HTMLInputElement>) => setAssetId(e.target.value)}
                slotProps={{ input: { style: { fontFamily: 'monospace', fontSize: 12 } } }}
              />
            </Box>

            <Box>
              <FormLabel sx={{ fontSize: 11, mb: 0.5, display: 'block' }}>description</FormLabel>
              <TextField
                size="small"
                fullWidth
                multiline
                rows={3}
                value={description}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setDescription(e.target.value)}
              />
            </Box>

            <Box>
              <FormLabel sx={{ fontSize: 11, mb: 0.5, display: 'block' }}>assetKind</FormLabel>
              <Select
                size="small"
                fullWidth
                value={assetKind}
                onChange={(e) => setAssetKind(e.target.value as AssetKind)}
                sx={{ fontFamily: 'monospace', fontSize: 12 }}
              >
                <MenuItem value="Instance">Instance</MenuItem>
                <MenuItem value="Type">Type</MenuItem>
              </Select>
            </Box>
          </Stack>
        ) : (
          <Stack spacing={2} pt={1}>
            <Box
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              sx={{
                border: 2,
                borderStyle: 'dashed',
                borderColor: dragOver ? 'primary.main' : 'divider',
                borderRadius: 2,
                p: 4,
                textAlign: 'center',
                cursor: 'pointer',
                bgcolor: dragOver ? 'action.hover' : 'background.default',
                transition: 'all 0.15s ease',
                '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
              }}
            >
              <UploadFileRounded sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
              <Typography variant="body2" color="text.secondary">
                Trascina un file JSON qui oppure <strong>clicca per selezionare</strong>
              </Typography>
              <Typography variant="caption" color="text.disabled" fontFamily="monospace">
                Formato: AAS Environment JSON (IDTA)
              </Typography>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
            </Box>

            {importError && (
              <Alert severity="error" sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                {importError}
              </Alert>
            )}

            {importPreview && (
              <Alert severity="success" sx={{ fontSize: 12 }}>
                <Typography variant="caption" fontWeight={700} display="block">
                  Entità rilevata: {importPreview.idShort}
                </Typography>
                <Typography variant="caption" color="text.secondary" fontFamily="monospace" display="block">
                  assetId: {importPreview.assetId || '—'}
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block">
                  Submodel trovati: {importPreview.submodels.length}
                </Typography>
              </Alert>
            )}
          </Stack>
        )}
      </DialogContent>

      <Stack
        direction="row"
        justifyContent="flex-end"
        spacing={1}
        p={1.5}
        sx={{ borderTop: 1, borderColor: 'divider' }}
      >
        <Button onClick={handleClose}>Annulla</Button>
        {mode === 'create' ? (
          <Button
            variant="contained"
            disabled={!canAdd}
            startIcon={<AddRounded />}
            onClick={handleAdd}
          >
            Crea
          </Button>
        ) : (
          <Button
            variant="contained"
            disabled={!importPreview}
            startIcon={<FileUploadRounded />}
            onClick={handleImport}
          >
            Importa
          </Button>
        )}
      </Stack>
    </Dialog>
  );
}
