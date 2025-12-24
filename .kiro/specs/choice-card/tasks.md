# Implementation Plan

- [x] 1. Extend type definitions and tag utilities






  - [x] 1.1 Add choice card types to types.ts

    - Add `"choice"` to CardType union
    - Add ChoiceMode, ChoiceOption, ChoiceCardData, ChoiceStatisticsEntry, ChoiceStatisticsStorage interfaces
    - _Requirements: 1.1, 2.3, 2.4, 7.1_
  - [x] 1.2 Add tag detection functions to tagUtils.ts


    - Implement `isChoiceTag()` for case-insensitive #choice detection
    - Implement `isCorrectTag()` for case-insensitive #correct/#正确 detection
    - Implement `isOrderedTag()` for case-insensitive #ordered detection
    - _Requirements: 1.4, 2.2, 4.3_
  - [x]* 1.3 Write property test for choice card identification






    - **Property 1: Choice Card Identification**
    - **Validates: Requirements 1.1, 1.2, 1.4**

- [ ] 2. Implement choice utilities module

  - [x] 2.1 Create choiceUtils.ts with core functions


    - Implement `isAnchorOption()` for anchor keyword detection
    - Implement `extractChoiceOptions()` to get direct child blocks as options
    - Implement `detectChoiceMode()` based on correct option count
    - _Requirements: 1.3, 2.1, 2.3, 2.4, 4.5_
  - [ ]* 2.2 Write property test for correct option detection and mode
    - **Property 2: Correct Option Detection and Mode**


    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
  - [ ] 2.3 Implement shuffle algorithm
    - Implement `shuffleOptions()` with segmented merge algorithm
    - Non-anchor options shuffled, anchor options appended at end



    - Support #ordered tag to disable shuffling







    - _Requirements: 4.1, 4.2, 4.4_
  - [ ]* 2.4 Write property test for shuffle algorithm
    - **Property 4: Shuffle Algorithm Correctness**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5**
  - [x] 2.5 Implement auto-grading logic





    - Implement `calculateAutoGrade()` with Good/Hard/Again logic
    - Handle undefined mode (no correct answers)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_





  - [x]* 2.6 Write property test for auto-grading





    - **Property 5: Auto-Grading Logic**
    - **Validates: Requirements 6.1, 6.2**

- [x] 3. Checkpoint - Ensure all tests pass











  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement choice statistics storage




  - [x] 4.1 Create choiceStatisticsStorage.ts




    - Implement `serializeStatistics()` and `deserializeStatistics()` for JSON round-trip
    - Implement `saveChoiceStatistics()` to persist to block properties


    - Implement `loadChoiceStatistics()` with deleted block handling
    - _Requirements: 7.1, 7.2, 7.3, 7.5, 7.6, 7.7, 7.8_



  - [ ] 4.2 Write property test for statistics round-trip

    - **Property 6: Statistics Round-Trip**
    - **Validates: Requirements 7.5, 7.6**
  - [ ] 4.3 Write property test for statistics persistence

    - **Property 7: Statistics Persistence with Block ID**
    - **Validates: Requirements 7.1, 7.2, 7.7, 7.8**
  - [ ] 4.4 Implement option frequency calculation
    - Implement `calculateOptionFrequency()` for distractor analysis
    - _Requirements: 8.2, 8.3_


- [x] 5. Integrate choice card into card collector





  - [x] 5.1 Update deckUtils.ts to recognize choice type


    - Add "choice" case to `extractCardType()` function
    - _Requirements: 1.1_
  - [x] 5.2 Update cardCollector.ts for choice cards

    - Add choice card handling in `collectReviewCards()`
    - Apply same deck assignment and suspend logic
    - _Requirements: 9.1, 9.3, 9.4_
  - [ ]* 5.3 Write property test for SRS integration
    - **Property 8: SRS Integration**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4**

- [x] 6. Checkpoint - Ensure all tests pass






  - Ensure all tests pass, ask the user if questions arise.


- [x] 7. Implement choice card review renderer





  - [x] 7.1 Create ChoiceOptionRenderer.tsx component


    - Render option with block content
    - Handle selection state and styling
    - Support radio (single) and checkbox (multiple) modes
    - Hide correct markers before reveal
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6_
  - [x] 7.2 Create ChoiceCardReviewRenderer.tsx component


    - Display question and shuffled options
    - Handle single-choice click-to-confirm interaction
    - Handle multiple-choice toggle and submit interaction
    - Show answer reveal with correct/incorrect styling
    - _Requirements: 3.1, 3.7, 3.8, 3.9, 3.10_
  - [x] 7.3 Add CSS styles for choice card


    - Option container styles with hover/selected states
    - Correct (green) and incorrect (red) reveal styles
    - Handle complex content overflow
    - _Requirements: 3.9, 3.10_

- [x] 8. Integrate choice renderer into review session



  - [x] 8.1 Update SrsReviewSessionDemo.tsx

    - Detect choice card type and render ChoiceCardReviewRenderer
    - Pass choice data and callbacks
    - Handle auto-grading suggestion
    - _Requirements: 3.1, 6.1, 6.2, 6.3_
  - [x] 8.2 Update SrsCardDemo.tsx for choice card support


    - Add choice card rendering branch
    - Integrate with existing grade buttons
    - _Requirements: 9.2_


- [x] 9. Implement keyboard shortcuts





  - [x] 9.1 Update useReviewShortcuts.ts for choice cards

    - Add number keys (1-9) for option selection
    - Add Enter key for multiple-choice submit
    - Maintain existing grade shortcuts after reveal
    - _Requirements: 5.1, 5.2, 5.3, 5.4_


- [x] 10. Checkpoint - Ensure all tests pass




  - Ensure all tests pass, ask the user if questions arise.


- [x] 11. Implement edit mode statistics display




  - [x] 11.1 Create ChoiceStatisticsIndicator.tsx component


    - Display selection frequency per option
    - Show warning indicator for high-frequency incorrect options
    - _Requirements: 8.1, 8.2_
  - [x] 11.2 Integrate statistics indicator into block renderer


    - Show statistics in edit mode for choice cards
    - _Requirements: 8.1_

- [x] 12. Final Checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.
