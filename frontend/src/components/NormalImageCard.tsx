import { useMemo } from "react";
import { Eye } from "lucide-react";
import { useAppStateContext, type Word } from "../provider";
import { PlayAudioUrl } from "./PlayAudioUrl";
import { Examples } from "./Examples";
import { NormalCard } from "./NormalCard";
import { WordDeckBadges } from "./WordDeckAssignments";


/** struct of Image variants: 
{
    "mapValue": {
        "fields": {
            "large": {
                "stringValue": "https://firebasestorage.googleapis.com/v0/b/gemini-dutch-practice-latest.firebasestorage.app/o/images%2FIABSB5oFKQWY5KGsFE5Glgpy8T93%2F1778538006081_u87484_large.jpg?alt=media&token=3c16ef36-85ea-4594-a6e0-be100eff78fc"
            },
            "medium": {
                "stringValue": "https://firebasestorage.googleapis.com/v0/b/gemini-dutch-practice-latest.firebasestorage.app/o/images%2FIABSB5oFKQWY5KGsFE5Glgpy8T93%2F1778538006081_u87484_medium.jpg?alt=media&token=15e792a8-7438-44ba-adb5-9f4ba1915a71"
            },
            "small": {
                "stringValue": "https://firebasestorage.googleapis.com/v0/b/gemini-dutch-practice-latest.firebasestorage.app/o/images%2FIABSB5oFKQWY5KGsFE5Glgpy8T93%2F1778538006081_u87484_small.jpg?alt=media&token=7082dd64-8671-42e4-b3c8-3c5f1d6d1f38"
            }
        }
    }
}
*/
function getRandomExampleWithImage(examples: Word['examples']): { imageUrl: string, maskedSentence: string } | null {
    if (!examples || examples.length === 0) {
        return null;
    }
    const examplesWithImages = examples.filter(ex => ex.mapValue?.fields?.imageVariants?.mapValue?.fields?.medium?.stringValue);
    if (!examplesWithImages.length) {
        return null;
    }
    const randomExample = examplesWithImages[Math.floor(Math.random() * examplesWithImages.length)].mapValue?.fields;
    if (!randomExample) {
        return null;
    }
    const imageUrl = randomExample.imageVariants?.mapValue?.fields?.medium?.stringValue;
    const maskedSentence = randomExample.maskedSentence?.stringValue || randomExample.maskedPhrase?.stringValue || null;
    if (!imageUrl || !maskedSentence) {
        return null;
    }
    return { imageUrl, maskedSentence };
}

/** NormalImageCard component displays a single word card Dutch->English, prioritizing examples with images if available */

/** NormalImageCard component displays a single word card Dutch->English */
export const NormalImageCard: React.FC<{ activeCard: Word }> = ({ activeCard }) => {
    const { isFlipped } = useAppStateContext();
    const randomExample = useMemo(() => {
        return getRandomExampleWithImage(activeCard.examples);
    }, [activeCard.id, activeCard.examples]);

    if (!randomExample) {
        return <NormalCard activeCard={activeCard} />;
    }
    return (<>
        <div className={`relative w-full h-full duration-500 transform-style-preserve-3d transition-transform ${isFlipped ? 'rotate-y-180' : 'rotate-y-0'}`}>

            {/* Front (Dutch word) */}
            <div className="absolute w-full h-full backface-hidden glass-card rounded-2xl p-6 flex flex-col justify-between items-center text-center shadow-lg border border-slate-700/50">
                {/* Mini info row */}

                {/* Word Centerpiece */}
                <div className="flex flex-col items-center gap-3">
                    <img src={randomExample.imageUrl} alt="Example" className="w-full h-full object-cover rounded-md shadow-md" />
                    <h2 className="text-2xs  tracking-tight text-slate-100 select-text">
                        {randomExample.maskedSentence}
                    </h2>

                </div>

                {/* Flip Call-to-action */}
                <div className="text-xs text-slate-500 flex items-center gap-1 opacity-70">
                    <Eye className="w-3.5 h-3.5" />
                    Click card or press space to reveal definition
                </div>
            </div>

            {/* Back (English + Context) */}
            <div className="absolute w-full h-full backface-hidden rotate-y-180 glass-card rounded-2xl p-5 flex flex-col justify-between items-center text-center shadow-lg border border-slate-700/50">


                {/* Translations Center */}
                <div className="flex flex-col items-center gap-2 max-w-full max-h-screen px-2">
                    <h4 className="text-3xl font-normal tracking-tight text-slate-100 select-text">
                        {activeCard.dutch}
                    </h4>
                    <div className="relative">
                        <PlayAudioUrl activeCard={activeCard} />
                    </div>
                    <h2 className="text-3xl font-normal tracking-tight text-indigo-300 select-text leading-snug">
                        {activeCard.english}
                    </h2>
                    <Examples activeCard={activeCard} />
                </div>
                <div className="flex flex-col items-center gap-2 max-w-full max-h-screen px-2">
                    <WordDeckBadges activeCard={activeCard} />
                    {/* <WordDeckAssignments activeCard={activeCard} /> */}
                </div>
                {/* Flipback hint */}
                <div className="text-xs text-slate-500 opacity-60">
                    Click to flip back
                </div>
            </div>

        </div>
    </>
    )
};