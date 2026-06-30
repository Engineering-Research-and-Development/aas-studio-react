import { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { useApiWrapper } from '@/api/apiWrapper';

// ═══════════════════════════════════
// TYPES
// ═══════════════════════════════════

export type VersionStatus = 'Draft' | 'Active' | 'Deprecated';
export type AssetKind = 'Instance' | 'Type';
export type ChangeType = 'added' | 'modified' | 'removed';
export type ElementType =
  | 'Property'
  | 'MultiLanguageProperty'
  | 'SubmodelElementCollection'
  | 'SubmodelElementList'
  | 'Operation'
  | 'File'
  | 'Blob'
  | 'ReferenceElement';
export type XsdValueType =
  | 'xs:string'
  | 'xs:int'
  | 'xs:double'
  | 'xs:float'
  | 'xs:boolean'
  | 'xs:date'
  | 'xs:dateTime'
  | 'xs:long'
  | 'xs:short'
  | 'xs:byte'
  | 'xs:anyURI'
  | 'xs:duration'
  | 'xs:decimal';

export interface ChangeDetail {
  type: ChangeType;
  target: string;
  name: string;
  desc: string;
}

export interface AASVersion {
  version: string;
  revision: string;
  date: string;
  status: VersionStatus;
  author: string;
  changes: string;
  details: ChangeDetail[];
}

export interface AASModel {
  id: string;
  idShort: string;
  assetId: string;
  description: string;
  assetKind: AssetKind;
  versions: AASVersion[];
  submodels: SubmodelTemplate[];
  isImported?: boolean;
  documentId?: number;
  /** Local working copy has uncommitted edits — must survive a server refresh. */
  dirty?: boolean;
}

export interface SubmodelElementChild {
  idShort: string;
  type: ElementType;
  valueType?: XsdValueType;
  semanticId?: string;
  required: boolean;
  value?: string;
}

export interface SubmodelElement {
  idShort: string;
  type: ElementType;
  valueType?: XsdValueType;
  semanticId?: string;
  required: boolean;
  value?: string | Record<string, string>;
  contentType?: string;
  children?: SubmodelElementChild[];
}

export interface SubmodelTemplate {
  id: string;
  idShort: string;
  semanticId: string;
  description: string;
  category: string;
  elements: SubmodelElement[];
}

export interface ValidationFinding {
  path: string;
  msg: string;
  rule: string;
}

export interface ValidationResult {
  errors: ValidationFinding[];
  warnings: ValidationFinding[];
  infos: ValidationFinding[];
  valid: boolean;
}

// ═══════════════════════════════════
// SUBMODEL CATALOG
// ═══════════════════════════════════

export const SM_CATALOG: SubmodelTemplate[] = [
  {
    id: 'smt-nameplate', idShort: 'Nameplate',
    semanticId: 'urn:idta:aas:submodel:Nameplate:1:0',
    description: 'Identificazione produttore IEC 61406', category: 'Identification',
    elements: [
      { idShort: 'ManufacturerName', type: 'MultiLanguageProperty', semanticId: '0173-1#02-AAO677#002', required: true },
      { idShort: 'ManufacturerProductDesignation', type: 'MultiLanguageProperty', semanticId: '0173-1#02-AAW338#001', required: true },
      { idShort: 'SerialNumber', type: 'Property', valueType: 'xs:string', semanticId: '0173-1#02-AAM556#002', required: false },
      { idShort: 'YearOfConstruction', type: 'Property', valueType: 'xs:string', semanticId: '0173-1#02-AAP906#001', required: false },
    ],
  },
  {
    id: 'smt-identification', idShort: 'Identification',
    semanticId: 'urn:idta:aas:submodel:Identification:1:0',
    description: 'Dati identificazione ECLASS', category: 'Identification',
    elements: [
      { idShort: 'ManufacturerId', type: 'Property', valueType: 'xs:string', semanticId: '0173-1#02-AAO677#002', required: true },
      { idShort: 'AssetId', type: 'Property', valueType: 'xs:string', semanticId: 'urn:idta:id:AssetId', required: true },
      { idShort: 'ProductType', type: 'Property', valueType: 'xs:string', semanticId: '0173-1#02-AAO057#002', required: false },
    ],
  },
  {
    id: 'smt-techdata', idShort: 'TechnicalData',
    semanticId: 'urn:idta:aas:submodel:TechnicalData:1:2',
    description: 'Proprietà tecniche IEC 61360', category: 'Technical',
    elements: [
      {
        idShort: 'GeneralInformation', type: 'SubmodelElementCollection', semanticId: 'urn:idta:td:GeneralInfo', required: true,
        children: [
          { idShort: 'ManufacturerName', type: 'Property', valueType: 'xs:string', required: true },
          { idShort: 'ProductArticleNumber', type: 'Property', valueType: 'xs:string', required: false },
        ],
      },
      { idShort: 'TechnicalProperties', type: 'SubmodelElementCollection', semanticId: 'urn:idta:td:TechProps', required: true, children: [] },
    ],
  },
  {
    id: 'smt-documentation', idShort: 'HandoverDocumentation',
    semanticId: 'urn:idta:aas:submodel:HandoverDocumentation:1:2',
    description: 'Documentazione tecnica', category: 'Documentation',
    elements: [
      {
        idShort: 'DocumentationCollection', type: 'SubmodelElementCollection', semanticId: 'urn:idta:doc:Collection', required: true,
        children: [
          { idShort: 'DocumentId', type: 'Property', valueType: 'xs:string', required: true },
          { idShort: 'DocumentTitle', type: 'MultiLanguageProperty', required: true },
          { idShort: 'DocumentFile', type: 'File', required: true },
        ],
      },
    ],
  },
  {
    id: 'smt-opdata', idShort: 'OperationalData',
    semanticId: 'urn:idta:aas:submodel:OperationalData:1:0',
    description: 'Dati operativi real-time', category: 'Operational',
    elements: [
      { idShort: 'OperatingHours', type: 'Property', valueType: 'xs:double', semanticId: '0173-1#02-AAV184#001', required: false },
      { idShort: 'CycleCount', type: 'Property', valueType: 'xs:int', semanticId: 'urn:idta:op:CycleCount', required: false },
      { idShort: 'CurrentTemperature', type: 'Property', valueType: 'xs:double', semanticId: '0173-1#02-AAV232#001', required: false },
    ],
  },
  {
    id: 'smt-maintenance', idShort: 'PredictiveMaintenance',
    semanticId: 'urn:idta:aas:submodel:PredictiveMaintenance:1:0',
    description: 'Manutenzione predittiva', category: 'Maintenance',
    elements: [
      {
        idShort: 'MaintenanceSchedule', type: 'SubmodelElementCollection', semanticId: 'urn:idta:pm:Schedule', required: true,
        children: [
          { idShort: 'NextMaintenanceDate', type: 'Property', valueType: 'xs:date', required: true },
          { idShort: 'MaintenanceInterval', type: 'Property', valueType: 'xs:duration', required: false },
        ],
      },
      { idShort: 'RemainingUsefulLife', type: 'Property', valueType: 'xs:double', semanticId: 'urn:idta:pm:RUL', required: false },
      { idShort: 'HealthIndex', type: 'Property', valueType: 'xs:double', semanticId: 'urn:idta:pm:HealthIndex', required: false },
    ],
  },
  {
    id: 'smt-carbonfoot', idShort: 'CarbonFootprint',
    semanticId: 'urn:idta:aas:submodel:CarbonFootprint:1:0',
    description: 'PCF Catena-X', category: 'Sustainability',
    elements: [
      {
        idShort: 'PCFCalculation', type: 'SubmodelElementCollection', semanticId: 'urn:idta:cf:PCF', required: true,
        children: [
          { idShort: 'CO2EquivalentTotal', type: 'Property', valueType: 'xs:double', required: true },
          { idShort: 'ReferenceUnit', type: 'Property', valueType: 'xs:string', required: true },
        ],
      },
    ],
  },
  {
    id: 'smt-bom', idShort: 'BillOfMaterial',
    semanticId: 'urn:idta:aas:submodel:BOM:1:0',
    description: 'Distinta base (BOM)', category: 'Structure',
    elements: [
      {
        idShort: 'BOMEntries', type: 'SubmodelElementCollection', semanticId: 'urn:idta:bom:Entries', required: true,
        children: [
          { idShort: 'PartNumber', type: 'Property', valueType: 'xs:string', required: true },
          { idShort: 'Quantity', type: 'Property', valueType: 'xs:int', required: true },
          { idShort: 'PartReference', type: 'ReferenceElement', required: false },
        ],
      },
    ],
  },
];

// ═══════════════════════════════════
// API → MODEL MAPPER
// ═══════════════════════════════════

export function mapDocumentToModel(doc: any, submodels: SubmodelTemplate[] = []): AASModel {
  const head = doc.head;
  return {
    id: doc.aas_id,
    documentId: doc.document_id,
    idShort: doc.id_short,
    assetId: doc.asset_id,
    description: doc.description || '',
    assetKind: doc.asset_kind as AssetKind,
    versions: head ? [{
      version: head.version,
      revision: head.revision,
      date: head.createdAt,
      status: head.status as VersionStatus,
      author: head.author
        ? `${head.author.user?.name ?? ''} ${head.author.user?.surname ?? ''}`.trim()
        : '',
      changes: head.message,
      details: (head.diffs ?? []).map((d: any) => ({
        type: d.change_type as ChangeType,
        target: d.target,
        name: d.name,
        desc: d.description ?? '',
      })),
    }] : [],
    submodels,
  };
}

// kept for legacy reference only — removed from runtime use
// (was: MOCK_AAS_DB — now seeded via aas-studio-api/scripts/seed-mock-data.js)

// placeholder so the old export still type-checks if referenced elsewhere
export const MOCK_AAS_DB: AASModel[] = [];


// ═══════════════════════════════════
// VALIDATION ENGINE
// ═══════════════════════════════════

export function validateAAS(
  aas: { idShort: string; assetId: string },
  sms: SubmodelTemplate[]
): ValidationResult {
  const errors: ValidationFinding[] = [];
  const warnings: ValidationFinding[] = [];
  const infos: ValidationFinding[] = [];

  const addFinding = (collection: ValidationFinding[], path: string, msg: string, rule: string) => {
    collection.push({ path, msg, rule });
  };

  const validateIdShort = (idShort: string | undefined, path: string, emptyRule: string, formatRule: string) => {
    if (!idShort?.trim()) {
      addFinding(errors, path, 'idShort obbligatorio', emptyRule);
    } else if (!/^[a-zA-Z_]\w*$/.test(idShort)) {
      addFinding(errors, path, `"${idShort}" non valido`, formatRule);
    }
  };

  validateIdShort(aas.idShort, 'AAS', 'AAS-001', 'AAS-002');

  if (!aas.assetId?.trim()) addFinding(errors, 'AAS.assetId', 'globalAssetId obbligatorio', 'AAS-003');
  else if (!aas.assetId.startsWith('urn:')) addFinding(warnings, 'AAS.assetId', 'Formato URN raccomandato', 'W001');

  if (!sms.length) addFinding(warnings, 'AAS', 'Nessun submodel', 'W002');

  const sIds = new Set<string>();
  sms.forEach((s, i) => {
    const p = `SM[${i}] "${s.idShort || '?'}"`;
    validateIdShort(s.idShort, p, 'SM-001', 'SM-002');

    if (s.idShort && sIds.has(s.idShort)) addFinding(errors, p, `"${s.idShort}" duplicato`, 'SM-003');
    if (s.idShort) sIds.add(s.idShort);

    if (!s.semanticId?.trim()) addFinding(warnings, p, 'semanticId mancante', 'SW001');
    if (!s.elements?.length) addFinding(infos, p, 'Submodel vuoto', 'SI001');

    const eIds = new Set<string>();
    (s.elements || []).forEach((el, ei) => {
      const ep = `${p} → ${el.idShort || `[${ei}]`}`;
      validateIdShort(el.idShort, ep, 'EL-001', 'EL-002');

      if (el.idShort && eIds.has(el.idShort)) addFinding(errors, ep, `"${el.idShort}" duplicato`, 'EL-003');
      if (el.idShort) eIds.add(el.idShort);

      if (el.type === 'Property') {
        if (!el.valueType) addFinding(errors, ep, 'valueType obbligatorio', 'EL-004');
        const v = typeof el.value === 'string' ? el.value : '';
        if (v) {
          if (el.valueType === 'xs:int' && isNaN(parseInt(v))) addFinding(errors, ep, `"${v}" non intero`, 'EL-005');
          if ((el.valueType === 'xs:double' || el.valueType === 'xs:float') && isNaN(parseFloat(v))) addFinding(errors, ep, `"${v}" non numero`, 'EL-006');
          if (el.valueType === 'xs:boolean' && !['true', 'false', '0', '1'].includes(v.toLowerCase())) addFinding(errors, ep, `"${v}" non booleano`, 'EL-007');
        }
      }
      if (!el.semanticId) addFinding(infos, ep, 'semanticId mancante', 'EI001');
      if (el.required && el.type !== 'SubmodelElementCollection') {
        const isEmpty = el.value === undefined || el.value === ''
          || (typeof el.value === 'object' && Object.keys(el.value).length === 0);
        if (isEmpty) addFinding(errors, ep, 'Campo required vuoto', 'EL-008');
      }
    });
  });

  return { errors, warnings, infos, valid: errors.length === 0 };
}

// ═══════════════════════════════════
// CONTEXT
// ═══════════════════════════════════

interface AASContextType {
  selectedModelId: string;
  setSelectedModelId: (id: string) => void;
  availableModels: AASModel[];
  currentModel: AASModel;
  currentVersion: AASVersion;
  loading: boolean;
  createModel: (data: { idShort: string; assetId: string; description: string; assetKind: AssetKind }) => void;
  deleteModel: () => void;
  updateCurrentModel: (patch: Partial<AASModel>) => void;
  updateVersionStatus: (status: VersionStatus) => void;
  addSubmodel: (sm: SubmodelTemplate) => void;
  removeSubmodel: (id: string) => void;
  updateSubmodel: (smId: string, patch: Partial<SubmodelTemplate>) => void;
  updateElement: (smId: string, elIdx: number, field: string, value: string | Record<string, string>) => void;
  updateChild: (smId: string, elIdx: number, childIdx: number, field: string, value: string) => void;
  importAas: (model: AASModel) => void;
  setSubmodels: (sms: SubmodelTemplate[]) => void;
  /** Reload from the server. Pass the id of a just-committed model so its
   *  local working copy is replaced by the server snapshot (drops dirty). */
  refreshModels: (committedId?: string) => Promise<void>;
  clearDirty: (id: string) => void;
}

const AASContext = createContext<AASContextType | null>(null);

export function AASProvider({ children }: { children: ReactNode }) {
  const api = useApiWrapper();

  const [loading, setLoading] = useState(true);
  const [availableModels, setAvailableModels] = useState<AASModel[]>(() => {
    const saved = localStorage.getItem('aas_studio_models');
    return saved ? JSON.parse(saved) : [];
  });
  const [selectedModelId, setSelectedModelId] = useState(() => {
    const saved = localStorage.getItem('aas_studio_models');
    const models: AASModel[] = saved ? JSON.parse(saved) : [];
    return models[0]?.id || '';
  });

  // ── Write-through localStorage cache ──────────────────────────────────────
  // Keep a ref mirroring state so refreshModels can merge against the latest
  // working copy without re-subscribing on every change.
  const availableModelsRef = useRef(availableModels);
  useEffect(() => {
    availableModelsRef.current = availableModels;
    if (!loading) {
      localStorage.setItem('aas_studio_models', JSON.stringify(availableModels));
    }
  }, [availableModels, loading]);

  // ── Load from API ──────────────────────────────────────────────────────────
  const refreshModels = useCallback(async (committedId?: string) => {
    setLoading(true);
    try {
      const listRes = await api.get<{ total: number; documents: any[] }>('/v1/aas');
      const documents: any[] = listRes.data?.documents ?? [];

      const serverModels = await Promise.all(
        documents.map(async (doc) => {
          let submodels: SubmodelTemplate[] = [];
          try {
            const ckRes = await api.get<{ content: { submodels?: SubmodelTemplate[] } | null }>(
              `/v1/aas/${doc.document_id}/checkout`
            );
            submodels = ckRes.data?.content?.submodels ?? [];
          } catch { /* snapshot missing — show empty submodels */ }
          return mapDocumentToModel(doc, submodels);
        })
      );

      // Non-destructive merge: never clobber the user's working copy.
      //  • dirty models (uncommitted editor changes) are kept as-is, only their
      //    server-side metadata (documentId, versions) is synced.
      //  • locally created models not yet saved to the server are preserved.
      const prev = availableModelsRef.current;
      const serverById = new Map(serverModels.map(m => [m.id, m]));
      const preserved = prev
        // A just-committed model (committedId) is intentionally NOT preserved:
        // adopt the server snapshot so it reflects the persisted state.
        .filter(lm => lm.id !== committedId && (lm.dirty || (!lm.documentId && !serverById.has(lm.id))))
        .map(lm => {
          const s = serverById.get(lm.id);
          return s ? { ...lm, documentId: s.documentId, versions: s.versions } : lm;
        });
      const preservedIds = new Set(preserved.map(m => m.id));
      const fresh = serverModels.filter(m => !preservedIds.has(m.id));
      const merged = [...fresh, ...preserved];

      setAvailableModels(merged);
      if (merged.length > 0) {
        setSelectedModelId(prevId => merged.find(m => m.id === prevId) ? prevId : merged[0].id);
      }
      localStorage.setItem('aas_studio_models', JSON.stringify(merged));
    } catch {
      // API unreachable — keep whatever is in localStorage (already in state)
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { refreshModels(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const currentModel = availableModels.find(m => m.id === selectedModelId) || availableModels[0];
  
  const currentVersion = currentModel?.versions[0] || {
    version: '1.0.0', revision: 'A', date: new Date().toISOString(), status: 'Draft',
    author: 'System', changes: 'Model state', details: []
  };

  const createModel = useCallback((data: { idShort: string; assetId: string; description: string; assetKind: AssetKind }) => {
    const id = `aas-${data.idShort.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`;
    const newModel: AASModel = {
      id,
      idShort: data.idShort,
      assetId: data.assetId,
      description: data.description,
      assetKind: data.assetKind,
      versions: [{ version: '1.0.0', revision: 'A', date: new Date().toISOString(), status: 'Draft', author: 'User', changes: 'Initial creation', details: [] }],
      submodels: [],
    };
    setAvailableModels(prev => [...prev, newModel]);
    setSelectedModelId(id);
  }, []);

  // Delete only the currently selected model. Removes it locally (and from the
  // server if it was committed) and selects the next remaining model.
  const deleteModel = useCallback(async () => {
    const models = availableModelsRef.current;
    const target = models.find(m => m.id === selectedModelId);
    if (!target) return;
    const next = models.filter(m => m.id !== target.id);
    setAvailableModels(next);
    setSelectedModelId(next[0]?.id ?? '');
    if (target.documentId) {
      try { await api.delete(`/v1/aas/${target.documentId}`); } catch { /* local removal stands */ }
    }
  }, [selectedModelId, api]);

  const updateCurrentModel = useCallback((patch: Partial<AASModel>) => {
    setAvailableModels(prev => prev.map(m =>
      m.id === selectedModelId ? { ...m, ...patch, dirty: true } : m
    ));
  }, [selectedModelId]);

  const clearDirty = useCallback((id: string) => {
    setAvailableModels(prev => prev.map(m => m.id === id ? { ...m, dirty: false } : m));
  }, []);

  const setSubmodels = useCallback((sms: SubmodelTemplate[]) => {
    updateCurrentModel({ submodels: sms });
  }, [updateCurrentModel]);

  const addSubmodel = useCallback((sm: SubmodelTemplate) => {
    setAvailableModels(prev => prev.map(m =>
      m.id === selectedModelId ? { ...m, submodels: [...m.submodels, sm], dirty: true } : m
    ));
  }, [selectedModelId]);

  const removeSubmodel = useCallback((id: string) => {
    setAvailableModels(prev => prev.map(m =>
      m.id === selectedModelId ? { ...m, submodels: m.submodels.filter(s => s.id !== id), dirty: true } : m
    ));
  }, [selectedModelId]);

  const updateSubmodel = useCallback((smId: string, patch: Partial<SubmodelTemplate>) => {
    setAvailableModels(prev => prev.map(m => {
      if (m.id !== selectedModelId) return m;
      return { ...m, dirty: true, submodels: m.submodels.map(s => s.id === smId ? { ...s, ...patch } : s) };
    }));
  }, [selectedModelId]);

  const updateElement = useCallback((smId: string, elIdx: number, field: string, value: string | Record<string, string>) => {
    setAvailableModels(prev => prev.map(m => {
      if (m.id !== selectedModelId) return m;
      return {
        ...m,
        dirty: true,
        submodels: m.submodels.map(s => {
          if (s.id !== smId) return s;
          const elements = [...s.elements];
          elements[elIdx] = { ...elements[elIdx], [field]: value };
          return { ...s, elements };
        })
      };
    }));
  }, [selectedModelId]);

  const updateChild = useCallback((smId: string, elIdx: number, childIdx: number, field: string, value: string) => {
    setAvailableModels(prev => prev.map(m => {
      if (m.id !== selectedModelId) return m;
      return {
        ...m,
        dirty: true,
        submodels: m.submodels.map(s => {
          if (s.id !== smId) return s;
          const elements = [...s.elements];
          const children = [...(elements[elIdx].children || [])];
          children[childIdx] = { ...children[childIdx], [field]: value };
          elements[elIdx] = { ...elements[elIdx], children };
          return { ...s, elements };
        })
      };
    }));
  }, [selectedModelId]);

  const updateVersionStatus = useCallback((status: VersionStatus) => {
    // 1. Aggiorna subito localStorage/stato locale
    setAvailableModels(prev => prev.map(m => {
      if (m.id !== selectedModelId) return m;
      const versions = [...m.versions];
      versions[0] = { ...versions[0], status, date: new Date().toISOString() };
      return { ...m, versions };
    }));

    // 2. Se il modello è collegato al DB, sincronizza lo stato del commit HEAD
    const model = availableModels.find(m => m.id === selectedModelId);
    if (model?.documentId) {
      (async () => {
        try {
          const docRes = await api.get<{ document: any; head: { commit_id: number } | null; refs: any[] }>(
            `/v1/aas/${model.documentId}`
          );
          const headCommitId = docRes.data?.head?.commit_id;
          if (headCommitId) {
            await api.put(`/v1/aas/${model.documentId}/commits/${headCommitId}/status`, { status });
          }
        } catch {
          // Fallback silenzioso — lo stato è già salvato in localStorage
        }
      })();
    }
  }, [selectedModelId, availableModels, api]);

  const importAas = useCallback((model: AASModel) => {
    const imported = { ...model, isImported: true };
    setAvailableModels(prev => {
      const exists = prev.find(m => m.id === imported.id);
      if (exists) return prev.map(m => m.id === imported.id ? imported : m);
      return [...prev, imported];
    });
    setSelectedModelId(imported.id);
  }, []);

  return (
    <AASContext.Provider
      value={{
        selectedModelId,
        setSelectedModelId,
        availableModels,
        currentModel,
        currentVersion,
        loading,
        createModel,
        deleteModel,
        updateCurrentModel,
        updateVersionStatus,
        addSubmodel,
        removeSubmodel,
        updateSubmodel,
        updateElement,
        updateChild,
        importAas,
        setSubmodels,
        refreshModels,
        clearDirty,
      }}
    >
      {children}
    </AASContext.Provider>
  );
}

export function useAASContext(): AASContextType {
  const ctx = useContext(AASContext);
  if (!ctx) throw new Error('useAASContext must be used within AASProvider');
  return ctx;
}
