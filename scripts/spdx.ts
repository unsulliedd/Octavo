// SPDX license expressions checked against an allow list: `MIT OR Apache-2.0`, `(MIT OR Apache-2.0) AND Unicode-3.0`,
// `Apache-2.0 WITH LLVM-exception`. Cargo's older `MIT/Apache-2.0` counts as OR.

export type Verdict = { ok: boolean; rejected: string[] };

/** Words and the parentheses, in order; `/` is OR. */
function tokens(expression: string): string[] {
  return expression
    .split(/([()/])|\s+/)
    .filter((t): t is string => !!t)
    .map((t) => (t === "/" ? "OR" : t));
}

const keyword = (t: string | undefined, word: string) => t?.toUpperCase() === word;

/**
 * Whether `expression` can be satisfied with licenses and exceptions from the allow lists (compared without regard to
 * case): OR needs one allowed side, AND needs both. `rejected` names the ids that stand in the way; empty when ok.
 * An expression that doesn't parse is not ok.
 */
export function check(expression: string, allowed: readonly string[], exceptions: readonly string[] = []): Verdict {
  const ids = new Set(allowed.map((a) => a.toLowerCase()));
  const excs = new Set(exceptions.map((a) => a.toLowerCase()));
  const toks = tokens(expression);
  let at = 0;

  const fail = (): never => {
    throw new Error(`not an SPDX expression: ${expression}`);
  };
  const and = (a: Verdict, b: Verdict): Verdict => ({ ok: a.ok && b.ok, rejected: [...a.rejected, ...b.rejected] });
  const or = (a: Verdict, b: Verdict): Verdict =>
    a.ok || b.ok ? { ok: true, rejected: [] } : { ok: false, rejected: [...a.rejected, ...b.rejected] };

  function term(): Verdict {
    const t = toks[at++];
    if (t === undefined || t === ")" || keyword(t, "AND") || keyword(t, "OR") || keyword(t, "WITH")) return fail();
    if (t === "(") {
      const inner = orExpr();
      if (toks[at++] !== ")") fail();
      return inner;
    }
    let verdict: Verdict = ids.has(t.toLowerCase()) ? { ok: true, rejected: [] } : { ok: false, rejected: [t] };
    if (keyword(toks[at], "WITH")) {
      at++;
      const exception = toks[at++];
      if (exception === undefined || exception === "(" || exception === ")") return fail();
      if (!excs.has(exception.toLowerCase())) verdict = and(verdict, { ok: false, rejected: [`${t} WITH ${exception}`] });
    }
    return verdict;
  }
  function andExpr(): Verdict {
    let v = term();
    while (keyword(toks[at], "AND")) {
      at++;
      v = and(v, term());
    }
    return v;
  }
  function orExpr(): Verdict {
    let v = andExpr();
    while (keyword(toks[at], "OR")) {
      at++;
      v = or(v, andExpr());
    }
    return v;
  }

  try {
    const verdict = orExpr();
    if (at < toks.length) fail();
    return { ok: verdict.ok, rejected: [...new Set(verdict.rejected)] };
  } catch {
    return { ok: false, rejected: [expression] };
  }
}
