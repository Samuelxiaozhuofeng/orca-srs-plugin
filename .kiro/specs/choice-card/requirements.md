# Requirements Document

## Introduction

本功能为 SRS 闪卡系统添加选择题卡片类型支持。当检测到卡片带有 `#choice` 标签（同时也有 `#card` 标签）时，系统将识别该卡片为选择题类型，将子块识别为选择项，并统计每次复习时用户的选择记录。这为 AI 快速添加选择题提供了便捷的标签方式。

## Glossary

- **Choice Card（选择题卡片）**: 带有 `#choice` 和 `#card` 标签的块，其子块作为选择项
- **Choice Option（选择项）**: 选择题卡片的直接子块，作为选项容器，其内部嵌套内容会被完整渲染
- **Correct Option（正确选项）**: 带有 `#correct` 或 `#正确` 标签的选择项
- **Single-Choice（单选题）**: 只有一个正确选项的选择题，点击即确认
- **Multiple-Choice（多选题）**: 有多个正确选项的选择题，需要提交按钮确认
- **Choice Statistics（选择统计）**: 记录用户每次选择的历史数据，使用 Block ID 标识选项
- **Shuffle（乱序）**: 随机打乱选项显示顺序的机制
- **Ordered Mode（有序模式）**: 通过 `#ordered` 标签禁用乱序的模式
- **Anchor Option（锚定选项）**: 包含"以上"等关键词的选项，乱序时固定在末尾
- **SRS System**: 间隔重复系统，用于管理卡片复习调度
- **Block**: Orca 笔记系统中的基本内容单元
- **Block ID**: 块的唯一标识符，用于持久化引用
- **Tag**: 块的标签引用，用于分类和标识

## Requirements

### Requirement 1

**User Story:** As a user, I want to create choice cards by adding `#choice` tag to a `#card` block, so that I can quickly create multiple-choice questions.

#### Acceptance Criteria

1. WHEN a block has both `#card` and `#choice` tags THEN the SRS System SHALL identify the block as a choice card type
2. WHEN a block has only `#choice` tag without `#card` tag THEN the SRS System SHALL not treat the block as a choice card
3. WHEN a choice card is identified THEN the SRS System SHALL recognize all direct child blocks as choice options
4. WHEN checking for `#choice` tag THEN the SRS System SHALL perform case-insensitive matching (e.g., `#Choice`, `#CHOICE`)

### Requirement 2

**User Story:** As a user, I want to mark correct options in my choice cards, so that the system can evaluate my answers.

#### Acceptance Criteria

1. WHEN a child block of a choice card has `#correct` or `#正确` tag THEN the SRS System SHALL identify that option as a correct answer
2. WHEN checking for correct tags THEN the SRS System SHALL perform case-insensitive matching (e.g., `#Correct`, `#CORRECT`)
3. WHEN multiple options are marked as correct THEN the SRS System SHALL treat the card as a multiple-choice question
4. WHEN exactly one option is marked as correct THEN the SRS System SHALL treat the card as a single-choice question
5. WHEN no option is marked as correct THEN the SRS System SHALL treat the choice card as having no defined correct answer

### Requirement 3

**User Story:** As a user, I want to review choice cards in the review session with proper interaction modes, so that I can practice answering questions effectively.

#### Acceptance Criteria

1. WHEN a choice card enters the review queue THEN the SRS System SHALL display the question (parent block text) and direct child blocks as options
2. WHEN rendering an option THEN the SRS System SHALL treat the direct child block as an option container and recursively render all its nested content
3. WHEN rendering nested content within an option THEN the SRS System SHALL not treat nested blocks as independent options
4. WHEN displaying options THEN the SRS System SHALL hide correct answer markers (`#correct`, `#正确` tags) until the answer is revealed
5. WHEN a single-choice card is displayed THEN the SRS System SHALL use radio button style interaction where clicking confirms the selection immediately
6. WHEN a multiple-choice card is displayed THEN the SRS System SHALL use checkbox style interaction with a submit button to confirm
7. WHEN the user clicks on an option in single-choice mode THEN the SRS System SHALL immediately confirm the selection and reveal the answer
8. WHEN the user clicks on an option in multiple-choice mode THEN the SRS System SHALL toggle that option selection state without confirming
9. WHEN the answer is revealed THEN the SRS System SHALL record the final selection and highlight correct options with green styling
10. WHEN the answer is revealed THEN the SRS System SHALL indicate incorrect selections with red styling

### Requirement 4

**User Story:** As a user, I want options to be shuffled during review with smart positioning, so that I learn the content rather than memorizing positions.

#### Acceptance Criteria

1. WHEN displaying choice options THEN the SRS System SHALL shuffle the option order randomly by default
2. WHEN a choice card has `#ordered` tag THEN the SRS System SHALL display options in their original order without shuffling
3. WHEN checking for `#ordered` tag THEN the SRS System SHALL perform case-insensitive matching
4. WHEN shuffling options THEN the SRS System SHALL use a segmented merge algorithm: first shuffle non-anchor options, then append anchor options in their original order
5. WHEN an option text contains anchor keywords (e.g., "以上", "皆非", "all of the above", "none of the above") THEN the SRS System SHALL classify that option as an anchor option

### Requirement 5

**User Story:** As a user, I want keyboard shortcuts to work with choice cards, so that I can review efficiently.

#### Acceptance Criteria

1. WHEN reviewing a choice card THEN the SRS System SHALL support number keys (1-9) to select corresponding options
2. WHEN in single-choice mode and a number key is pressed THEN the SRS System SHALL immediately confirm the selection
3. WHEN in multiple-choice mode THEN the SRS System SHALL support Enter key to submit the selection
4. WHEN the answer is revealed THEN the SRS System SHALL support the same grade shortcuts (1-4 for Again/Hard/Good/Easy) as other card types

### Requirement 6

**User Story:** As a user, I want the system to automatically suggest grades based on my answer correctness, so that grading is more intuitive.

#### Acceptance Criteria

1. WHEN the user selects all correct options and no incorrect options THEN the SRS System SHALL pre-select "Good" grade
2. WHEN the user selects some correct options with no incorrect options in multiple-choice mode THEN the SRS System SHALL pre-select "Hard" grade
3. WHEN the user selects any incorrect option or answers wrong in single-choice mode THEN the SRS System SHALL pre-select "Again" grade
4. WHEN the grade is pre-selected THEN the SRS System SHALL allow the user to manually change to a different grade
5. WHEN the choice card has no defined correct answer THEN the SRS System SHALL skip automatic grading and require manual grade selection

### Requirement 7

**User Story:** As a user, I want to track my choice statistics persistently, so that I can analyze my learning patterns.

#### Acceptance Criteria

1. WHEN a user makes a selection on a choice card THEN the SRS System SHALL store the selected option Block IDs and timestamp
2. WHEN storing choice statistics THEN the SRS System SHALL use Block ID instead of index to handle option reordering
3. WHEN storing choice statistics THEN the SRS System SHALL associate the record with the card ID and review session
4. WHEN choice statistics are queried THEN the SRS System SHALL return the selection history for a given card
5. WHEN serializing choice statistics THEN the SRS System SHALL encode them using JSON format
6. WHEN deserializing choice statistics THEN the SRS System SHALL parse them from JSON format
7. WHEN loading statistics data THEN the SRS System SHALL gracefully ignore records where the Block ID no longer exists and mark them as deleted options in the statistics view
8. WHEN storing choice statistics THEN the SRS System SHALL persist data to block properties following existing storage patterns

### Requirement 8

**User Story:** As a user, I want to see which wrong options are commonly selected, so that I can identify confusing distractors.

#### Acceptance Criteria

1. WHEN viewing a choice card in edit mode THEN the SRS System SHALL display selection frequency for each option
2. WHEN an incorrect option has high selection frequency THEN the SRS System SHALL display a warning indicator
3. WHEN calculating selection frequency THEN the SRS System SHALL use the stored Block ID based statistics

### Requirement 9

**User Story:** As a user, I want the choice card type to integrate with existing deck and SRS features, so that choice cards work seamlessly with my existing workflow.

#### Acceptance Criteria

1. WHEN a choice card is collected THEN the SRS System SHALL apply the same deck assignment logic as other card types
2. WHEN a choice card is reviewed THEN the SRS System SHALL update SRS state using the same algorithm as other card types
3. WHEN calculating deck statistics THEN the SRS System SHALL include choice cards in the counts
4. WHEN a choice card has `card/suspend` status THEN the SRS System SHALL exclude the card from review queue
