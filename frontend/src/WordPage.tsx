import { SkipForward } from "lucide-react";
import React, { useCallback, useEffect, useMemo } from "react";
import { HideWindow } from "../wailsjs/go/main/App";
import { AllCardsDone } from "./components/AllCardsDone";
import { AllCatchUp } from "./components/AllCatchUp";
import { AnswerControls } from "./components/AnswerControls";
import { NormalCard } from "./components/NormalCard";
import { NormalImageCard } from "./components/NormalImageCard";
import { ReverseCard } from "./components/ReverseCard";
import { MAX_SRS_LEVEL, MIN_SRS_LEVEL, popUpIntervals, srsIntervalsMinutes, type ChallengeMode, type SRSRating } from "./const";
import { useAppStateContext, type Word } from "./provider";
import { countCardsByCurrentCategory } from "./utils";
/** local replica of updateWordSrsData in gemini-dutch-practice\store\dictionarySlice.ts 
 * 
*/


const CardComponent: React.FC<{ activeCard: Word }> = ({ activeCard }) => {
    const { config } = useAppStateContext();
    const challengeMode = (config?.challengeMode || 'normal') as ChallengeMode;

    const renderedCard = useMemo(() => {
        // 1. Determine if we should show reverse card
        let showReverse = false;
        if (challengeMode === 'reverse') {
            showReverse = true;
        } else if (challengeMode === 'mixed') {
            showReverse = Math.random() > 0.5;
        }

        if (showReverse) {
            return <ReverseCard activeCard={activeCard} />;
        }

        // 2. Determine if we show image variant
        let showImage = false;
        if (activeCard.srsLevel > 5) {
            showImage = Math.random() > 0.3;
        } else if (activeCard.srsLevel > 3) {
            showImage = Math.random() > 0.5;
        }

        if (showImage) {
            return <NormalImageCard activeCard={activeCard} />;
        }

        return <NormalCard activeCard={activeCard} />;
    }, [activeCard, challengeMode]);

    return renderedCard;
};


const WordsCounter: React.FC<{ cards: Word[] }> = ({ cards }) => {
    const { practiceAll, selectedDeckId, setSelectedDeckId, decks } = useAppStateContext();
    const cats = countCardsByCurrentCategory(cards);
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
                        {deck.name}
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
                <span className="text-green-500">{cats.easy}</span> of {cards.length}
            </span>
        </div>
    );
};
export const WordPage: React.FC = React.memo(() => {

    const { flashcards, currentCardIndex, setCurrentCardIndex, isFlipped, setIsFlipped, selectedDeckId } = useAppStateContext();
    const { practiceAll, showToast } = useAppStateContext(); // Practice all words if none are due

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
    //dueCards ordered by nextReviewAt ascending, so the most urgent cards are first in the stack
    const dueCards = useMemo(() => {
        return deckCards
            .filter(c => (c.nextReviewAt || 0) <= nowMs)
            .sort((a, b) => (a.nextReviewAt || 0) - (b.nextReviewAt || 0));
    }, [deckCards, nowMs]);
    // console.log(`Total cards: ${flashcards.length}, Due cards: ${dueCards.length}, Practice all: ${practiceAll}`);
    // const _tmp = flashcards.sort((a, b) => (a.nextReviewAt || 0) - (b.nextReviewAt || 0)).map(c => ({ dutch: c.dutch, srsLevel: c.srsLevel, nextReviewAt: new Date(c.nextReviewAt) })); 
    // console.table(_tmp);

    // flashcards are shuffled randomly on load, so the dueCards order is randomized so when in practiceAll mode they are not in the same order every time
    const activeCards = (practiceAll ? deckCards : dueCards)
    //Due to SRS rescheduling in normal mode we show first _scheduled_ card, but in practiceAll mode we show first _random_ card, so we need to slice the array accordingly
    const activeCard = (practiceAll ? activeCards[currentCardIndex] : activeCards[0]) || null;
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
        if (!activeCard) return;

        setIsFlipped(false);
        setTimeout(() => {
            if (currentCardIndex + 1 >= activeCards.length) {
                showToast("Review session completed.", "success");
                setTimeout(() => {
                    HideWindow();
                }, 3000);
            }else{

                setCurrentCardIndex(currentCardIndex + 1);
            }
        }, 200);
    }, [activeCard, currentCardIndex, activeCards, showToast]);

    return (
        <div className="flex-1 flex flex-col justify-between animate-slide-up-fade">
            {/* Top Bar with selector and words counter. Always visible! */}
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 px-1 mb-2">
                <WordsCounter cards={activeCards} />

                {practiceAll && activeCards.length > 0 && currentCardIndex < activeCards.length && (
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

            {activeCards.length === 0 ? (
                /* All caught up state */
                <AllCatchUp totalCards={deckCards.length} />
            ) : currentCardIndex >= activeCards.length ? (
                /* Review stack finished screen */
                <AllCardsDone />
            ) : (
                /* Interactive Flashcard */
                <div className="flex-1 flex flex-col justify-between">
                    {/* Slick 3D perspective wrapper with key for mounting animations */}
                    <div
                        key={activeCard.id}
                        className="perspective w-full h-full cursor-pointer mt-1"
                        onClick={() => setIsFlipped(!isFlipped)}
                    >
                        {/* <div className="select-text">{activeCard.id}</div> */}
                        <CardComponent activeCard={activeCard} />
                    </div>

                    {/* Grading / Answer Controls Footer */}
                    <div className="h-[90px] flex items-end justify-center">
                        {!isFlipped ? null : (
                            /* Premium HSL-Themed SRS Grading Buttons */
                            <AnswerControls activeCard={activeCard} totalCards={activeCards.length} />
                        )}
                    </div>
                </div>
            )}
        </div>
    );
})
