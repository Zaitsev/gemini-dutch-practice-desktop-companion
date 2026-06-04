import { Bell, CheckCircle, Cloud, Eye, RefreshCw, SkipForward, Sparkles, Volume2 } from "lucide-react";
import React, { useCallback, useEffect } from "react";
import { HideWindow, UpdateSRS } from "../wailsjs/go/main/App";
import { MAX_SRS_LEVEL, MIN_SRS_LEVEL, srsIntervalsMinutes, type SRSRating } from "./const";
import { useAppStateContext } from "./provider";
export function calculateNextSRS(currentLevel: number, rating: SRSRating) {
    let newSrsLevel = currentLevel || 0;
    let nextReviewInMinutes = 0;

    switch (rating) {
        case 'again':
            if (currentLevel > 2) {
                newSrsLevel = Math.max(MIN_SRS_LEVEL, currentLevel - 2);
            } else {
                newSrsLevel = MIN_SRS_LEVEL;
            }
            nextReviewInMinutes = 5;
            break;
        case 'hard':
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

    newSrsLevel = Math.max(MIN_SRS_LEVEL, Math.min(newSrsLevel, MAX_SRS_LEVEL));
    const nextReviewAt = Date.now() + nextReviewInMinutes * 60 * 1000;

    return { srsLevel: newSrsLevel, nextReviewAt };
}
const playBrowserTTS = (text: string) => {
    if ('speechSynthesis' in window) {
        const isCurrentlySpeaking = window.speechSynthesis.speaking;
        if (isCurrentlySpeaking) {
            window.speechSynthesis.cancel();
        }

        // Introducing a short delay prevents the Windows WebView2 / Chromium engine 
        // from clipping/truncating the first syllable (e.g. hearing "lossing" instead of "oplossing").
        const delay = isCurrentlySpeaking ? 150 : 50;
        setTimeout(() => {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'nl-NL';
            const voices = window.speechSynthesis.getVoices();
            const dutchVoice = voices.find(v => v.lang.toLowerCase().includes('nl') || v.lang.toLowerCase().startsWith('nl'));
            if (dutchVoice) {
                utterance.voice = dutchVoice;
            }
            window.speechSynthesis.speak(utterance);
        }, delay);
    }
};
export const WordPage: React.FC = React.memo(() => {
    const { activeTab, config, handleTriggerManualCheck, showToast } = useAppStateContext();
    const { loadCards } = useAppStateContext();
    const { flashcards, currentCardIndex, setCurrentCardIndex, isFlipped, setIsFlipped, savingSrs, setSavingSrs } = useAppStateContext();
    const { practiceAll, setPracticeAll } = useAppStateContext(); // Practice all words if none are due
    // Filter due cards or provide practice stack
    const nowMs = Date.now();
    const dueCards = flashcards.filter(c => c.nextReviewAt <= nowMs);
    const activeCards = practiceAll ? flashcards : dueCards;
    const activeCard = activeCards[currentCardIndex] || null;

    const playTTS = useCallback((e: React.MouseEvent | null, text: string, audioUrl?: string) => {
        if (e) {
            e.stopPropagation(); // Stop flip trigger
        }
        if (audioUrl) {
            const audio = new Audio(audioUrl);
            audio.play().catch(err => {
                console.error("Failed to play cached cloud audio, falling back to browser speech:", err);
                playBrowserTTS(text);
            });
        } else {
            playBrowserTTS(text);
        }
    }, []);

    const handleGradeWord = useCallback(async (rating: SRSRating) => {
        if (!activeCard || savingSrs) return;
        setSavingSrs(true);

        try {
            // 1. Calculate progress using standard shared-learning-logic mathematical models
            const result = calculateNextSRS(activeCard.srsLevel, rating);

            // 2. Surgical Firestore PATCH via Go Rest Client
            const success = await UpdateSRS(activeCard.id, result.srsLevel, result.nextReviewAt);

            if (success) {
                // Play subtle success feedback or speak next word if enabled
                setIsFlipped(false);
                setTimeout(() => {
                    if (currentCardIndex + 1 >= activeCards.length) {
                        // Stack empty
                        showToast("Congratulations! Review session completed.", "success");
                        // Auto hide app to tray after 3 seconds of showing success screen
                        setTimeout(() => {
                            HideWindow();
                        }, 3000);
                    }
                    setCurrentCardIndex(currentCardIndex + 1);
                    setSavingSrs(false);
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
            setSavingSrs(false);
        }
    }, [activeCard, savingSrs, currentCardIndex, activeCards, showToast, setIsFlipped, setCurrentCardIndex, setSavingSrs]);
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
            if (e.code === "Space") {
                e.preventDefault(); // Prevent page scrolling
                setIsFlipped(prev => !prev);
            }

        }
        window.addEventListener("keydown", handeKeys as any);
        return () => {
            window.removeEventListener("keydown", handeKeys as any);
        };
    }, [handleGradeWord, setIsFlipped]);

    const handleSkipWord = useCallback(() => {
        if (!activeCard) return;

        setIsFlipped(false);
        setTimeout(() => {
            if (currentCardIndex + 1 >= activeCards.length) {
                showToast("Review session completed.", "success");
                setTimeout(() => {
                    HideWindow();
                }, 3000);
            }
            setCurrentCardIndex(currentCardIndex + 1);
        }, 200);
    }, [activeCard, currentCardIndex, activeCards, showToast]);
    console.log(currentCardIndex, activeCards.length);
    return (
        <div className="flex-1 flex flex-col justify-between animate-slide-up-fade">
            {activeCards.length === 0 ? (
                /* All caught up state */
                <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                    <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-5 text-emerald-400 shadow-lg shadow-emerald-500/5 animate-pulse">
                        <CheckCircle className="w-8 h-8" />
                    </div>
                    <h2 className="text-xl font-extrabold text-slate-100 tracking-tight">Helemaal bijgewerkt!</h2>
                    <p className="text-slate-400 text-xs mt-2 max-w-xs leading-relaxed">
                        You are completely caught up on your Dutch flashcards. Awesome job!
                    </p>

                    <div className="mt-8 flex flex-col gap-2 w-full max-w-[240px]">
                        {flashcards.length > 0 && (
                            <button
                                onClick={() => {
                                    setPracticeAll(true);
                                    setCurrentCardIndex(0);
                                    setIsFlipped(false);
                                }}
                                className="w-full py-2.5 px-4 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/50 text-slate-200 hover:text-white font-semibold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2"
                            >
                                <RefreshCw className="w-3.5 h-3.5" />
                                Practice All Anyway ({flashcards.length})
                            </button>
                        )}

                        <button
                            onClick={handleTriggerManualCheck}
                            className="w-full py-2.5 px-4 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 font-semibold text-xs rounded-xl transition-all border border-sky-500/20 cursor-pointer flex items-center justify-center gap-2"
                        >
                            <Bell className="w-3.5 h-3.5 animate-bounce" />
                            Check For Due Cards
                        </button>
                    </div>
                </div>
            ) : currentCardIndex >= activeCards.length ? (
                /* Review stack finished screen */
                <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-yellow-400 to-amber-500 flex items-center justify-center mb-5 text-slate-950 shadow-lg shadow-yellow-500/10 animate-bounce">
                        <Sparkles className="w-8 h-8" />
                    </div>
                    <h2 className="text-xl font-extrabold text-slate-100 tracking-tight">Session Complete!</h2>
                    <p className="text-slate-400 text-xs mt-2 max-w-xs leading-relaxed">
                        You have reviewed all {activeCards.length} due cards in this batch. Excellent progress.
                    </p>

                    <div className="mt-8 flex flex-col gap-2 w-full max-w-[220px]">
                        <button
                            onClick={() => {
                                setPracticeAll(false);
                                setCurrentCardIndex(0);
                                setIsFlipped(false);
                                loadCards(config!);
                            }}
                            className="w-full py-2.5 px-4 bg-sky-500 hover:bg-sky-600 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-xl hover:shadow-sky-500/10 cursor-pointer"
                        >
                            Return to Deck
                        </button>
                        <button
                            onClick={() => HideWindow()}
                            className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl transition-all border border-slate-700/50 cursor-pointer"
                        >
                            Close Pop-up
                        </button>
                    </div>
                </div>
            ) : (
                /* Interactive Flashcard */
                <div className="flex-1 flex flex-col justify-between">
                    {/* Progress Indicator */}
                    <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 px-1 mb-2">
                        <div className="flex items-center gap-2">
                            <span className="bg-slate-800/60 px-2 py-0.5 rounded-md border border-slate-700/30">
                                {practiceAll ? 'Practice stack' : 'Due stack'}
                            </span>
                            <span className="text-slate-500">
                                Card {currentCardIndex + 1} of {activeCards.length}
                            </span>
                        </div>

                        <button
                            onClick={handleSkipWord}
                            className="flex items-center gap-1 py-1 px-2.5 bg-slate-800/40 hover:bg-slate-800/80 border border-slate-700/30 hover:border-slate-700/60 text-slate-400 hover:text-slate-200 font-bold rounded-lg transition-all duration-150 cursor-pointer active:scale-95"
                            title="Skip this word"
                        >
                            <span>Skip</span>
                            <SkipForward className="w-3.5 h-3.5 text-indigo-400" />
                        </button>
                    </div>

                    {/* Slick 3D perspective wrapper with key for mounting animations */}
                    <div
                        key={activeCard.id}
                        className="perspective w-full h-[220px] cursor-pointer mt-1"
                        onClick={() => setIsFlipped(!isFlipped)}
                    >
                        <div className={`relative w-full h-full duration-500 transform-style-preserve-3d transition-transform ${isFlipped ? 'rotate-y-180' : ''}`}>

                            {/* Front (Dutch word) */}
                            <div className="absolute w-full h-full backface-hidden glass-card rounded-2xl p-6 flex flex-col justify-between items-center text-center shadow-lg border border-slate-700/50">
                                {/* Mini info row */}
                                <div className="w-full flex justify-between items-center text-[10px] text-slate-500">
                                    <span className="uppercase tracking-widest font-bold text-sky-400/80">Dutch</span>
                                    <span className="flex items-center gap-1 font-medium bg-slate-900/40 px-1.5 py-0.5 rounded border border-slate-800/40">
                                        Level {activeCard.srsLevel}
                                    </span>
                                </div>

                                {/* Word Centerpiece */}
                                <div className="flex flex-col items-center gap-3">
                                    <h2 className="text-3xl font-extrabold tracking-tight text-slate-100 select-text">
                                        {activeCard.dutch}
                                    </h2>
                                    <div className="relative">
                                        <button
                                            onClick={(e) => {
                                                playTTS(e, activeCard.dutch, activeCard.wordAudioUrl);
                                            }}
                                            className="p-3 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 hover:text-sky-300 rounded-full transition-all duration-150 cursor-pointer border border-sky-500/10 active:scale-95 shadow-lg shadow-sky-500/5 hover:shadow-sky-500/10"
                                            title={activeCard.wordAudioUrl ? "Play Premium Cloud Pronunciation" : "Play Pronunciation"}
                                        >
                                            <Volume2 className="w-5 h-5" />
                                        </button>
                                        {activeCard.wordAudioUrl && (
                                            <span
                                                className="absolute -top-1 -right-1 flex h-4.5 w-4.5 pointer-events-none items-center justify-center bg-[#0b0f19] rounded-full border border-sky-500/30 text-sky-400 p-0.5 animate-pulse"
                                                title="Audio saved in the cloud"
                                            >
                                                <Cloud className="w-2.5 h-2.5" />
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Flip Call-to-action */}
                                <div className="text-[10px] text-slate-500 flex items-center gap-1 opacity-70">
                                    <Eye className="w-3.5 h-3.5" />
                                    Click card or press space to reveal definition
                                </div>
                            </div>

                            {/* Back (English + Context) */}
                            <div className="absolute w-full h-full backface-hidden rotate-y-180 glass-card rounded-2xl p-5 flex flex-col justify-between items-center text-center shadow-lg border border-slate-700/50">
                                {/* Reference header */}
                                <div className="w-full flex justify-between items-center text-[10px] text-slate-500">
                                    <span className="font-bold text-slate-400 select-text">{activeCard.dutch}</span>
                                    <span className="uppercase tracking-widest font-bold text-indigo-400/80">English</span>
                                </div>

                                {/* Translations Center */}
                                <div className="flex flex-col items-center gap-2 max-w-full px-2">
                                    <h2 className="text-2xl font-extrabold tracking-tight text-indigo-300 select-text leading-snug">
                                        {activeCard.english}
                                    </h2>
                                    {activeCard.context && (
                                        <div className="mt-1 bg-slate-900/45 px-3 py-2 rounded-xl border border-slate-850/50 max-h-[70px] overflow-y-auto w-full">
                                            <p className="text-[11px] text-slate-400 italic select-text leading-normal">
                                                "{activeCard.context}"
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {/* Flipback hint */}
                                <div className="text-[9px] text-slate-500 opacity-60">
                                    Click to flip back
                                </div>
                            </div>

                        </div>
                    </div>

                    {/* Grading / Answer Controls Footer */}
                    <div className="h-[90px] flex items-end justify-center">
                        {!isFlipped ? null : (
                            /* Premium HSL-Themed SRS Grading Buttons */
                            <div className="w-full grid grid-cols-4 gap-2 animate-slide-up-fade">
                                <button
                                    disabled={savingSrs}
                                    onClick={() => handleGradeWord('again')}
                                    className="flex flex-col items-center gap-1 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 hover:text-rose-300 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                                    title="Review again in 5 minutes"
                                >
                                    <span className="text-[11px] font-bold">Again</span>
                                    <span className="text-[9px] opacity-75">5m</span>
                                </button>

                                <button
                                    disabled={savingSrs}
                                    onClick={() => handleGradeWord('hard')}
                                    className="flex flex-col items-center gap-1 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-400 hover:text-amber-300 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                                    title="Same level, shorter review gap"
                                >
                                    <span className="text-[11px] font-bold">Hard</span>
                                    <span className="text-[9px] opacity-75">Shorter</span>
                                </button>

                                <button
                                    disabled={savingSrs}
                                    onClick={() => handleGradeWord('good')}
                                    className="flex flex-col items-center gap-1 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 hover:text-emerald-300 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                                    title="Advance 1 level, standard SRS gap"
                                >
                                    <span className="text-[11px] font-bold">Good</span>
                                    <span className="text-[9px] opacity-75">+1 Lvl</span>
                                </button>

                                <button
                                    disabled={savingSrs}
                                    onClick={() => handleGradeWord('easy')}
                                    className="flex flex-col items-center gap-1 py-2 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 text-sky-400 hover:text-sky-300 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                                    title="Advance 2 levels, long review gap"
                                >
                                    <span className="text-[11px] font-bold">Easy</span>
                                    <span className="text-[9px] opacity-75">4</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
})
