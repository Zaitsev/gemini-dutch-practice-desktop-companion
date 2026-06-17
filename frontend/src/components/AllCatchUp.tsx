import { CheckCircle, RefreshCw, Bell } from "lucide-react";
import { useAppStateContext } from "../provider";

export const AllCatchUp: React.FC<{ totalCards: number }> = ({ totalCards }) => {
        const { handleTriggerManualCheck, setPracticeAll, setCurrentCardIndex, setIsFlipped } = useAppStateContext();
    return(<>
             <div className="layout-center-state">
                    <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-5 text-emerald-400 shadow-lg shadow-emerald-500/5 animate-pulse">
                        <CheckCircle className="w-8 h-8" />
                    </div>
                    <h2 className="text-xl font-extrabold text-slate-100 tracking-tight">Helemaal bijgewerkt!</h2>
                    <p className="text-slate-400 text-xs mt-2 max-w-xs leading-relaxed">
                        You are completely caught up on your Dutch flashcards. Awesome job!
                    </p>

                    <div className="layout-center-actions max-w-[240px]">
                        {totalCards > 0 && (
                            <button
                                onClick={() => {
                                    setPracticeAll(true);
                                    setCurrentCardIndex(0);
                                    setIsFlipped(false);
                                }}
                                className="w-full py-2.5 px-4 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/50 text-slate-200 hover:text-white font-semibold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2"
                            >
                                <RefreshCw className="w-3.5 h-3.5" />
                                Practice All Anyway ({totalCards})
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
    </>);
}