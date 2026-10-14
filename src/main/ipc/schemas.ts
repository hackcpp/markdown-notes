import { z } from 'zod'
import { NOTE_EXTENSIONS } from '@shared/constants'

/**
 * IPC 入参校验。
 *
 * 关键原则（对应方案 6.1）：主进程必须再次校验路径、长度、类型、所属工作区与请求来源，
 * 绝不能因为"调用经过了 Preload"就信任输入。
 */
export const relPathSchema = z.string().min(1).max(1024)

export const openPathSchema = z.object({
  rootPath: z.string().min(1).max(4096)
})

export const readDocumentSchema = z.object({
  relPath: relPathSchema
})

export const saveDocumentSchema = z.object({
  relPath: relPathSchema,
  content: z.string(),
  baseHash: z.string().max(64),
  eol: z.enum(['\n', '\r\n']),
  hasBom: z.boolean()
})

export const createFileSchema = z.object({
  relPath: relPathSchema,
  content: z.string().max(1024 * 1024).optional()
})

export const createFolderSchema = z.object({
  relPath: relPathSchema
})

export const renameSchema = z.object({
  from: relPathSchema,
  to: relPathSchema
})

export const revealSchema = z.object({
  relPath: relPathSchema
})

export const draftSaveSchema = z.object({
  workspaceRoot: z.string().min(1).max(4096),
  drafts: z
    .array(
      z.object({
        relPath: relPathSchema,
        content: z.string()
      })
    )
    .max(500)
})

export const draftIdSchema = z.object({
  id: z.string().min(4).max(64)
})

export const settingsPatchSchema = z
  .object({
    theme: z.enum(['light', 'dark', 'system']).optional(),
    viewMode: z.enum(['source', 'split', 'preview']).optional(),
    sidebarVisible: z.boolean().optional(),
    outlineVisible: z.boolean().optional(),
    sidebarWidth: z.number().int().min(180).max(520).optional(),
    outlineWidth: z.number().int().min(180).max(480).optional(),
    fontSize: z.number().int().min(11).max(24).optional(),
    showLineNumbers: z.boolean().optional(),
    wrapLines: z.boolean().optional(),
    lastWorkspace: z.string().max(4096).nullable().optional(),
    recentWorkspaces: z.array(z.string().max(4096)).max(16).optional(),
    windowBounds: z
      .object({
        width: z.number().int().min(400),
        height: z.number().int().min(300),
        x: z.number().int().optional(),
        y: z.number().int().optional()
      })
      .nullable()
      .optional()
  })
  .strip()

export const openExternalSchema = z.object({
  url: z.string().min(1).max(2048)
})

export const closeResponseSchema = z.object({
  requestId: z.string().min(1).max(64),
  allSaved: z.boolean(),
  drafts: z
    .array(
      z.object({
        relPath: relPathSchema,
        content: z.string()
      })
    )
    .max(500)
})

export const noteExtensionSet = new Set<string>(NOTE_EXTENSIONS)
