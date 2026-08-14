/**
 * 服务与算法设置 → 复习 Tab。
 * 状态留在 Dialog，本文件只负责展示与回传。
 */

import { MAX_DAILY_CARD_LIMIT } from "../../srs/reviewSessionBudget"
import {
  DEFAULT_MAXIMUM_INTERVAL,
  DEFAULT_NEW_CARDS_PER_DAY,
  DEFAULT_REQUEST_RETENTION,
  DEFAULT_REVIEW_CARDS_PER_DAY,
  FSRS_MAXIMUM_INTERVAL_MAX,
  FSRS_MAXIMUM_INTERVAL_MIN,
  FSRS_REQUEST_RETENTION_MAX,
  FSRS_REQUEST_RETENTION_MIN,
  isImageOcclusionMode,
  type ImageOcclusionModeSetting
} from "../../srs/settings/reviewSettingsSchema"
import { FieldHint, stopBubble, stopKeys } from "./FieldHint"

export type ReviewSettingsTabProps = {
  busy: boolean
  newCardsPerDay: string
  reviewCardsPerDay: string
  requestRetention: string
  passFailButtons: boolean
  showNextReviewTime: boolean
  fsrsWeights: string
  fsrsMaximumInterval: string
  imageOcclusionMode: ImageOcclusionModeSetting
  disableNotifications: boolean
  onNewCardsPerDayChange: (value: string) => void
  onReviewCardsPerDayChange: (value: string) => void
  onRequestRetentionChange: (value: string) => void
  onPassFailButtonsChange: (value: boolean) => void
  onShowNextReviewTimeChange: (value: boolean) => void
  onFsrsWeightsChange: (value: string) => void
  onFsrsMaximumIntervalChange: (value: string) => void
  onImageOcclusionModeChange: (value: ImageOcclusionModeSetting) => void
  onDisableNotificationsChange: (value: boolean) => void
  onRestoreDefaults: () => void
  onRestoreDefaultWeights: () => void
}

export function ReviewSettingsTab(props: ReviewSettingsTabProps) {
  const busy = props.busy
  return (
    <section
      className="ai-service-settings__section"
      role="tabpanel"
      id="ai-service-panel-review"
      aria-labelledby="ai-service-tab-review"
    >
      <h3 className="ai-service-settings__section-title">
        <i className="ti ti-cards" aria-hidden="true" />
        复习
      </h3>
      <p className="ai-service-settings__section-desc">
        控制每天进入队列的新卡与复习卡数量、目标记忆保留率、算法参数，以及复习界面与通知。
      </p>

      <label className="ai-service-settings__field">
        <span className="ai-service-settings__label">每日新卡上限</span>
        <input
          type="number"
          className="ai-service-settings__input"
          value={props.newCardsPerDay}
          min={0}
          max={MAX_DAILY_CARD_LIMIT}
          step={1}
          onChange={(e) => props.onNewCardsPerDayChange(e.target.value)}
          onKeyDown={stopKeys}
          onKeyUp={stopKeys}
          onMouseDown={stopBubble}
          disabled={busy}
        />
        <FieldHint
          summary={`0–${MAX_DAILY_CARD_LIMIT} 的整数。0 表示当天不安排新卡。`}
        />
      </label>

      <label className="ai-service-settings__field">
        <span className="ai-service-settings__label">每日复习上限</span>
        <input
          type="number"
          className="ai-service-settings__input"
          value={props.reviewCardsPerDay}
          min={0}
          max={MAX_DAILY_CARD_LIMIT}
          step={1}
          onChange={(e) => props.onReviewCardsPerDayChange(e.target.value)}
          onKeyDown={stopKeys}
          onKeyUp={stopKeys}
          onMouseDown={stopBubble}
          disabled={busy}
        />
        <FieldHint
          summary={`0–${MAX_DAILY_CARD_LIMIT} 的整数。0 表示当天不安排复习卡。`}
        />
      </label>

      <label className="ai-service-settings__field">
        <span className="ai-service-settings__label">目标记忆保留率</span>
        <input
          type="number"
          className="ai-service-settings__input"
          value={props.requestRetention}
          min={FSRS_REQUEST_RETENTION_MIN}
          max={FSRS_REQUEST_RETENTION_MAX}
          step={0.01}
          onChange={(e) => props.onRequestRetentionChange(e.target.value)}
          onKeyDown={stopKeys}
          onKeyUp={stopKeys}
          onMouseDown={stopBubble}
          disabled={busy}
        />
        <FieldHint
          summary={`范围 ${FSRS_REQUEST_RETENTION_MIN}–${FSRS_REQUEST_RETENTION_MAX}，推荐 0.9。越高复习越勤。`}
        />
      </label>

      <div className="ai-service-settings__subsection">
        <h4 className="ai-service-settings__subsection-title">算法参数</h4>
        <label className="ai-service-settings__field">
          <span className="ai-service-settings__label">FSRS 权重（21 个）</span>
          <textarea
            className="ai-service-settings__input ai-service-settings__input--textarea"
            rows={4}
            value={props.fsrsWeights}
            onChange={(e) => props.onFsrsWeightsChange(e.target.value)}
            onKeyDown={stopKeys}
            onKeyUp={stopKeys}
            onMouseDown={stopBubble}
            disabled={busy}
            spellCheck={false}
          />
          <FieldHint
            summary="FSRS v6 权重，逗号分隔的 21 个数字。填写非法值时运行时会回退默认权重并给出诊断。"
            details="改权重会影响之后所有评分的间隔计算。不确定时请用下方按钮恢复默认，再点底部保存。"
          />
        </label>
        <div className="ai-service-settings__row-actions">
          <button
            type="button"
            className="ai-service-settings__btn ai-service-settings__btn--secondary"
            onClick={props.onRestoreDefaultWeights}
            disabled={busy}
            title="仅更新本页草稿，需点底部「保存」才生效"
          >
            恢复默认权重
          </button>
        </div>
        <FieldHint summary="「恢复默认权重」只改当前页草稿，不会立刻写入；仍须点底部「保存」才会生效。" />

        <label className="ai-service-settings__field">
          <span className="ai-service-settings__label">最大间隔（天）</span>
          <input
            type="number"
            className="ai-service-settings__input"
            value={props.fsrsMaximumInterval}
            min={FSRS_MAXIMUM_INTERVAL_MIN}
            max={FSRS_MAXIMUM_INTERVAL_MAX}
            step={1}
            onChange={(e) => props.onFsrsMaximumIntervalChange(e.target.value)}
            onKeyDown={stopKeys}
            onKeyUp={stopKeys}
            onMouseDown={stopBubble}
            disabled={busy}
          />
          <FieldHint
            summary={`单张卡的最长复习间隔，有效范围 ${FSRS_MAXIMUM_INTERVAL_MIN}–${FSRS_MAXIMUM_INTERVAL_MAX} 天。`}
          />
        </label>
      </div>

      <label className="ai-service-settings__field ai-service-settings__field--toggle">
        <span className="ai-service-settings__label">仅失败 / 通过按钮</span>
        <label className="ai-service-settings__checkbox-row">
          <input
            type="checkbox"
            className="ai-service-settings__checkbox"
            checked={props.passFailButtons}
            onChange={(e) => props.onPassFailButtonsChange(e.target.checked)}
            onKeyDown={stopKeys}
            onMouseDown={stopBubble}
            disabled={busy}
          />
          <span>复习界面只显示失败与通过（映射为 Again / Good）</span>
        </label>
        <FieldHint
          summary="默认关闭，显示四级评分（忘记 / 困难 / 良好 / 简单）。开启后隐藏困难与简单。"
          details="失败写入 again、通过写入 good；不改变 FSRS 算法本身。快捷键：1=失败，3 或空格=通过；2/4 无效。选择题始终保持四级（含「困难」建议），不受此开关影响。"
        />
      </label>

      <label className="ai-service-settings__field ai-service-settings__field--toggle">
        <span className="ai-service-settings__label">
          按钮上方显示下次复习时间
        </span>
        <label className="ai-service-settings__checkbox-row">
          <input
            type="checkbox"
            className="ai-service-settings__checkbox"
            checked={props.showNextReviewTime}
            onChange={(e) => props.onShowNextReviewTimeChange(e.target.checked)}
            onKeyDown={stopKeys}
            onMouseDown={stopBubble}
            disabled={busy}
          />
          <span>Show next review time over buttons</span>
        </label>
        <FieldHint
          summary="默认关闭（隐藏时间，便于专注答题）。开启后在评分按钮上方显示预估间隔与到期日。"
        />
      </label>

      <label className="ai-service-settings__field">
        <span className="ai-service-settings__label">图片遮罩复习模式</span>
        <select
          className="ai-service-settings__input ai-service-settings__select"
          value={props.imageOcclusionMode}
          onChange={(e) => {
            const value = e.target.value
            if (isImageOcclusionMode(value)) {
              props.onImageOcclusionModeChange(value)
            }
          }}
          onKeyDown={stopKeys}
          onMouseDown={stopBubble}
          disabled={busy}
        >
          <option value="hideOne">题面只遮当前，答案全部揭开</option>
          <option value="hideAll">题面全遮，答案只揭当前</option>
          <option value="hideAllRevealAll">题面全遮，答案全部揭开</option>
        </select>
        <FieldHint
          summary="每张图可单独设置，未设置时用这里的值。"
          details="题面只遮当前：答案全部揭开。题面全遮、答案只揭当前：一次只核对一个编号。题面全遮、答案全部揭开：揭晓时一次看完整图。"
        />
      </label>

      <label className="ai-service-settings__field ai-service-settings__field--toggle">
        <span className="ai-service-settings__label">关闭通知提醒</span>
        <label className="ai-service-settings__checkbox-row">
          <input
            type="checkbox"
            className="ai-service-settings__checkbox"
            checked={props.disableNotifications}
            onChange={(e) => props.onDisableNotificationsChange(e.target.checked)}
            onKeyDown={stopKeys}
            onMouseDown={stopBubble}
            disabled={busy}
          />
          <span>开启后不显示任何 SRS 相关的通知提醒（评分、创建卡片等）</span>
        </label>
        <FieldHint summary="只影响插件弹出的成功/提示类通知；设置页自己的保存失败提示仍会显示。" />
      </label>

      <div className="ai-service-settings__row-actions">
        <button
          type="button"
          className="ai-service-settings__btn ai-service-settings__btn--secondary"
          onClick={props.onRestoreDefaults}
          disabled={busy}
          title="仅更新本页草稿，需点底部「保存」才生效"
        >
          恢复默认值
        </button>
      </div>
      <FieldHint
        summary={`「恢复默认值」只改当前草稿（${DEFAULT_NEW_CARDS_PER_DAY} / ${DEFAULT_REVIEW_CARDS_PER_DAY} / ${DEFAULT_REQUEST_RETENTION}，默认权重与最大间隔 ${DEFAULT_MAXIMUM_INTERVAL} 天，图片遮罩为「题面只遮当前」，通知保持开启，两项界面开关关闭），仍须底部保存才会生效。`}
      />
    </section>
  )
}
