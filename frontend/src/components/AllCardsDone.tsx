import { Sparkles } from "lucide-react";
import { HideWindow } from "../../wailsjs/go/main/App";
import { useAppStateContext } from "../provider";

export const AllCardsDone: React.FC = () => {
    const { loadCards } = useAppStateContext();
    const { config, setCurrentCardIndex, setIsFlipped } = useAppStateContext();
    const { setPracticeAll } = useAppStateContext(); // Practice all words if none are due
    return (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-yellow-400 to-amber-500 flex items-center justify-center mb-5 text-slate-950 shadow-lg shadow-yellow-500/10 animate-bounce">
                <Sparkles className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-extrabold text-slate-100 tracking-tight">Session Complete!</h2>
            <p className="text-slate-400 text-xs mt-2 max-w-xs leading-relaxed">
                You have reviewed al due cards in this batch. Excellent progress.
            </p>

            <div className="mt-8 flex flex-col gap-2 w-full max-w-[220px]">
                <button
                    onClick={() => {
                        setPracticeAll(false);
                        setCurrentCardIndex(0);
                        setIsFlipped(false);
                        loadCards(config!, true);
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
    )
}