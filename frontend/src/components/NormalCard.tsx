import { useAppStateContext, type Word } from "../provider";
import { Examples } from "./Examples";
import { PlayAudioUrl } from "./PlayAudioUrl";
import { WordDeckBadges } from "./WordDeckAssignments";

/** NormalCard component displays a single word card Dutch->English */
export const NormalCard: React.FC<{ activeCard: Word }> = ({ activeCard }) => {
    const { isFlipped } = useAppStateContext();

    return (<>
        <div className={`layout-flip-card-root ${isFlipped ? 'rotate-y-180' : 'rotate-y-0'}`}>

            {/* Front (Dutch word) */}
            <div className="layout-flip-card-face">
                {/* Mini info row */}
                <div className="layout-card-mini-row">
                    <span className="layout-card-mini-label">Dutch</span>
                </div>

                {/* Word Centerpiece */}
                <div className="layout-card-front-center">
                    <h2 className="layout-card-front-word">
                        {activeCard.dutch}
                    </h2>
                    <div className="relative">
                        <PlayAudioUrl activeCard={activeCard} />
                    </div>
                </div>

                {/* Flip Call-to-action */}
                <div className="layout-card-cta">
                    Click card or press space to reveal definition
                </div>
            </div>

            {/* Back (English + Context) */}
            <div className="layout-flip-card-face-back">
                {/* Mini info row */}
       

                {/* Translations Center */}
                <div className="layout-card-back-content">
                    <div className="flex flex-col items-center gap-4 max-w-full max-h-full px-2 ">
                        <h4 className="layout-card-back-primary">
                            {activeCard.dutch}
                        </h4>
                        <div className="relative">
                            <PlayAudioUrl activeCard={activeCard} />
                        </div>
                        <h2 className="layout-card-back-secondary">
                            {activeCard.english}
                        </h2>
                    </div>
                    <div>
                        <Examples activeCard={activeCard} />
                    </div>
                    <div className="layout-card-badges">
                        <WordDeckBadges activeCard={activeCard} />
                        {/* <WordDeckAssignments activeCard={activeCard} /> */}
                    </div>
       
                </div>
             {/* Flipback hint */}
                    <div className="layout-card-flipback">
                        Click to flip back
                    </div>

            </div>

        </div>
    </>
    )
};