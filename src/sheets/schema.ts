/**
 * Combinadores mínimos para validar JSON desconocido contra una forma
 * esperada, sin dependencias externas. Cada problema se registra como un
 * CÓDIGO con la ruta del dato (nunca como texto libre).
 *
 * El parámetro de tipo de `Schema<T>` permite comprobar en compilación que el
 * esquema produce un valor asignable al tipo de `models` (ver sheetSchema.ts).
 */

export type SheetIssueCode =
  | "invalidJson"
  | "notAnObject"
  | "missingField"
  | "unknownField"
  | "wrongType"
  | "invalidValue"
  | "outOfRange"
  | "invalidIdentifier"
  | "tooFewItems"
  | "tooManyItems"
  | "unknownKind"
  | "unsupportedFormatVersion"
  | "duplicateId"
  | "unknownReference"
  | "referenceCycle"
  | "nestingTooDeep"
  | "triggerRequired"
  | "triggerNotAllowed"
  | "invalidRange"
  /** Aviso: la ficha declara algo que todavía no tiene representación mecánica. */
  | "unmodeledMechanic"
  /** Aviso: los conjuros se aceptan pero aún no existe catálogo de conjuros. */
  | "spellCatalogMissing";

export interface SheetIssue {
  readonly severity: "error" | "warning";
  readonly code: SheetIssueCode;
  /** Ruta del dato, p. ej. `capabilities[0].body.steps[1].attackRef`. */
  readonly path: string;
}

export interface Schema<T> {
  /** Solo para el sistema de tipos; nunca tiene valor. */
  readonly _type?: T;
  check(value: unknown, path: string, issues: SheetIssue[]): boolean;
}

export type Infer<S> = S extends Schema<infer T> ? T : never;

export function error(issues: SheetIssue[], code: SheetIssueCode, path: string): false {
  issues.push({ severity: "error", code, path });
  return false;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const join = (path: string, key: string): string => (path === "" ? key : `${path}.${key}`);

// --- primitivos -----------------------------------------------------------

export function int(min: number, max: number): Schema<number> {
  return {
    check(value, path, issues) {
      if (typeof value !== "number" || !Number.isInteger(value)) {
        return error(issues, "wrongType", path);
      }
      if (value < min || value > max) return error(issues, "outOfRange", path);
      return true;
    },
  };
}

export const bool: Schema<boolean> = {
  check(value, path, issues) {
    return typeof value === "boolean" || error(issues, "wrongType", path);
  },
};

/** Texto para personas (etiquetas, notas). El programa nunca lo interpreta. */
export const label: Schema<string> = {
  check(value, path, issues) {
    if (typeof value !== "string") return error(issues, "wrongType", path);
    if (value.trim().length === 0 || value.length > 200) return error(issues, "invalidValue", path);
    return true;
  },
};

const IDENTIFIER = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Identificador funcional en minúsculas con guiones (p. ej. `nimble-escape`). */
export const identifier: Schema<string> = {
  check(value, path, issues) {
    if (typeof value !== "string") return error(issues, "wrongType", path);
    if (value.length > 64 || !IDENTIFIER.test(value)) {
      return error(issues, "invalidIdentifier", path);
    }
    return true;
  },
};

export function oneOf<const V extends readonly string[]>(values: V): Schema<V[number]> {
  const allowed = new Set<string>(values);
  return {
    check(value, path, issues) {
      if (typeof value !== "string") return error(issues, "wrongType", path);
      return allowed.has(value) || error(issues, "invalidValue", path);
    },
  };
}

export function oneOfNumbers<const V extends readonly number[]>(values: V): Schema<V[number]> {
  const allowed = new Set<number>(values);
  return {
    check(value, path, issues) {
      if (typeof value !== "number") return error(issues, "wrongType", path);
      return allowed.has(value) || error(issues, "invalidValue", path);
    },
  };
}

export function literal<const V extends string | number>(expected: V): Schema<V> {
  return {
    check(value, path, issues) {
      return value === expected || error(issues, "invalidValue", path);
    },
  };
}

// --- compuestos ------------------------------------------------------------

export function arr<S extends Schema<unknown>>(
  item: S,
  bounds: { readonly min?: number; readonly max?: number } = {},
): Schema<Infer<S>[]> {
  const { min = 0, max = 100 } = bounds;
  return {
    check(value, path, issues) {
      if (!Array.isArray(value)) return error(issues, "wrongType", path);
      let ok = true;
      if (value.length < min) ok = error(issues, "tooFewItems", path);
      if (value.length > max) ok = error(issues, "tooManyItems", path);
      value.forEach((element, index) => {
        if (!item.check(element, `${path}[${index}]`, issues)) ok = false;
      });
      return ok;
    },
  };
}

/** Objeto con claves de un conjunto cerrado, todas opcionales. */
export function record<K extends string, S extends Schema<unknown>>(
  keys: Schema<K>,
  valueSchema: S,
): Schema<Partial<Record<K, Infer<S>>>> {
  return {
    check(value, path, issues) {
      if (!isPlainObject(value)) return error(issues, "notAnObject", path);
      let ok = true;
      for (const [key, entry] of Object.entries(value)) {
        const keyIssues: SheetIssue[] = [];
        if (!keys.check(key, join(path, key), keyIssues)) {
          ok = error(issues, "unknownField", join(path, key));
          continue;
        }
        if (!valueSchema.check(entry, join(path, key), issues)) ok = false;
      }
      return ok;
    },
  };
}

type Fields = Record<string, Schema<unknown>>;

type ObjectOf<R extends Fields, O extends Fields> = { [K in keyof R]: Infer<R[K]> } & {
  [K in keyof O]?: Infer<O[K]>;
};

export interface ObjectSchema<T> extends Schema<T> {
  /** Como `check`, pero acepta además las claves de `extraKeys` (p. ej. el discriminante). */
  checkWith(value: unknown, path: string, issues: SheetIssue[], extraKeys: ReadonlySet<string>): boolean;
}

/** Objeto estricto: rechaza campos desconocidos (atrapa erratas en las fichas). */
export function obj<R extends Fields, O extends Fields = Record<never, never>>(
  required: R,
  optional?: O,
): ObjectSchema<ObjectOf<R, O>> {
  const opt: Fields = optional ?? {};
  const checkWith: ObjectSchema<ObjectOf<R, O>>["checkWith"] = (value, path, issues, extra) => {
    if (!isPlainObject(value)) return error(issues, "notAnObject", path);
    let ok = true;
    for (const [key, schema] of Object.entries(required)) {
      if (!(key in value) || value[key] === undefined) {
        ok = error(issues, "missingField", join(path, key));
      } else if (!schema.check(value[key], join(path, key), issues)) {
        ok = false;
      }
    }
    for (const [key, schema] of Object.entries(opt)) {
      if (key in value && value[key] !== undefined) {
        if (!schema.check(value[key], join(path, key), issues)) ok = false;
      }
    }
    for (const key of Object.keys(value)) {
      if (!(key in required) && !(key in opt) && !extra.has(key)) {
        ok = error(issues, "unknownField", join(path, key));
      }
    }
    return ok;
  };
  return {
    checkWith,
    check: (value, path, issues) => checkWith(value, path, issues, new Set()),
  };
}

type TaggedOf<Tag extends string, M extends Record<string, ObjectSchema<unknown>>> = {
  [P in keyof M]: Infer<M[P]> & { [_ in Tag]: P };
}[keyof M];

/**
 * Unión discriminada por un campo (`op`, `kind`…). Un valor desconocido del
 * discriminante es `unknownKind`: nunca se ignora en silencio.
 */
export function tagged<Tag extends string, M extends Record<string, ObjectSchema<unknown>>>(
  tag: Tag,
  members: M,
): Schema<TaggedOf<Tag, M>> {
  const extra = new Set([tag]);
  return {
    check(value, path, issues) {
      if (!isPlainObject(value)) return error(issues, "notAnObject", path);
      const kind = value[tag];
      if (kind === undefined) return error(issues, "missingField", join(path, tag));
      if (typeof kind !== "string") return error(issues, "wrongType", join(path, tag));
      const member = Object.hasOwn(members, kind) ? members[kind] : undefined;
      if (!member) return error(issues, "unknownKind", join(path, tag));
      return member.checkWith(value, path, issues, extra);
    },
  };
}

/** Acepta el primer esquema que encaje; si ninguno, `invalidValue`. */
export function either<A, B>(a: Schema<A>, b: Schema<B>): Schema<A | B> {
  return {
    check(value, path, issues) {
      if (a.check(value, path, []) || b.check(value, path, [])) return true;
      return error(issues, "invalidValue", path);
    },
  };
}

/** Para esquemas recursivos (las operaciones contienen operaciones). */
export function lazy<T>(build: () => Schema<T>): Schema<T> {
  let built: Schema<T> | undefined;
  return {
    check(value, path, issues) {
      built ??= build();
      return built.check(value, path, issues);
    },
  };
}
