# Implementation Plan

- [x] 1. Implement core session progress tracker module





  - [x] 1.1 Create sessionProgressTracker.ts with type definitions


    - Create `src/srs/sessionProgressTracker.ts`
    - Define `SessionProgressState`, `GradeDistribution`, `SessionStatsSummary`, `SerializedSessionData` interfaces
    - Define constants `IDLE_TIMEOUT_THRESHOLD` and `CURRENT_VERSION`
    - _Requirements: 1.1, 2.1, 4.1_

  - [x] 1.2 Implement createInitialProgressState function


    - Return initial state with version, zero counts, empty arrays
    - _Requirements: 2.3_

  - [x] 1.3 Implement calculateEffectiveDuration function


    - Apply IDLE_TIMEOUT_THRESHOLD cap
    - Handle negative input as 0
    - _Requirements: 4.3, 5.1_

  - [ ]* 1.4 Write property test for effective duration capping
    - **Property 3: Effective duration capping**
    - **Validates: Requirements 1.3, 4.3, 5.1**


  - [x] 1.5 Implement recordGrade function

    - Increment corresponding grade counter
    - Add effective duration to total
    - Increment totalGradedCards
    - Return new state (immutable)
    - _Requirements: 2.1, 5.1_

  - [ ]* 1.6 Write property test for grade distribution consistency
    - **Property 1: Grade distribution consistency**
    - **Validates: Requirements 1.1, 2.1**

  - [x] 1.7 Implement calculateAccuracyRate function


    - Calculate (hard + good + easy) / total
    - Return 0 when total is 0
    - _Requirements: 3.1, 3.3_

  - [ ]* 1.8 Write property test for accuracy rate calculation
    - **Property 5: Accuracy rate calculation**
    - **Validates: Requirements 1.6, 3.1, 3.2**

- [x] 2. Checkpoint - Make sure all tests pass





  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Implement formatting and summary functions





  - [x] 3.1 Implement formatDuration function


    - Convert milliseconds to HH:MM:SS format
    - Handle edge cases (0, large values)
    - _Requirements: 1.2, 4.4_

  - [ ]* 3.2 Write property test for time formatting correctness
    - **Property 2: Time formatting correctness**
    - **Validates: Requirements 1.2, 4.4**


  - [x] 3.3 Implement formatAccuracyRate function

    - Convert 0-1 rate to percentage string with one decimal
    - _Requirements: 3.2_

  - [x] 3.4 Implement generateStatsSummary function


    - Calculate total session time from start to end
    - Calculate average time per card
    - Compile all statistics
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 4.2_

  - [ ]* 3.5 Write property test for average time calculation
    - **Property 4: Average time calculation**
    - **Validates: Requirements 1.5, 5.2**

  - [ ]* 3.6 Write property test for session duration calculation
    - **Property 6: Session duration calculation**
    - **Validates: Requirements 4.2**

- [x] 4. Implement serialization functions





  - [x] 4.1 Implement serializeProgressState function


    - Wrap state in SerializedSessionData with version
    - Convert to JSON string
    - _Requirements: 6.1_

  - [x] 4.2 Implement deserializeProgressState function


    - Parse JSON string
    - Validate version field
    - Return initial state on version mismatch or parse error
    - _Requirements: 6.2_

  - [ ]* 4.3 Write property test for serialization round-trip
    - **Property 7: Serialization round-trip**
    - **Validates: Requirements 6.1, 6.2, 6.3**

- [x] 5. Checkpoint - Make sure all tests pass





  - Ensure all tests pass, ask the user if questions arise.


- [x] 6. Implement useSessionProgressTracker Hook





  - [x] 6.1 Create useSessionProgressTracker.ts

    - Create `src/hooks/useSessionProgressTracker.ts`
    - Define hook options and return type interfaces
    - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.1_

  - [x] 6.2 Implement core state management

    - Use useState for progressState
    - Use useRef for cardStartTime
    - Use useMemo for derived accuracyRate
    - _Requirements: 2.1, 3.1_

  - [x] 6.3 Implement recordGrade action

    - Calculate duration from cardStartTime
    - Call pure function recordGrade
    - Reset cardStartTime for next card
    - _Requirements: 2.1, 5.1_

  - [x] 6.4 Implement session lifecycle methods

    - resetSession: create new initial state
    - finishSession: generate and return stats summary
    - _Requirements: 1.1, 4.2_


  - [ ] 6.5 Implement auto-save to sessionStorage
    - Use useEffect to save on state change
    - Implement restore on mount
    - Handle sessionStorage unavailability gracefully
    - _Requirements: 6.1, 6.2_


- [x] 7. Implement UI components




  - [x] 7.1 Create GradeDistributionBar component


    - Create `src/components/GradeDistributionBar.tsx`
    - Use CSS Flex layout for colored bars
    - Colors: Again(red), Hard(yellow), Good(green), Easy(blue)
    - Optional number labels
    - _Requirements: 1.4, 2.2_

  - [x] 7.2 Update session complete UI in SrsReviewSessionDemo


    - Display total reviewed count
    - Display total session time (HH:MM:SS)
    - Display effective review time
    - Display average time per card
    - Display accuracy rate percentage
    - Integrate GradeDistributionBar
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [x] 7.3 Integrate useSessionProgressTracker in SrsReviewSessionDemo


    - Replace manual state management with hook
    - Call recordGrade on each grade action
    - Use hook's finishSession for completion stats
    - _Requirements: 2.1, 3.1, 4.1, 5.1_

- [x] 8. Final Checkpoint - Make sure all tests pass





  - Ensure all tests pass, ask the user if questions arise.

