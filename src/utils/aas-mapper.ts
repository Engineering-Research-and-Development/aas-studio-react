// ─────────────────────────────────────────────────────────────────────────────
// Standard AAS (IDTA Part 1 JSON) → AAS Studio internal model.
//
// The inverse direction (internal → standard) lives in `aas-builder.ts`. Keep the
// two in sync: this is the single place that decodes shells/submodels coming from
// a remote AAS server (or an imported AASX) into the editor's working shape.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  AASModel,
  AssetKind,
  ElementType,
  SubmodelElement,
  SubmodelElementChild,
  SubmodelTemplate,
  XsdValueType,
} from '@/context/AASContext';

type Json = Record<string, unknown>;

const ELEMENT_TYPES: ReadonlySet<string> = new Set<ElementType>([
  'Property',
  'MultiLanguageProperty',
  'SubmodelElementCollection',
  'SubmodelElementList',
  'Operation',
  'File',
  'Blob',
  'ReferenceElement',
]);

function asElementType(modelType: unknown): ElementType {
  const s = String(modelType ?? '');
  return ELEMENT_TYPES.has(s) ? (s as ElementType) : 'Property';
}

/** Pull the first key value out of an AAS Reference object. */
export function extractSemanticId(semanticId: unknown): string {
  if (!semanticId || typeof semanticId !== 'object') return '';
  const obj = semanticId as Json;
  const keys = (obj.keys ?? obj.Keys) as Array<Record<string, string>> | undefined;
  return keys?.[0]?.value ?? '';
}

/** Collapse an AAS multi-language description array to a single string. */
export function extractDescription(description: unknown): string {
  if (Array.isArray(description)) {
    const first = description.find((d) => d && typeof d === 'object' && 'text' in d) as Json | undefined;
    return first ? String(first.text ?? '') : '';
  }
  return typeof description === 'string' ? description : '';
}

/** AAS MultiLanguageProperty value ([{language,text}]) → internal Record<lang,text>. */
function mapMlpValue(value: unknown): Record<string, string> {
  if (!Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const entry of value) {
    if (entry && typeof entry === 'object') {
      const e = entry as Json;
      const lang = e.language != null ? String(e.language) : '';
      if (lang) out[lang] = String(e.text ?? '');
    }
  }
  return out;
}

function mapChild(el: Json): SubmodelElementChild {
  return {
    idShort: String(el.idShort ?? ''),
    type: asElementType(el.modelType),
    valueType: el.valueType as XsdValueType | undefined,
    semanticId: extractSemanticId(el.semanticId),
    required: false,
    value: el.value != null && typeof el.value !== 'object' ? String(el.value) : undefined,
  };
}

export function mapElement(raw: unknown): SubmodelElement {
  const el = (raw ?? {}) as Json;
  const type = asElementType(el.modelType);
  const base = {
    idShort: String(el.idShort ?? ''),
    type,
    semanticId: extractSemanticId(el.semanticId),
    required: false,
  };

  switch (type) {
    case 'MultiLanguageProperty':
      return { ...base, value: mapMlpValue(el.value) };
    case 'SubmodelElementCollection':
    case 'SubmodelElementList':
      // List items may be unnamed (no idShort); still map them as children.
      return {
        ...base,
        children: (Array.isArray(el.value) ? el.value : [])
          .filter((c): c is Json => !!c && typeof c === 'object' && 'modelType' in (c as Json))
          .map(mapChild),
      };
    case 'File':
    case 'Blob':
      return {
        ...base,
        contentType: el.contentType != null ? String(el.contentType) : 'application/octet-stream',
        value: typeof el.value === 'string' ? el.value : '',
      };
    case 'Operation':
    case 'ReferenceElement':
      return base;
    default:
      return {
        ...base,
        valueType: (el.valueType as XsdValueType) ?? 'xs:string',
        value: el.value != null ? String(el.value) : '',
      };
  }
}

/** One standard AAS Submodel → internal SubmodelTemplate. */
export function mapSubmodel(raw: unknown): SubmodelTemplate {
  const sm = (raw ?? {}) as Json;
  const semanticId = extractSemanticId(sm.semanticId);
  return {
    id: String(sm.id ?? sm.idShort ?? ''),
    idShort: String(sm.idShort ?? ''),
    semanticId,
    description: extractDescription(sm.description),
    category: 'Remote',
    elements: (Array.isArray(sm.submodelElements) ? sm.submodelElements : []).map(mapElement),
  };
}

export interface PulledEnvironment {
  shell: Json;
  submodels: unknown[];
}

/**
 * Map a pulled { shell, submodels } environment to an internal AASModel ready
 * to load into the editor as a working copy. `idPrefix` namespaces the local id
 * so a pulled model doesn't collide with an existing one.
 */
export function mapEnvironmentToModel(
  env: PulledEnvironment,
  opts: { idPrefix?: string } = {},
): AASModel {
  const shell = (env.shell ?? {}) as Json;
  const assetInfo = (shell.assetInformation ?? {}) as Json;
  const shellId = String(shell.id ?? '');
  const localId = `${opts.idPrefix ?? 'remote'}-${shellId || shell.idShort || Date.now()}`;

  return {
    id: localId,
    idShort: String(shell.idShort ?? 'Imported_AAS'),
    assetId: String(assetInfo.globalAssetId ?? ''),
    description: extractDescription(shell.description),
    assetKind: (assetInfo.assetKind as AssetKind) ?? 'Instance',
    versions: [],
    isImported: true,
    dirty: true,
    submodels: (Array.isArray(env.submodels) ? env.submodels : []).map(mapSubmodel),
  };
}
