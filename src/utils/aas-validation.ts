import * as AasJsonization from '@aas-core-works/aas-core3.1-typescript/jsonization';
import * as AasVerification from '@aas-core-works/aas-core3.1-typescript/verification';
import { ValidationFinding, SubmodelTemplate, AssetKind } from '@/context/AASContext';
import { buildAasEnvironment } from '@/utils/aas-builder';

// aas-core path segment: PropertySegment ({ name }) or IndexSegment ({ index }).
type Seg = { name?: string; index?: number };

// Map an aas-core verification path to the editor's `SM[i] "idShort" → elIdShort`
// convention so inline highlighting finds the right submodel/element. Built env
// preserves editor order: submodels[i] ↔ submodel i, submodelElements[j] ↔ element j.
function mapPath(segments: Seg[], submodels: SubmodelTemplate[]): string {
  let smIdx: number | null = null;
  let elIdx: number | null = null;
  for (let k = 0; k < segments.length; k++) {
    const seg = segments[k];
    const next = segments[k + 1];
    if (seg.name === 'submodels' && next && typeof next.index === 'number') {
      smIdx = next.index;
    } else if (seg.name === 'submodelElements' && elIdx === null && next && typeof next.index === 'number') {
      elIdx = next.index;
    }
  }
  if (smIdx === null) return 'AAS';
  const sm = submodels[smIdx];
  const base = `SM[${smIdx}] "${sm?.idShort || '?'}"`;
  if (elIdx === null) return base;
  const el = sm?.elements?.[elIdx];
  return `${base} → ${el?.idShort ?? `[${elIdx}]`}`;
}

// Run IDTA aas-core3.1 metamodel verification on the built env, returning findings
// in the editor's ValidationFinding shape.
export function verifyWithLibrary(
  aasIdShort: string,
  aasAssetId: string,
  aasDescription: string,
  assetKind: AssetKind,
  submodels: SubmodelTemplate[]
): ValidationFinding[] {
  try {
    const env = buildAasEnvironment(aasIdShort, aasAssetId, aasDescription, assetKind, submodels);
    // Drop undefined keys: aas-core reads a present-but-undefined key as an invalid
    // value and fails deserialization. JSON round-trip = what a serialized file looks like.
    const clean = JSON.parse(JSON.stringify(env));
    const envResult = AasJsonization.environmentFromJsonable(clean);
    if (envResult.error !== null) {
      return [{ path: 'AAS', msg: `Deserializzazione fallita: ${envResult.error.message}`, rule: 'IDTA-DESERIALIZE' }];
    }
    if (!envResult.value) return [];
    const findings: ValidationFinding[] = [];
    for (const err of AasVerification.verify(envResult.value)) {
      findings.push({ path: mapPath(err.path.segments as Seg[], submodels), msg: err.message, rule: 'IDTA' });
    }
    return findings;
  } catch (e) {
    return [{ path: 'AAS', msg: `Verifica IDTA fallita: ${e instanceof Error ? e.message : String(e)}`, rule: 'IDTA-ERROR' }];
  }
}
