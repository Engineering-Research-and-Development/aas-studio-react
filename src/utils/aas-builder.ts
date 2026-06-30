import { SubmodelTemplate, AssetKind, SubmodelElement } from '@/context/AASContext';

export interface IDTAReference {
  type: string;
  keys: Array<{ type: string; value: string }>;
}

export interface IDTASubmodelElement {
  idShort: string;
  modelType: string;
  semanticId?: IDTAReference;
  valueType?: string;
  value?: string | unknown[] | IDTAReference;
  contentType?: string;
  inoutputVariables?: unknown[];
}

export interface IDTASubmodel {
  modelType: 'Submodel';
  id: string;
  idShort: string;
  semanticId?: IDTAReference;
  description?: Array<{ language: string; text: string }>;
  submodelElements?: IDTASubmodelElement[];
}

export interface IDTAShell {
  modelType: 'AssetAdministrationShell';
  id: string;
  idShort: string;
  description?: Array<{ language: string; text: string }>;
  assetInformation: {
    assetKind: AssetKind;
    globalAssetId: string;
  };
  submodels?: IDTAReference[];
}

export interface IDTAEnvironment {
  assetAdministrationShells: IDTAShell[];
  submodels?: IDTASubmodel[];
  conceptDescriptions?: unknown[];
}

function buildReference(value: string): IDTAReference {
  return {
    type: 'ExternalReference',
    keys: [{ type: 'GlobalReference', value }],
  };
}

function mapSubmodelElement(el: SubmodelElement): IDTASubmodelElement {
  const base = {
    idShort: el.idShort,
    semanticId: el.semanticId ? buildReference(el.semanticId) : undefined,
  };

  switch (el.type) {
    case 'Property':
      return {
        ...base,
        modelType: 'Property',
        valueType: el.valueType || 'xs:string',
        value: el.value !== undefined && el.value !== '' ? String(el.value) : undefined,
      };
    case 'MultiLanguageProperty': {
      // Omit when MLP value is empty
      const langs = el.value && typeof el.value === 'object' && !Array.isArray(el.value)
        ? Object.entries(el.value as Record<string, string>)
            .filter(([, text]) => typeof text === 'string' && text.trim() !== '')
            .map(([language, text]) => ({ language, text }))
        : [];
      return {
        ...base,
        modelType: 'MultiLanguageProperty',
        ...(langs.length ? { value: langs } : {}),
      };
    }
    case 'SubmodelElementCollection': {
      const children = (el.children || []).map((child) => mapSubmodelElement(child as SubmodelElement));
      return {
        ...base,
        modelType: 'SubmodelElementCollection',
        ...(children.length ? { value: children } : {}),
      };
    }
    case 'File':
      return {
        ...base,
        modelType: 'File',
        value: '',
        contentType: 'application/octet-stream',
      };
    case 'Operation':
      return {
        ...base,
        modelType: 'Operation',
      };
    case 'ReferenceElement':
      return {
        ...base,
        modelType: 'ReferenceElement',
      };
    default:
      return {
        ...base,
        modelType: el.type,
      };
  }
}

export function buildAasEnvironment(
  aasIdShort: string,
  aasAssetId: string,
  aasDescription: string,
  assetKind: AssetKind,
  submodels: SubmodelTemplate[]
): IDTAEnvironment {
  const mappedSubmodels: IDTASubmodel[] = submodels.map((sm) => {
    const isStandardId = sm.id.startsWith('urn:') || sm.id.startsWith('https:');
    const submodelElements = (sm.elements || []).map(mapSubmodelElement).filter(Boolean) as IDTASubmodelElement[];
    return {
      modelType: 'Submodel',
      id: isStandardId ? sm.id : `https://aas-studio.local/submodels/${sm.id}`,
      idShort: sm.idShort,
      semanticId: sm.semanticId ? buildReference(sm.semanticId) : undefined,
      description: sm.description ? [{ language: 'en', text: sm.description }] : undefined,
      ...(submodelElements.length ? { submodelElements } : {}),
    };
  });

  const submodelRefs: IDTAReference[] = mappedSubmodels.map((sm) => ({
    type: 'ModelReference',
    keys: [{ type: 'Submodel', value: sm.id }],
  }));

  const shell: IDTAShell = {
    modelType: 'AssetAdministrationShell',
    id: `https://aas-studio.local/shells/${aasIdShort || 'default'}`,
    idShort: aasIdShort,
    description: aasDescription ? [{ language: 'en', text: aasDescription }] : undefined,
    assetInformation: {
      assetKind: assetKind || 'Instance',
      globalAssetId: aasAssetId || 'https://aas-studio.local/assets/default',
    },
    ...(submodelRefs.length ? { submodels: submodelRefs } : {}),
  };

  return {
    assetAdministrationShells: [shell],
    ...(mappedSubmodels.length ? { submodels: mappedSubmodels } : {}),
  };
}
