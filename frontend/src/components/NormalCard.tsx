import { useAppStateContext, type Word } from "../provider";
import { Examples } from "./Examples";
import { PlayAudioUrl } from "./PlayAudioUrl";
import { WordDeckBadges } from "./WordDeckAssignments";

/** NormalCard component displays a single word card Dutch->English */
export const NormalCard: React.FC<{ activeCard: Word }> = ({ activeCard }) => {
    const { isFlipped } = useAppStateContext();

    return (<>
        <div className={`relative w-full h-full duration-500 transform-style-preserve-3d transition-transform ${isFlipped ? 'rotate-y-180' : 'rotate-y-0'}`}>

            {/* Front (Dutch word) */}
            <div className="absolute w-full h-full backface-hidden glass-card rounded-2xl  px-6 pt-6 pb-1 flex flex-col justify-between items-center text-center shadow-lg border border-slate-700/50">
                {/* Mini info row */}
                <div className="w-full flex justify-between items-center text-xs text-slate-500">
                    <span className="uppercase tracking-widest font-bold text-sky-400/80">Dutch</span>
                </div>

                {/* Word Centerpiece */}
                <div className="flex flex-col items-center gap-3">
                    <h2 className="text-4xl  tracking-tight text-slate-100 select-text">
                        {activeCard.dutch}
                    </h2>
                    <div className="relative">
                        <PlayAudioUrl activeCard={activeCard} />
                    </div>
                </div>

                {/* Flip Call-to-action */}
                <div className="text-xs text-slate-500 flex items-center gap-1 opacity-70">
                    Click card or press space to reveal definition
                </div>
            </div>

            {/* Back (English + Context) */}
            <div className="absolute w-full h-full backface-hidden rotate-y-180 glass-card rounded-2xl px-6 pt-6 pb-6 flex flex-col justify-between items-center text-center shadow-lg border border-slate-700/50">
                {/* Mini info row */}
       

                {/* Translations Center */}
                <div className="py-4 min-h-full flex flex-col items-center justify-between gap-2 max-w-full max-h-screen px-2">
                    <div className="flex flex-col items-center gap-4 max-w-full max-h-full px-2 ">
                        <h4 className="text-3xl font-normal tracking-tight text-slate-100 select-text">
                            {activeCard.dutch}
                        </h4>
                        <div className="relative">
                            <PlayAudioUrl activeCard={activeCard} />
                        </div>
                        <h2 className="text-3xl font-normal tracking-tight text-indigo-300 select-text leading-snug">
                            {activeCard.english}
                        </h2>
                    </div>
                    <div>
                        <Examples activeCard={activeCard} />
                    </div>
                    <div className="flex flex-col items-center gap-2 max-w-full max-h-screen px-2">
                        <WordDeckBadges activeCard={activeCard} />
                        {/* <WordDeckAssignments activeCard={activeCard} /> */}
                    </div>
       
                </div>
             {/* Flipback hint */}
                    <div className="text-xs text-slate-500">
                        Click to flip back
                    </div>

            </div>

        </div>
    </>
    )
};