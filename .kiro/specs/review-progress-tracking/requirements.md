# Requirements Document

## Introduction

本功能为 SRS 复习系统增强复习进度记录能力。当前系统已实现基础的进度显示（卡片数量、进度条）和单卡计时，但缺少会话级别的统计汇总功能。本需求聚焦于：

1. 会话结束时显示完整的统计摘要（总耗时、评分分布、平均耗时）
2. 实时显示准确率（记忆保留率）
3. 支持进度数据的序列化/反序列化（用于测试和潜在的会话恢复）
4. 区分会话总时长与有效复习时长，处理闲置超时

## Glossary

- **Review_Progress_Tracker**: 复习进度追踪器，负责记录和展示复习会话中的进度信息
- **Review_Session**: 复习会话，从用户开始复习到结束复习的完整过程
- **Session_Statistics**: 会话统计，包含本次复习的各项数据指标
- **Grade_Distribution**: 评分分布，记录用户在本次会话中各评分（Again/Hard/Good/Easy）的使用次数
- **Accuracy_Rate**: 准确率（记忆保留率），计算公式为 (Hard + Good + Easy) / Total_Graded，反映成功回忆的比例
- **Effective_Review_Time**: 有效复习时长，排除闲置超时后的实际复习时间
- **Idle_Timeout_Threshold**: 闲置超时阈值，单卡复习时间超过此值（60秒）时，该卡片的时间不计入有效复习时长

## Requirements

### Requirement 1

**User Story:** As a user, I want to see a comprehensive summary of my review session when it ends, so that I can understand my performance and learning progress.

#### Acceptance Criteria

1. WHEN a review session completes THEN the Session_Statistics SHALL display the total number of cards reviewed
2. WHEN a review session completes THEN the Session_Statistics SHALL display the total session time in HH:MM:SS format
3. WHEN a review session completes THEN the Session_Statistics SHALL display the Effective_Review_Time excluding idle periods
4. WHEN a review session completes THEN the Session_Statistics SHALL display the Grade_Distribution as a colored bar chart with red for Again, yellow for Hard, green for Good, and blue for Easy
5. WHEN a review session completes THEN the Session_Statistics SHALL display the average time per card in seconds based on Effective_Review_Time
6. WHEN a review session completes THEN the Session_Statistics SHALL display the Accuracy_Rate as a percentage

### Requirement 2

**User Story:** As a user, I want to track grade distribution during my review session, so that I can monitor my performance in real-time.

#### Acceptance Criteria

1. WHEN a user grades a card with any grade THEN the Review_Progress_Tracker SHALL increment the corresponding grade counter
2. WHEN displaying session progress THEN the Review_Progress_Tracker SHALL show the current Grade_Distribution with color-coded indicators
3. WHEN a user has not graded any cards THEN the Grade_Distribution SHALL show zero for all grades

### Requirement 3

**User Story:** As a user, I want to see my accuracy rate during the session, so that I can gauge my retention level.

#### Acceptance Criteria

1. WHEN a review session is in progress THEN the Review_Progress_Tracker SHALL calculate Accuracy_Rate as (Hard + Good + Easy) / Total_Graded
2. WHEN displaying session statistics THEN the Session_Statistics SHALL show the Accuracy_Rate as a percentage rounded to one decimal place
3. WHEN no cards have been graded THEN the Session_Statistics SHALL display Accuracy_Rate as 0%

### Requirement 4

**User Story:** As a user, I want to track total session time and effective review time, so that I can know how long I actually spent reviewing.

#### Acceptance Criteria

1. WHEN a review session starts THEN the Review_Progress_Tracker SHALL record the session start timestamp
2. WHEN a review session completes THEN the Review_Progress_Tracker SHALL calculate total session duration
3. WHEN a single card review exceeds Idle_Timeout_Threshold THEN the Review_Progress_Tracker SHALL cap that card's time at the threshold value for Effective_Review_Time calculation
4. WHEN displaying total time THEN the Session_Statistics SHALL format duration as HH:MM:SS

### Requirement 5

**User Story:** As a user, I want to calculate average time per card, so that I can understand my review pace.

#### Acceptance Criteria

1. WHEN a user grades a card THEN the Review_Progress_Tracker SHALL accumulate the card review duration up to Idle_Timeout_Threshold
2. WHEN calculating average time THEN the Review_Progress_Tracker SHALL divide Effective_Review_Time by number of graded cards
3. WHEN no cards have been graded THEN the average time SHALL be displayed as 0 seconds

### Requirement 6

**User Story:** As a developer, I want to serialize and deserialize session progress data with version control, so that the system can save and restore progress state for testing and future data migration.

#### Acceptance Criteria

1. WHEN serializing session progress THEN the Review_Progress_Tracker SHALL convert the progress state to a JSON string with a version field
2. WHEN deserializing session progress THEN the Review_Progress_Tracker SHALL parse the JSON string and validate the version field
3. WHEN serializing then deserializing progress data THEN the Review_Progress_Tracker SHALL produce an equivalent progress state object

