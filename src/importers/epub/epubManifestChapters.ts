/**
 * Resolve imported chapter IDs from epub.manifest (stable re-join path).
 */

import type { DbId } from "../../orca.d.ts"
import { loadManifestFromBook } from "./epubBookRepository"
import type { EpubBookManifestV1 } from "./types"

export type ManifestChapterOption = {
  blockId: DbId
  title: string
  key: string
  spineIndex: number
}

export async function getImportedChaptersFromManifest(
  bookBlockId: DbId
): Promise<{
  manifest: EpubBookManifestV1
  chapters: ManifestChapterOption[]
}> {
  const manifest = await loadManifestFromBook(bookBlockId)
  const chapters = manifest.chapters
    .filter((c) => c.status === "imported" && typeof c.blockId === "number")
    .map((c) => ({
      blockId: c.blockId as DbId,
      title: c.title,
      key: c.key,
      spineIndex: c.spineIndex
    }))
  return { manifest, chapters }
}

export function isPartialEpubImport(manifest: EpubBookManifestV1): boolean {
  return manifest.status === "partial" || manifest.status === "importing"
}
