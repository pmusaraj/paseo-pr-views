/** Resolve only unquoted date qualifiers; text searches can contain literal macro examples. */
export function resolveSearchQuery(query: string, effectiveDate: string): string {
  const today = new Date(`${effectiveDate}T00:00:00.000Z`);
  if (!Number.isFinite(today.getTime()) || today.toISOString().slice(0, 10) !== effectiveDate) {
    throw new Error("Invalid search date.");
  }
  const parts = query.match(/"(?:\\.|[^"\\])*"|[^"\s()]+|[\s()]+|"/g) ?? [];
  let depth = 0;
  for (const part of parts) {
    if (part === '"') throw new Error("Close the quoted text in the search query.");
    if (part.startsWith('"')) continue;
    for (const char of part) {
      if (char === "(") depth++;
      if (char === ")") depth--;
      if (depth < 0) throw new Error("Unbalanced search parentheses.");
    }
  }
  if (depth !== 0) throw new Error("Unbalanced search parentheses.");
  const resolved = parts
    .map((part) => {
      if (!/^(created|updated|closed|merged):/.test(part) || !part.includes("@today")) return part;
      return part.replace(/@today[^.<>\s]*/g, (macro) => {
        const match = /^@today(?:-(\d+)d)?$/.exec(macro);
        if (match === null) throw new Error("Use @today or @today-Nd in date filters.");
        const days = Number(match[1] ?? 0);
        if (!Number.isSafeInteger(days) || days > 365000)
          throw new Error("Relative date is out of range.");
        const date = new Date(today);
        date.setUTCDate(date.getUTCDate() - days);
        return date.toISOString().slice(0, 10);
      });
    })
    .join("");
  // Scope the entire expression, so an OR branch cannot admit issues.
  return `is:pr AND (${resolved})`;
}
