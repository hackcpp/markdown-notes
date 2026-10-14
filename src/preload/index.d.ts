import type { NotesAPI } from '@shared/contracts/api'

declare global {
  interface Window {
    notesAPI: NotesAPI
  }
}

export {}
