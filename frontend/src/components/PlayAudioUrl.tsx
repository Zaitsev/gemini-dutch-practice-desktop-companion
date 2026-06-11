import { useCallback } from "react";
import type { Word } from "../provider";
import { Cloud, Volume2 } from "lucide-react";


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
export const PlayAudioUrl: React.FC<{ activeCard: Word }> = ({ activeCard }) => {


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
    return (<>
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
    </>
    );
}