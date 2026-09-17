#!/usr/bin/env node
// Rule: the Paseo SDK's client/server/shared split, enforced where the
// compiler does not:
//
//  - `client/` must not import from `server/`.
//  - `server/` must not import from `client/`, `react`, or `react-native`.
//  - `shared/` must not import a Node built-in, React/React Native, or a
//    runtime-specific SDK entry point (`@getpaseo/plugin/client`,
//    `@getpaseo/plugin/server`, `@getpaseo/client`, ...) — only the bare,
//    runtime-agnostic `@getpaseo/plugin` and similar packages.
//  - No code module sits at the repository root besides the two wiring
//    entries, `index.client.tsx` and `index.server.ts`.
//  - The browser globals `document`, `window`, `localStorage` and
//    `navigator` are used only in `client/web.ts`, the one module 0.8 lets
//    reach for them.
//
// `tsc --noEmit` type-checks each side against the SDK types it is given,
// but a relative import across the boundary, or a bare Node/React import
// inside `shared/`, still resolves and still compiles: nothing about the
// types says "wrong runtime". This script is the check that does.

import { readFileSync, readdirSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, join, relative, extname } from "node:path";
import { classify, CATEGORY } from "./lib/scan.mjs";

const ROOT = process.cwd();
const BUILTIN_NAMES = new Set(builtinModules);

const IMPORT_RE = /\bimport\s+(?:type\s+)?(?:[^'"]*?\sfrom\s+)?["']([^"']+)["']/g;
const REQUIRE_RE = /\brequire\(\s*["']([^"']+)["']\s*\)/g;
const EXPORT_FROM_RE = /\bexport\s+(?:type\s+)?(?:\*|\{[^}]*\})\s+from\s+["']([^"']+)["']/g;

function listFiles(dir, extensions) {
  const out = [];
  const stack = [dir];
  while (stack.length > 0) {
    const d = stack.pop();
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (extensions.includes(extname(entry.name))) out.push(full);
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

function specifiersOf(source) {
  const mask = classify(source);
  const specifiers = [];
  for (const re of [IMPORT_RE, REQUIRE_RE, EXPORT_FROM_RE]) {
    for (const match of source.matchAll(re)) {
      const specStart = match.index + match[0].lastIndexOf(match[1]);
      const specEnd = specStart + match[1].length;
      // Only count a match whose specifier text is real code, not a
      // string sitting inside a comment (e.g. an example in a docstring).
      let allCode = true;
      for (let i = specStart; i < specEnd; i++) {
        if (mask[i] !== CATEGORY.CODE && mask[i] !== CATEGORY.OPAQUE) {
          allCode = false;
          break;
        }
      }
      if (allCode) specifiers.push({ specifier: match[1], index: match.index });
    }
  }
  return specifiers;
}

function resolvesInto(specifier, fromDir, boundaryRelPath) {
  if (!specifier.startsWith(".")) return false;
  const resolved = relative(ROOT, join(fromDir, specifier)).split("\\").join("/");
  return resolved === boundaryRelPath || resolved.startsWith(`${boundaryRelPath}/`);
}

function isReactSpecifier(specifier) {
  return specifier === "react" || specifier === "react-native" || specifier.startsWith("react-native/") || specifier.startsWith("react/");
}

function isNodeBuiltinSpecifier(specifier) {
  if (specifier.startsWith("node:")) return true;
  const bare = specifier.split("/")[0];
  return BUILTIN_NAMES.has(bare) || BUILTIN_NAMES.has(specifier);
}

function isRuntimeSpecificSdkSpecifier(specifier) {
  if (!specifier.startsWith("@getpaseo/")) return false;
  const segments = specifier.split("/");
  return segments.includes("client") || segments.includes("server");
}

const violations = [];

function checkDir(relDir, rules) {
  const dir = join(ROOT, relDir);
  const files = listFiles(dir, [".ts", ".tsx"]);
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const mask = classify(source);
    const relFile = relative(ROOT, file);
    for (const { specifier, index } of specifiersOf(source)) {
      const line = source.slice(0, index).split("\n").length;
      for (const rule of rules) {
        const message = rule(specifier, dirname(file));
        if (message) violations.push({ file: relFile, line, message: `${message} (imports "${specifier}")` });
      }
    }
    // Browser globals, everywhere except client/web.ts.
    if (relFile !== "client/web.ts") {
      for (const name of ["document", "window", "localStorage", "navigator"]) {
        const re = new RegExp(`(?<![.\\w$])${name}(?![\\w$])`, "g");
        for (const match of source.matchAll(re)) {
          const i = match.index;
          if (mask[i] !== CATEGORY.CODE) continue;
          if (source[i - 1] === ".") continue; // property access on something else
          const line = source.slice(0, i).split("\n").length;
          violations.push({
            file: relFile,
            line,
            message: `browser global \`${name}\` used outside client/web.ts`,
          });
        }
      }
    }
  }
}

checkDir("client", [
  (specifier, fromDir) =>
    resolvesInto(specifier, fromDir, "server") ? "client/ must not import server/" : null,
]);

checkDir("server", [
  (specifier, fromDir) =>
    resolvesInto(specifier, fromDir, "client") ? "server/ must not import client/" : null,
  (specifier) => (isReactSpecifier(specifier) ? "server/ must not import React or React Native" : null),
]);

checkDir("shared", [
  (specifier) =>
    isNodeBuiltinSpecifier(specifier) ? "shared/ must not import a Node built-in" : null,
  (specifier) => (isReactSpecifier(specifier) ? "shared/ must not import React or React Native" : null),
  (specifier) =>
    isRuntimeSpecificSdkSpecifier(specifier)
      ? "shared/ must not import a runtime-specific SDK entry"
      : null,
]);

// No code module at the repository root besides the two wiring entries.
const ALLOWED_ROOT_FILES = new Set(["index.client.tsx", "index.server.ts"]);
const CODE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
for (const entry of readdirSync(ROOT, { withFileTypes: true })) {
  if (!entry.isFile()) continue;
  if (!CODE_EXTENSIONS.includes(extname(entry.name))) continue;
  if (ALLOWED_ROOT_FILES.has(entry.name)) continue;
  violations.push({
    file: entry.name,
    line: 1,
    message: "no code module belongs at the repository root besides index.client.tsx and index.server.ts",
  });
}

if (violations.length === 0) {
  console.log("import-boundaries: ok");
  process.exit(0);
}

console.error(`import-boundaries: ${violations.length} violation(s)`);
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}: ${v.message}`);
}
process.exit(1);
