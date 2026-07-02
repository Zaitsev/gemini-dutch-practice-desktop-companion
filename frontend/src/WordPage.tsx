import { SkipForward } from "lucide-react";
import React, { useCallback, useEffect, useMemo } from "react";
import { HideWindow } from "../wailsjs/go/main/App";
import { AllCardsDone } from "./components/AllCardsDone";
import { AllCatchUp } from "./components/AllCatchUp";
import { AnswerControls } from "./components/AnswerControls";
import { NormalCard } from "./components/NormalCard";
import { NormalImageCard } from "./components/NormalImageCard";
import { ReverseCard } from "./components/ReverseCard";
import { popUpIntervals, type ChallengeMode, type SrsDirection } from "./const";
import { useAppStateContext, type Word } from "./provider";
import { countCardsByCurrentCategory, dockeCounts, getSrsBranch, buildReviewItems, type ReviewItem } from "./utils";
/** local replica of updateWordSrsData in gemini-dutch-practice\store\dictionarySlice.ts 
 * 
*/


const CardComponent: React.FC<{ word: Word; direction: SrsDirection }> = ({ word, direction }) => {
    const renderedCard = useMemo(() => {
        if (direction === 'reverse') {
            return <ReverseCard activeCard={word} />;
        }

        // Determine if we show image variant, based on the Direct SRS level
        const directLevel = getSrsBranch(word, 'direct').srsLevel;
        let showImage = false;
        if (directLevel > 5) {
            showImage = Math.random() > 0.3;
        } else if (directLevel > 3) {
            showImage = Math.random() > 0.5;
        }

        if (showImage) {
            return <NormalImageCard activeCard={word} />;
        }

        return <NormalCard activeCard={word} />;
    }, [word, direction]);

    return renderedCard;
};


const WordsCounter: React.FC<{ items: ReviewItem[] }> = ({ items }) => {
    const { practiceAll, selectedDeckId, setSelectedDeckId, decks ,flashcards} = useAppStateContext();
    const cats = countCardsByCurrentCategory(items);
        const deckCounts = useMemo(() => dockeCounts(flashcards), [flashcards]);
        return (
        <div className="flex items-center gap-2">
            <select
                value={selectedDeckId}
                onChange={(e) => setSelectedDeckId(e.target.value)}
                className="bg-slate-900/80 text-[11px] font-semibold text-slate-300 border border-slate-700/30 rounded-md px-1.5 py-0.5 outline-none hover:bg-slate-800 hover:border-slate-600 transition-colors cursor-pointer"
            >
                <option value="all" className="bg-slate-900 text-slate-300">All Decks</option>
                {decks.map(deck => (
                    <option key={deck.id} value={deck.id} className="bg-slate-900 text-slate-300">
                        {deck.name} {deckCounts[deck.id] > 0 ? `| ${deckCounts[deck.id]}` : null}
                    </option>
                ))}
            </select>
            <span className="bg-slate-800/60 px-2 py-0.5 rounded-md border border-slate-700/30 shrink-0">
                {practiceAll ? 'Practice stack' : 'Due stack'}
            </span>
            <span className="text-slate-500 truncate">
                <span className="text-red-500 mr-1">{cats.again}</span>
                <span className="text-orange-500 mr-1">{cats.hard}</span>
                <span className="text-blue-500 mr-1">{cats.good}</span>
                <span className="text-green-500">{cats.easy}</span> of {items.length}
            </span>
        </div>
    );
};
export const WordPage: React.FC = React.memo(() => {

    const { flashcards, currentCardIndex, setCurrentCardIndex, isFlipped, setIsFlipped, selectedDeckId, config } = useAppStateContext();
    const { practiceAll, showToast } = useAppStateContext(); // Practice all words if none are due
    const challengeMode = (config?.challengeMode || 'normal') as ChallengeMode;

    const deckCards = useMemo(() => {
        if (selectedDeckId === "all") {
            return flashcards;
        }
        return flashcards.filter(c => {
            const cardDecks = c.deckIds && c.deckIds.length > 0 ? c.deckIds : ["default"];
            return cardDecks.includes(selectedDeckId);
        });
    }, [flashcards, selectedDeckId]);

    // Filter due cards or provide practice stack
    const nowMs = Date.now()+ popUpIntervals[popUpIntervals.length - 1]*60*1000; // subtract max pop-up interval from current time to include cards that will be due very soon, providing a smoother experience and allowing users to pre-review cards that are just about to come up. This also helps prevent situations where a card becomes due in the middle of a review session and is not included in the stack, which can be jarring for users.
    // reviewItems is direction-aware: each entry is a (word, direction) pairing. A word can appear
    // twice (once per direction) in mixed challenge mode when both its Direct and Reverse tracks are due.
    // In practiceAll mode all allowed directions for every word are included regardless of due-ness.
    const reviewItems = useMemo(() => {
        return buildReviewItems(deckCards, challengeMode, !practiceAll, nowMs);
    }, [deckCards, challengeMode, practiceAll, nowMs]);
    // console.log(`Total cards: ${flashcards.length}, Review items: ${reviewItems.length}, Practice all: ${practiceAll}`);

    // flashcards are shuffled randomly on load, so the reviewItems order is randomized so when in practiceAll mode they are not in the same order every time
    const activeItems = reviewItems;
    //Due to SRS rescheduling in normal mode we show first _scheduled_ item, but in practiceAll mode we show first _random_ item, so we need to slice the array accordingly
    const activeItem = (practiceAll ? activeItems[currentCardIndex] : activeItems[0]) || null;
    useEffect(() => {
        const handeFlip = async (e: React.KeyboardEvent) => {

            if (e.code === "Space") {
                e.preventDefault(); // Prevent page scrolling
                setIsFlipped(prev => !prev);
            }

        }
        window.addEventListener("keydown", handeFlip as any);
        return () => {
            window.removeEventListener("keydown", handeFlip as any);
        };
    }, [ setIsFlipped]);

    const handleSkipWord = useCallback(() => {
        if (!activeItem) return;

        setIsFlipped(false);
        setTimeout(() => {
            if (currentCardIndex + 1 >= activeItems.length) {
                showToast("Review session completed.", "success");
                setTimeout(() => {
                    HideWindow();
                }, 3000);
            }else{

                setCurrentCardIndex(currentCardIndex + 1);
            }
        }, 200);
    }, [activeItem, currentCardIndex, activeItems, showToast]);

    return (
        <div className="layout-page-stack">
            {/* Top Bar with selector and words counter. Always visible! */}
            <div className="layout-topbar">
                <WordsCounter items={activeItems} />

                {practiceAll && activeItems.length > 0 && currentCardIndex < activeItems.length && (
                    <button
                        onClick={handleSkipWord}
                        className="flex items-center gap-1 py-1 px-2.5 bg-slate-800/40 hover:bg-slate-800/80 border border-slate-700/30 hover:border-slate-700/60 text-slate-400 hover:text-slate-200 font-bold rounded-lg transition-all duration-150 cursor-pointer active:scale-95"
                        title="Skip this word"
                    >
                        <span>Skip</span>
                        <SkipForward className="w-3.5 h-3.5 text-indigo-400" />
                    </button>
                )}
            </div>

            {activeItems.length === 0 ? (
                /* All caught up state */
                <AllCatchUp totalCards={deckCards.length} />
            ) : currentCardIndex >= activeItems.length ? (
                /* Review stack finished screen */
                <AllCardsDone />
            ) : (
                /* Interactive Flashcard */
                <div className="layout-card-stage">
                    {/* Slick 3D perspective wrapper with key for mounting animations */}
                    <div
                        key={`${activeItem.word.id}-${activeItem.direction}`}
                        className="perspective w-full h-full cursor-pointer mt-1"
                        onClick={() => setIsFlipped(!isFlipped)}
                    >
                        {/* <div className="select-text">{activeItem.word.id}</div> */}
                        <CardComponent word={activeItem.word} direction={activeItem.direction} />
                    </div>

                    {/* Grading / Answer Controls Footer */}
                    <div className="layout-card-footer">
                        {!isFlipped ? null : (
                            /* Premium HSL-Themed SRS Grading Buttons */
                            <AnswerControls activeCard={activeItem.word} direction={activeItem.direction} totalCards={activeItems.length} />
                        )}
                    </div>
                </div>
            )}
        </div>
    );
})
