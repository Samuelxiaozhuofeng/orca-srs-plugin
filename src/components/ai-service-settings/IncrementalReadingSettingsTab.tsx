/**
 * 服务与算法设置 → 渐进阅读 Tab。
 * 状态留在 Dialog，本文件只负责展示与回传。
 */

import {
  IR_NATIVE_FORMAT_GROUP_IDS,
  IR_NATIVE_FORMAT_GROUP_LABELS,
  IR_TOOLBAR_ACTION_IDS,
  IR_TOOLBAR_ACTION_LABELS,
  type IRNativeFormatGroupId,
  type IRSelectionToolbarSettings,
  type IRToolbarActionId
} from "../../srs/settings/irSelectionToolbarSettings"
import type { IrItemInitialDueModeSetting } from "../../srs/settings/reviewSettingsSchema"
import { FieldHint, stopBubble, stopKeys } from "./FieldHint"

export type IncrementalReadingSettingsTabProps = {
  busy: boolean
  stbActions: IRSelectionToolbarSettings["actions"]
  stbFormatGroups: IRSelectionToolbarSettings["formatGroups"]
  irItemInitialDueMode: IrItemInitialDueModeSetting
  onActionChange: (id: IRToolbarActionId, value: boolean) => void
  onFormatGroupChange: (id: IRNativeFormatGroupId, value: boolean) => void
  onIrItemInitialDueModeChange: (value: IrItemInitialDueModeSetting) => void
  onRestoreToolbarDefaults: () => void
}

function isIrItemInitialDueMode(
  value: string
): value is IrItemInitialDueModeSetting {
  return value === "dispersed" || value === "today" || value === "tomorrow"
}

export function IncrementalReadingSettingsTab(
  props: IncrementalReadingSettingsTabProps
) {
  const busy = props.busy
  return (
    <section
      className="ai-service-settings__section"
      role="tabpanel"
      id="ai-service-panel-incrementalReading"
      aria-labelledby="ai-service-tab-incrementalReading"
    >
      <h3 className="ai-service-settings__section-title">
        <i className="ti ti-book-2" aria-hidden="true" />
        渐进阅读
      </h3>
      <p className="ai-service-settings__section-desc">
        配置选区工具栏，以及在 Topic / Extract 上新建记忆卡的首次学习时间。会话外工具栏保持宿主原样。
      </p>

      <div className="ai-service-settings__subsection">
        <h4 className="ai-service-settings__subsection-title">选区工具栏</h4>
        <FieldHint
          summary="在阅读/编辑模式选中文字时，按开关显示已知按钮；未知的新宿主按钮默认仍可见。"
          details="Topic 选区永不显示「挖空」；Extract 选区永不显示「摘录」。一键「解释」仅在 IR 内生效，使用现有块下内联解释（选区为 FOCUS）。右侧主栏不再放摘录/挖空，快捷键 Alt+X / Alt+Z 仍可用。"
        />

        <span className="ai-service-settings__label">插件动作</span>
        {IR_TOOLBAR_ACTION_IDS.map((id) => (
          <label key={id} className="ai-service-settings__checkbox-row">
            <input
              type="checkbox"
              className="ai-service-settings__checkbox"
              checked={props.stbActions[id]}
              onChange={(e) => props.onActionChange(id, e.target.checked)}
              onKeyDown={stopKeys}
              onMouseDown={stopBubble}
              disabled={busy}
            />
            <span>{IR_TOOLBAR_ACTION_LABELS[id]}</span>
          </label>
        ))}

        <span className="ai-service-settings__label ai-service-settings__label--spaced">
          原生格式（分组）
        </span>
        {IR_NATIVE_FORMAT_GROUP_IDS.map((id) => (
          <label key={id} className="ai-service-settings__checkbox-row">
            <input
              type="checkbox"
              className="ai-service-settings__checkbox"
              checked={props.stbFormatGroups[id]}
              onChange={(e) => props.onFormatGroupChange(id, e.target.checked)}
              onKeyDown={stopKeys}
              onMouseDown={stopBubble}
              disabled={busy}
            />
            <span>{IR_NATIVE_FORMAT_GROUP_LABELS[id]}</span>
          </label>
        ))}

        <div className="ai-service-settings__row-actions">
          <button
            type="button"
            className="ai-service-settings__btn ai-service-settings__btn--secondary"
            onClick={props.onRestoreToolbarDefaults}
            disabled={busy}
            title="仅更新本页草稿，需点底部「保存」才生效"
          >
            恢复推荐设置
          </button>
        </div>
        <FieldHint summary="推荐：摘录 / 挖空 / 一键解释 开；AI 菜单与 TTS 关；全部原生格式组关。须底部保存后立即作用于当前会话。" />
      </div>

      <div className="ai-service-settings__subsection">
        <h4 className="ai-service-settings__subsection-title">记忆卡排期</h4>
        <label className="ai-service-settings__field">
          <span className="ai-service-settings__label">
            IR 源记忆卡首次学习时间
          </span>
          <select
            className="ai-service-settings__input ai-service-settings__select"
            value={props.irItemInitialDueMode}
            onChange={(e) => {
              const value = e.target.value
              if (isIrItemInitialDueMode(value)) {
                props.onIrItemInitialDueModeChange(value)
              }
            }}
            onKeyDown={stopKeys}
            onMouseDown={stopBubble}
            disabled={busy}
          >
            <option value="dispersed">分散到约 1–14 天后（默认）</option>
            <option value="today">今天</option>
            <option value="tomorrow">明天</option>
          </select>
          <FieldHint
            summary="仅影响在主题 / 摘录（以及仍带渐进阅读排期的块）上新建的记忆卡。普通笔记制卡保持原行为。"
            details="「分散」按优先级把首次学习摊到大约 1–14 天后，避免当天扎堆。已有卡片的到期日不会因为改这项而重算。"
          />
        </label>
      </div>
    </section>
  )
}
