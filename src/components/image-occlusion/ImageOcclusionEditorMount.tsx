/**
 * 图片遮罩编辑器：Headbar 挂载 + Modal 壳。
 * 入口：斜杠 /io、右键、命令 openImageOcclusionEditor。
 * 主体逻辑见 ImageOcclusionEditorBody；pointer 状态机见 ioEditorInteraction。
 */

import type { DbId } from "../../orca.d.ts"
import { ImageOcclusionEditorBody } from "./ImageOcclusionEditorBody"

const { React } = window as any
const { useEffect } = React

type DialogState = {
  isOpen: boolean
  hostBlockId: DbId | null
  pluginName: string
}

let dialogState: DialogState | null = null

function getDialogState(): DialogState {
  if (dialogState) return dialogState
  const proxy = window.Valtio?.proxy
  if (typeof proxy !== "function") {
    throw new Error("图片遮罩编辑器无法启动：window.Valtio.proxy 不可用")
  }
  dialogState = proxy({
    isOpen: false,
    hostBlockId: null,
    pluginName: "orca-srs"
  } as DialogState) as DialogState
  return dialogState
}

export function openImageOcclusionEditor(
  hostBlockId: DbId,
  pluginName: string
): void {
  const state = getDialogState()
  state.hostBlockId = hostBlockId
  state.pluginName = pluginName
  state.isOpen = true
}

function closeImageOcclusionEditor(): void {
  const state = getDialogState()
  state.isOpen = false
  state.hostBlockId = null
}

export function ImageOcclusionEditorMount({
  pluginName
}: {
  pluginName: string
}) {
  const useSnapshot = window.Valtio?.useSnapshot
  if (typeof useSnapshot !== "function") {
    throw new Error("图片遮罩编辑器无法启动：window.Valtio.useSnapshot 不可用")
  }
  const state = getDialogState()
  const snap = useSnapshot(state)
  const { ModalOverlay } = orca.components

  useEffect(() => {
    if (!state.pluginName) {
      state.pluginName = pluginName
    }
  }, [pluginName, state])

  if (!snap.isOpen || snap.hostBlockId == null) return null

  return (
    <ModalOverlay
      visible={true}
      canClose={true}
      onClose={closeImageOcclusionEditor}
    >
      <div className="srs-io-editor-shell">
        <ImageOcclusionEditorBody
          hostBlockId={snap.hostBlockId as DbId}
          pluginName={snap.pluginName || pluginName}
          onClose={closeImageOcclusionEditor}
        />
      </div>
    </ModalOverlay>
  )
}
