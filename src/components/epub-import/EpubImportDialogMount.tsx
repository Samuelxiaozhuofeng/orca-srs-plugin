/**
 * Headbar-mounted EPUB import dialog (Valtio open state).
 */

import EpubImportWizard from "./EpubImportWizard"

const { React, Valtio } = window as any
const { useSnapshot } = Valtio
const { useState, useCallback } = window.React

type EpubImportDialogState = {
  isOpen: boolean
  pluginName: string
}

const epubImportDialogState = Valtio.proxy({
  isOpen: false,
  pluginName: "orca-srs"
} as EpubImportDialogState)

export function showEpubImportDialog(pluginName: string): void {
  epubImportDialogState.pluginName = pluginName || "orca-srs"
  epubImportDialogState.isOpen = true
}

function closeEpubImportDialog(): void {
  epubImportDialogState.isOpen = false
}

interface EpubImportDialogMountProps {
  pluginName: string
}

export function EpubImportDialogMount({ pluginName }: EpubImportDialogMountProps) {
  const snap = useSnapshot(epubImportDialogState)
  const { ModalOverlay } = orca.components
  const [isWorking, setIsWorking] = useState(false)

  const handleWorkingChange = useCallback((working: boolean) => {
    setIsWorking(working)
  }, [])

  const handleClose = useCallback(() => {
    if (isWorking) return
    closeEpubImportDialog()
  }, [isWorking])

  if (!snap.isOpen) return null

  return (
    <ModalOverlay
      visible={snap.isOpen}
      canClose={!isWorking}
      onClose={handleClose}
    >
      <EpubImportWizard
        pluginName={snap.pluginName || pluginName}
        onClose={closeEpubImportDialog}
        onWorkingChange={handleWorkingChange}
      />
    </ModalOverlay>
  )
}
