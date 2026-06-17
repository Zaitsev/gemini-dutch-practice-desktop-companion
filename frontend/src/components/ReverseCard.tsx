import { Eye } from "lucide-react";
import { useAppStateContext, type Word } from "../provider";
import { Examples } from "./Examples";
import { PlayAudioUrl } from "./PlayAudioUrl";
import { WordDeckBadges } from "./WordDeckAssignments";
/** ReverseCard component displays a single word card English->Dutch */
export const ReverseCard: React.FC<{ activeCard: Word }> = ({ activeCard }) => {
    const { isFlipped } = useAppStateContext();

    return (<>
        <div className={`layout-flip-card-root ${isFlipped ? 'rotate-y-180' : 'rotate-y-0'}`}>

            {/* Front (English word) */}
            <div className="layout-flip-card-face">
                {/* Mini info row */}
                <div className="layout-card-mini-row">
                    <span className="layout-card-mini-label">Translation</span>
                </div>

                {/* Word Centerpiece */}
                <div className="layout-card-front-center">
                    <h2 className="layout-card-front-word">
                        {activeCard.english}
                    </h2>

                </div>

                {/* Flip Call-to-action */}
                <div className="layout-card-cta">
                    <Eye className="w-3.5 h-3.5" />
                    Click card or press space to reveal definition
                </div>
            </div>

            {/* Back (English + Context) */}
            <div className="layout-flip-card-face-back">


                {/* Translations Center */}
                <div className="layout-card-back-content">
                    <h4 className="layout-card-back-primary">
                        {activeCard.dutch}
                    </h4>
                    <div className="relative">
                        <PlayAudioUrl activeCard={activeCard} />
                    </div>
                    <h2 className="layout-card-back-secondary">
                        {activeCard.english}
                    </h2>
                    <Examples activeCard={activeCard} />
                    <div className="layout-card-badges">
                        <WordDeckBadges activeCard={activeCard} />
                    </div>
                </div>

                {/* Flipback hint */}
                <div className="layout-card-flipback opacity-60">
                    Click to flip back
                </div>
            </div>

        </div>
    </>
    )
};