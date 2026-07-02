import { DEFAULT_DECK_ID, MAX_SRS_LEVEL, MIN_SRS_LEVEL, popUpIntervals, srsIntervalsMinutes, type ChallengeMode, type SRSRating, type SrsDirection } from "./const";
import type { SrsLevelState, Word } from "./provider";

export type AnswerKind = 'Again' | 'Hard' | 'Good' | 'Easy';

/** A single reviewable (word, direction) pairing shown as one flashcard in the review stack. */
export interface ReviewItem {
    word: Word;
    direction: SrsDirection;
}

/**
 * Reads the effective SRS level/nextReviewAt for a given direction, falling back to the legacy
 * top-level fields for 'direct' (pre-migration/stale-cache safety), or a fresh/never-reviewed
 * state for 'reverse' when srsLevels hasn't been populated yet.
 */
export function getSrsBranch(word: Word, direction: SrsDirection): SrsLevelState {
    const branch = word.srsLevels?.[direction];
    if (branch) {
        return branch;
    }
    if (direction === 'direct') {
        return { srsLevel: word.srsLevel ?? 0, nextReviewAt: word.nextReviewAt ?? 0 };
    }
    return { srsLevel: 0, nextReviewAt: 0 };
}

/** Which SRS direction(s) are reviewable under a given challenge mode. */
export function getAllowedDirections(challengeMode: ChallengeMode): SrsDirection[] {
    if (challengeMode === 'reverse') return ['reverse'];
    if (challengeMode === 'mixed') return ['direct', 'reverse'];
    return ['direct'];
}

/**
 * Builds the list of reviewable (word, direction) items for the given challenge mode.
 * When dueOnly is true, only items whose branch nextReviewAt <= nowMs are included (a word can
 * appear twice if both its Direct and Reverse tracks are due). Results are sorted by each item's
 * own nextReviewAt ascending so the most overdue items come first.
 */
export function buildReviewItems(words: Word[], challengeMode: ChallengeMode, dueOnly: boolean, nowMs: number): ReviewItem[] {
    const directions = getAllowedDirections(challengeMode);
    const items: ReviewItem[] = [];
    for (const word of words) {
        for (const direction of directions) {
            const branch = getSrsBranch(word, direction);
            if (dueOnly && branch.nextReviewAt > nowMs) {
                continue;
            }
            items.push({ word, direction });
        }
    }
    if (dueOnly) {
        items.sort((a, b) => getSrsBranch(a.word, a.direction).nextReviewAt - getSrsBranch(b.word, b.direction).nextReviewAt);
    }
    return items;
}

/**
 * Maps a current SRS level to a category.
 * Adjust the level thresholds to match your preferred distribution.
 */
export function getCategoryByLevel(level: number): SRSRating {
  if (level <= 1) return 'again'; // Levels 0 - 1 (New / Forgotten)
  if (level <= 3) return 'hard';  // Levels 2 - 3 (Learning)
  if (level <= 5) return 'good';  // Levels 4 - 5 (Reviewing)
  return 'easy';                  // Levels 6 - 7 (Mastered)
}

/**
 * Calculates the number of cards in each category.
 */
export function countCardsByCurrentCategory(items: ReviewItem[]): Record<SRSRating, number> {
  const counts: Record<SRSRating, number> = {
    again: 0,
    hard: 0,
    good: 0,
    easy: 0,
  };

  for (const item of items) {
    const category = getCategoryByLevel(getSrsBranch(item.word, item.direction).srsLevel);
    counts[category]++;
  }

  return counts;
}

export function calculateNextSRS(currentLevel: number, rating: SRSRating) {
    let newSrsLevel = currentLevel || 0;
    let nextReviewInMinutes = 0;

    switch (rating) {
        case 'again':
                 // STRATEGY: Soft Reset
          // If the word was already somewhat known (level > 2), don't reset to 0.
          // Instead, knock it back 2 levels (or half), so it recovers quickly.

            if (currentLevel > 2) {
                newSrsLevel = Math.max(MIN_SRS_LEVEL, currentLevel - 2);
            } else {
                newSrsLevel = MIN_SRS_LEVEL;
            }
            // CRITICAL: Even if we keep the level high, the immediate next review 
            // MUST be soon because they just failed it.
            nextReviewInMinutes = popUpIntervals[0]*1.5; // 15*X minutes for 'again' to revent is to be reviewed very soon, giving user a chance to recall it while it's still fresh, which is crucial for retention. The 1.5 multiplier adds a small buffer to prevent overwhelming the user with immediate reviews if they have multiple 'again' cards, while still ensuring they come up quickly.
            break;
        case 'hard':
            // DO not change level but shouw it sooner than scheduled to give user more practice and increase chances of retention, 
            // but not as soon as 'again' because they at least got it partially right
            newSrsLevel = currentLevel;
            nextReviewInMinutes = Math.max(
                10,
                (srsIntervalsMinutes[currentLevel > 0 ? currentLevel - 1 : 0] || 10) / 1.5
            );
            break;
        case 'good':
            newSrsLevel = Math.min(currentLevel + 1, MAX_SRS_LEVEL);
            nextReviewInMinutes =
                srsIntervalsMinutes[currentLevel] || (srsIntervalsMinutes[srsIntervalsMinutes.length - 1] ?? 0) * 2;
            break;
        case 'easy':
            newSrsLevel = Math.min(currentLevel + 2, MAX_SRS_LEVEL);
            nextReviewInMinutes =
                srsIntervalsMinutes[currentLevel + 1] || (srsIntervalsMinutes[srsIntervalsMinutes.length - 1] ?? 0) * 4;
            break;
    }
    // Ensure final level is within valid bounds
    newSrsLevel = Math.max(MIN_SRS_LEVEL, Math.min(newSrsLevel, MAX_SRS_LEVEL));
    const nextReviewAt = Date.now() + nextReviewInMinutes * 60 * 1000;

    return { srsLevel: newSrsLevel, nextReviewAt };
}

export function getColorBySrsLevel(level: number): string {
    if (level <= 1) return 'border border-red-500/20 text-red-500';
    if (level <= 3) return 'border border-orange-500/20 text-orange-500';
    if (level <= 5) return 'border border-blue-500/20 text-blue-500';
    return 'border border-green-500/20 text-green-500';
}


export function dockeCounts(flashcards: Word[]): Record<string, number> {
        const deckCounts = flashcards.reduce((acc, card) => {
        const cardDeckIds = card.deckIds?.length ? card.deckIds : [DEFAULT_DECK_ID];

        cardDeckIds.forEach((deckId) => {
            acc[deckId] = (acc[deckId] ?? 0) + 1;
        });

        return acc;
    }, {} as Record<string, number>);
    return deckCounts;
}
