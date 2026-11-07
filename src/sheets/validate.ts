import { SHEET_FORMAT_VERSION } from "../models";
import type { Capability, CreatureSheet, Operation, SheetPredicate } from "../models";
import { creatureSheetSchema } from "./sheetSchema";
import { isPlainObject } from "./schema";
import type { SheetIssue, SheetIssueCode } from "./schema";

/** Profundidad máxima de anidamiento de un árbol de operaciones (PROPUESTA). */
export const MAX_OPERATION_DEPTH = 8;

export type SheetValidationResult =
  | { readonly valid: true; readonly sheet: CreatureSheet; readonly warnings: readonly SheetIssue[] }
  | { readonly valid: false; readonly errors: readonly SheetIssue[]; readonly warnings: readonly SheetIssue[] };

/**
 * Valida una ficha en dos fases:
 * 1. Estructura: forma, tipos, vocabulario cerrado y campos desconocidos.
 * 2. Coherencia: identificadores únicos, referencias existentes, sin ciclos
 *    entre capacidades, profundidad limitada, reacciones con desencadenante y
 *    alcances coherentes.
 * Los avisos (`warning`) no impiden cargar la ficha: señalan mecánicas
 * declaradas que todavía no tienen representación.
 */
export function validateCreatureSheet(value: unknown): SheetValidationResult {
  const issues: SheetIssue[] = [];

  // La versión de formato se comprueba primero: con otra versión el resto no tiene sentido.
  if (isPlainObject(value) && "sheetFormat" in value && value["sheetFormat"] !== SHEET_FORMAT_VERSION) {
    return { valid: false, errors: [issue("unsupportedFormatVersion", "sheetFormat")], warnings: [] };
  }

  if (!creatureSheetSchema.check(value, "", issues)) {
    return split(issues, false);
  }
  const sheet = value as CreatureSheet;
  checkCoherence(sheet, issues);
  return split(issues, true, sheet);
}

function issue(code: SheetIssueCode, path: string, severity: SheetIssue["severity"] = "error"): SheetIssue {
  return { severity, code, path };
}

function split(issues: SheetIssue[], structural: boolean, sheet?: CreatureSheet): SheetValidationResult {
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  if (structural && errors.length === 0 && sheet) return { valid: true, sheet, warnings };
  return { valid: false, errors, warnings };
}

function checkUniqueIds(items: readonly { readonly id: string }[] | undefined, path: string, issues: SheetIssue[]): void {
  const seen = new Set<string>();
  (items ?? []).forEach((item, index) => {
    if (seen.has(item.id)) issues.push(issue("duplicateId", `${path}[${index}].id`));
    seen.add(item.id);
  });
}

function checkCoherence(sheet: CreatureSheet, issues: SheetIssue[]): void {
  checkUniqueIds(sheet.attacks, "attacks", issues);
  checkUniqueIds(sheet.capabilities, "capabilities", issues);
  checkUniqueIds(sheet.resources, "resources", issues);
  checkUniqueIds(sheet.traits, "traits", issues);

  const attackIds = new Set((sheet.attacks ?? []).map((a) => a.id));
  const capabilityIds = new Set((sheet.capabilities ?? []).map((c) => c.id));
  const resourceIds = new Set((sheet.resources ?? []).map((r) => r.id));
  const spellIds = new Set((sheet.spellcasting?.spells ?? []).map((s) => s.spellRef));
  const hasSpellSaveDc = sheet.spellcasting?.saveDc !== undefined;

  // REGLA OFICIAL VERIFICADA (SRD 5.2.1, "Recharge X–Y"): se puede usar UNA vez.
  (sheet.resources ?? []).forEach((resource, index) => {
    if (resource.recovery.some((r) => r.kind === "recharge") && resource.max !== 1) {
      issues.push(issue("invalidValue", `resources[${index}].max`));
    }
  });

  // Alcances: a distancia, el largo no puede ser menor que el normal; cuerpo a cuerpo no tiene largo.
  (sheet.attacks ?? []).forEach((attack, index) => {
    const { normal, long } = attack.rangeFeet;
    if (attack.mode === "melee" && long !== undefined) {
      issues.push(issue("invalidRange", `attacks[${index}].rangeFeet.long`));
    }
    if (attack.mode === "ranged" && long !== undefined && long < normal) {
      issues.push(issue("invalidRange", `attacks[${index}].rangeFeet.long`));
    }
    if (normal === 0) issues.push(issue("invalidRange", `attacks[${index}].rangeFeet.normal`));
  });

  const checkPredicate = (predicate: SheetPredicate, path: string): void => {
    switch (predicate.kind) {
      case "resourceAvailable":
        if (!resourceIds.has(predicate.resourceRef)) issues.push(issue("unknownReference", `${path}.resourceRef`));
        break;
      case "not":
        checkPredicate(predicate.predicate, `${path}.predicate`);
        break;
      case "all":
      case "any":
        predicate.predicates.forEach((p, i) => checkPredicate(p, `${path}.predicates[${i}]`));
        break;
      default:
        break;
    }
  };

  const checkOperation = (operation: Operation, path: string, depth: number): void => {
    if (depth > MAX_OPERATION_DEPTH) {
      issues.push(issue("nestingTooDeep", path));
      return;
    }
    switch (operation.op) {
      case "attack":
        if (!attackIds.has(operation.attackRef)) issues.push(issue("unknownReference", `${path}.attackRef`));
        break;
      case "capability":
        if (!capabilityIds.has(operation.capabilityRef)) {
          issues.push(issue("unknownReference", `${path}.capabilityRef`));
        }
        break;
      case "castSpell":
        if (!spellIds.has(operation.spellRef)) issues.push(issue("unknownReference", `${path}.spellRef`));
        issues.push(issue("spellCatalogMissing", path, "warning"));
        break;
      case "effect":
        if (operation.save?.dc === "spellSaveDc" && !hasSpellSaveDc) {
          issues.push(issue("unknownReference", `${path}.save.dc`));
        }
        break;
      case "unmodeled":
        issues.push(issue("unmodeledMechanic", path, "warning"));
        break;
      case "standardAction":
        break;
      case "sequence":
        operation.steps.forEach((step, i) => checkOperation(step, `${path}.steps[${i}]`, depth + 1));
        break;
      case "choice":
        operation.options.forEach((option, i) => checkOperation(option, `${path}.options[${i}]`, depth + 1));
        break;
      case "repeat":
      case "optional":
        checkOperation(operation.body, `${path}.body`, depth + 1);
        break;
      case "conditional":
        checkPredicate(operation.when, `${path}.when`);
        checkOperation(operation.then, `${path}.then`, depth + 1);
        if (operation.otherwise) checkOperation(operation.otherwise, `${path}.otherwise`, depth + 1);
        break;
    }
  };

  (sheet.capabilities ?? []).forEach((capability, index) => {
    const path = `capabilities[${index}]`;
    if (capability.activation === "reaction" && capability.trigger === undefined) {
      issues.push(issue("triggerRequired", `${path}.trigger`));
    }
    if (capability.activation !== "reaction" && capability.trigger !== undefined) {
      issues.push(issue("triggerNotAllowed", `${path}.trigger`));
    }
    // Solo una acción puede realizarse "como" la acción de Atacar.
    if (capability.takenAs !== undefined && capability.activation !== "action") {
      issues.push(issue("invalidValue", `${path}.takenAs`));
    }
    (capability.costs ?? []).forEach((cost, i) => {
      if (cost.kind === "resource" && !resourceIds.has(cost.resourceRef)) {
        issues.push(issue("unknownReference", `${path}.costs[${i}].resourceRef`));
      }
      if (cost.kind === "spellSlot" && sheet.spellcasting?.slots === undefined) {
        issues.push(issue("unknownReference", `${path}.costs[${i}]`));
      }
    });
    (capability.requirements ?? []).forEach((p, i) => checkPredicate(p, `${path}.requirements[${i}]`));
    checkOperation(capability.body, `${path}.body`, 1);
  });

  (sheet.traits ?? []).forEach((trait, index) => {
    trait.effects.forEach((effect, i) => {
      if (effect.kind === "unmodeled") {
        issues.push(issue("unmodeledMechanic", `traits[${index}].effects[${i}]`, "warning"));
      }
    });
  });

  if (sheet.spellcasting) issues.push(issue("spellCatalogMissing", "spellcasting", "warning"));

  checkCapabilityCycles(sheet.capabilities ?? [], issues);
}

/** Referencias directas `capability` dentro de un árbol de operaciones. */
export function capabilityRefsOf(operation: Operation): string[] {
  switch (operation.op) {
    case "capability":
      return [operation.capabilityRef];
    case "sequence":
      return operation.steps.flatMap(capabilityRefsOf);
    case "choice":
      return operation.options.flatMap(capabilityRefsOf);
    case "repeat":
    case "optional":
      return capabilityRefsOf(operation.body);
    case "conditional":
      return [
        ...capabilityRefsOf(operation.then),
        ...(operation.otherwise ? capabilityRefsOf(operation.otherwise) : []),
      ];
    default:
      return [];
  }
}

/** Una capacidad no puede usarse a sí misma, ni directa ni indirectamente. */
function checkCapabilityCycles(capabilities: readonly Capability[], issues: SheetIssue[]): void {
  const index = new Map(capabilities.map((c, i) => [c.id, i] as const));
  const edges = new Map(capabilities.map((c) => [c.id, capabilityRefsOf(c.body)] as const));
  const state = new Map<string, "visiting" | "done">();
  const reported = new Set<string>();

  const visit = (id: string): void => {
    const current = state.get(id);
    if (current === "done") return;
    if (current === "visiting") {
      if (!reported.has(id)) {
        reported.add(id);
        issues.push(issue("referenceCycle", `capabilities[${index.get(id) ?? -1}]`));
      }
      return;
    }
    state.set(id, "visiting");
    for (const next of edges.get(id) ?? []) {
      if (index.has(next)) visit(next);
    }
    state.set(id, "done");
  };
  for (const capability of capabilities) visit(capability.id);
}
