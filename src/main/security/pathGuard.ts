import fs from 'node:fs';
import path from 'node:path';
import type { AllowedFolder } from '@shared/types';

export interface ResolvedAllowedPath {
  resolvedPath: string;
  matchedFolder: AllowedFolder;
}

function normalizeForComparison(targetPath: string): string {
  const resolved = path.resolve(targetPath);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/**
 * Resolves symlinks for existing paths (or the closest existing parent directory for new files)
 * so symlink escapes and `..` path traversal outside user-selected folders are impossible.
 */
export function resolveCanonicalTarget(rawPath: string): string {
  const absolute = path.resolve(rawPath);
  if (fs.existsSync(absolute)) {
    return fs.realpathSync(absolute);
  }

  // Walk upward to find the nearest existing ancestor and resolve its realpath
  let current = absolute;
  const trailingSegments: string[] = [];
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) break;
    trailingSegments.unshift(path.basename(current));
    current = parent;
  }

  const realBase = fs.existsSync(current) ? fs.realpathSync(current) : current;
  return path.join(realBase, ...trailingSegments);
}

export function isPathInsideFolder(targetPath: string, folderRoot: string): boolean {
  const canonicalTarget = normalizeForComparison(resolveCanonicalTarget(targetPath));
  const canonicalRoot = normalizeForComparison(resolveCanonicalTarget(folderRoot));

  if (canonicalTarget === canonicalRoot) return true;
  const relative = path.relative(canonicalRoot, canonicalTarget);
  return (
    relative !== '' &&
    !relative.startsWith('..') &&
    !path.isAbsolute(relative)
  );
}

export function assertAllowedPath(
  targetPath: string,
  allowedFolders: AllowedFolder[]
): ResolvedAllowedPath {
  if (!allowedFolders || allowedFolders.length === 0) {
    throw new Error(
      'No folders have been shared with AuraDesk yet. Open Superpowers → Smart Folder Assistant to pick a folder first.'
    );
  }

  const canonicalTarget = resolveCanonicalTarget(targetPath);

  // Pick the most specific matching allowed folder
  let bestMatch: AllowedFolder | null = null;
  let bestLength = -1;

  for (const folder of allowedFolders) {
    if (isPathInsideFolder(canonicalTarget, folder.folderPath)) {
      if (folder.folderPath.length > bestLength) {
        bestMatch = folder;
        bestLength = folder.folderPath.length;
      }
    }
  }

  if (!bestMatch) {
    const friendlyList = allowedFolders.map((f) => f.label).join(', ');
    throw new Error(
      `For your privacy, AuraDesk can only access folders you have explicitly shared (${friendlyList}). "${path.basename(targetPath)}" is outside those folders.`
    );
  }

  return {
    resolvedPath: canonicalTarget,
    matchedFolder: bestMatch,
  };
}
