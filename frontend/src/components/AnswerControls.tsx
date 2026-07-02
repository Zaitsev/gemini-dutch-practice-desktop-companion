import { useCallback, useEffect } from "react";
import type { SRSRating, SrsDirection } from "../const";
import { useAppStateContext, type Word } from "../provider";
import { HideWindow, UpdateSRS } from "../../wailsjs/go/main/App";
import { calculateNextSRS, getSrsBranch } from "../utils";

export const AnswerControls: React.FC<{
    activeCard: Word | null;
    direction: SrsDirection;
    totalCards: number;
}> = ({ activeCard, direction, totalCards }) => {
    const { practiceAll, currentCardIndex, setCurrentCardIndex, setIsFlipped, savingSrs, setSavingSrs, reviewedSinceLastAutoHide, setReviewedSinceLastAutoHide } = useAppStateContext();
    const { config, showToast } = useAppStateContext();
    const handleGradeWord = useCallback(async (rating: SRSRating) => {

        if (!activeCard || savingSrs) return;
        const nowMs = Date.now();
        const currentBranch = getSrsBranch(activeCard, direction);
        const isDue = (currentBranch.nextReviewAt || 0) <= nowMs;

        let success = true;
        
        
        try {
            
            setSavingSrs(true);
            // DO not update SRS if user is just practicing all cards and this card is not actually due
            // This also allows users to use practice all mode for extra practice on non-due cards without affecting their SRS schedule.
            if (!practiceAll || (practiceAll && isDue)) {
                console.log(`Grading word "${activeCard.dutch}" (${direction}) with rating "${rating}". Current SRS level: ${currentBranch.srsLevel}`);
                // 1. Calculate progress using standard shared-learning-logic mathematical models
                const result = calculateNextSRS(currentBranch.srsLevel, rating);


                // 2. Surgical Firestore PATCH via Go Rest Client
                 success = await UpdateSRS(activeCard.id, direction, result.srsLevel, result.nextReviewAt);

                // 3. Keep UI in sync with local state updates, even if the database update fails, to avoid jarring UX where card doesn't move but user has to wait for timeout and then click again
                if (success) {
                    activeCard.srsLevels = {
                        direct: getSrsBranch(activeCard, 'direct'),
                        reverse: getSrsBranch(activeCard, 'reverse'),
                        [direction]: { srsLevel: result.srsLevel, nextReviewAt: result.nextReviewAt },
                    };
                } 
            }
            if (success) {
                // Play subtle success feedback or move to next word if enabled

                setTimeout(() => {
                    if (currentCardIndex + 1 >= totalCards) {
                        // Stack empty
                        showToast("Congratulations! Review session completed.", "success");
                        // Auto hide app to tray after 3 seconds of showing success screen
                        setTimeout(() => {
                            HideWindow();
                        }, 3000);
                    } else {
                        const autoHideAfterCards = config?.autoHideAfterCards ?? 1;
                        const nextReviewedCount = reviewedSinceLastAutoHide + 1;

                        if (autoHideAfterCards > 0 && nextReviewedCount >= autoHideAfterCards) {
                            HideWindow();
                            setReviewedSinceLastAutoHide(0);
                        } else {
                            setReviewedSinceLastAutoHide(nextReviewedCount);
                        }
                        setIsFlipped(false);
                        setCurrentCardIndex(currentCardIndex + 1);
                    }
                }, 200);
            } else {
                console.error("Failed to update SRS: Database update rejected.");
                showToast("Failed to update word state: Database update rejected.", "error");
                setSavingSrs(false);
            }
        } catch (err) {
            console.error("Error updating word progression:", err);
            const errMsg = err instanceof Error ? err.message : String(err);
            showToast(`Error updating card SRS: ${errMsg}`, "error");
        }finally {
            //prevent state to stck in "Saving..." if something goes wrong
            setSavingSrs(false);
        }
    }, [activeCard, direction, savingSrs, currentCardIndex, totalCards, showToast, setIsFlipped, setCurrentCardIndex, setReviewedSinceLastAutoHide, setSavingSrs, reviewedSinceLastAutoHide, config?.autoHideAfterCards]);

    useEffect(() => {
        const handeKeys = async (e: React.KeyboardEvent) => {
            if (e.key === "1" && activeCard) {
                handleGradeWord('again');
            }
            if (e.key === "2" && activeCard) {
                handleGradeWord('hard');
            }
            if (e.key === "3" && activeCard) {
                handleGradeWord('good');
            }
            if (e.key === "4" && activeCard) {
                handleGradeWord('easy');
            }
            // if (e.code === "Space") {
            //     e.preventDefault(); // Prevent page scrolling
            //     setIsFlipped(prev => !prev);
            // }

        }
        window.addEventListener("keydown", handeKeys as any);
        return () => {
            window.removeEventListener("keydown", handeKeys as any);
        };
    }, [handleGradeWord, setIsFlipped]);


    return (<>
        <div className="layout-grid-grades animate-slide-up-fade">
            <button
                disabled={savingSrs}
                onClick={() => handleGradeWord('again')}
                className="flex flex-col items-center gap-1 py-2 rounded-lg bg-red-600/80 hover:bg-red-600 transition-colors cursor-pointer  disabled:opacity-50"
                title='Press "1" or click to repeat now'
            >

                <span className="text-[11px] font-bold">1  Again</span>
            </button>

            <button
                disabled={savingSrs}
                onClick={() => handleGradeWord('hard')}
                className="flex flex-col items-center gap-1 py-2 rounded-lg bg-orange-600/80 hover:bg-orange-600 transition-colors cursor-pointer  disabled:opacity-50"
                title='Press "2" or click for a harder review'
            >
                <span className="text-[11px] font-bold">2  Hard</span>
            </button>

            <button
                disabled={savingSrs}
                onClick={() => handleGradeWord('good')}
                className="flex flex-col items-center gap-1 py-2 rounded-lg bg-blue-600/80 hover:bg-blue-600 transition-colors cursor-pointer  disabled:opacity-50"
                title='Press "3" or click for a standard review'
            >
                <span className="text-[11px] font-bold">3  Good</span>
            </button>

            <button
                disabled={savingSrs}
                onClick={() => handleGradeWord('easy')}
                className="flex flex-col items-center gap-1 py-2 rounded-lg bg-green-600/80 hover:bg-green-600 transition-colors cursor-pointer active:scale-95 disabled:opacity-50"
                title='Press "4" or click for an easier review'
            >
                <span className="text-[11px] font-bold">4  Easy</span>
            </button>
        </div>
    </>
    );
}