import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
    GetWords,
    TriggerPopupCheck
} from "../wailsjs/go/main/App";
const appStateContext = createContext<AppState | null>(null);
const CURRENT_CARD_INDEX_STORAGE_KEY = "desktopCompanion.currentCardIndex";
export interface Word {
    id: string;
    dutch: string;
    english: string;
    context?: string;
    addedAt: number;
    creatorId: string;
    examples?: any[];
    srsLevel: number;
    nextReviewAt: number;
    wordAudioUrl?: string;
    wordTeacherAudioUrl?: string;
}

export interface Config {
    intervalMinutes: number;
    idToken: string;
    refreshToken: string;
    uid: string;
    displayName: string;
    email: string;
    photoURL: string;
    useEmulator: boolean;
}
type AppState = ReturnType<typeof useAppState>;
const useAppState = () => {

    const [config, setConfig] = useState<Config | null>(null);
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [loading, setLoading] = useState(true);
    const [authLoading, setAuthLoading] = useState(false);
    const [flashcards, setFlashcards] = useState<Word[]>([]);
    const [activeTab, setActiveTab] = useState<'reviews' | 'settings'>('reviews');
    const [currentCardIndex, setCurrentCardIndex_] = useState(() => {
        console.log("Initializing currentCardIndex from localStorage...");
        try {
            const savedIndex = localStorage.getItem(CURRENT_CARD_INDEX_STORAGE_KEY);
            if (savedIndex === null) {
                return 0;
            }
            console.log("Found saved currentCardIndex in localStorage:", savedIndex);
            const parsedIndex = Number(savedIndex);
            return Number.isInteger(parsedIndex) && parsedIndex >= 0 ? parsedIndex : 0;
        } catch {
            return 0;
        }
    });

    const setCurrentCardIndex = (index: number) => {
        try {
            localStorage.setItem(CURRENT_CARD_INDEX_STORAGE_KEY, String(currentCardIndex));
        } catch (e) {
            console.error("Failed to save currentCardIndex to localStorage:", e);
        }
        setCurrentCardIndex_(index);
        console.log(`Updated currentCardIndex to ${currentCardIndex} and saved to localStorage.`);
    };
    const [isFlipped, setIsFlipped] = useState(false);
    const [savingSrs, setSavingSrs] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [practiceAll, setPracticeAll] = useState(false); // Practice all words if none are due

  

    const showToast = (message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type });
        setTimeout(() => {
            setToast(null);
        }, 3000);
    };


    const loadCards = useCallback(async (currentConfig: Config) => {
        if (!currentConfig) {
            setFlashcards([]);
            return;
        }
        if (flashcards.length > 0) {
            setLoading(false);
            if (flashcards.length  < currentCardIndex   ) {
                setCurrentCardIndex(0);
            }
            return;
        }

        setLoading(true);
        try {
            const cards = await GetWords();
            setFlashcards(cards || []);
        } catch (err) {
            console.error("Failed to load flashcards:", err);
            const errMsg = err instanceof Error ? err.message : String(err);
            showToast(`Could not retrieve word list: ${errMsg}`, "error");
        } finally {
            setLoading(false);
        }
    }, [showToast]);
    const handleTriggerManualCheck = useCallback(async () => {
        setLoading(true);
        try {
            const dueCount = await TriggerPopupCheck();
            showToast(`Review check done. Found ${dueCount} cards due.`, "success");
            if (config) {
                await loadCards(config);
            }
        } catch (err) {
            console.error("Error running review check:", err);
            showToast("Error performing manual review check.", "error");
        } finally {
            setLoading(false);
        }
    }, [config, loadCards, showToast]);
    return {
        config,
        setConfig,
        isLoggedIn,
        setIsLoggedIn,
        loading,
        setLoading,
        authLoading,
        setAuthLoading,
        flashcards,
        setFlashcards,
        activeTab,
        setActiveTab,
        currentCardIndex,
        setCurrentCardIndex,
        isFlipped,
        setIsFlipped,
        savingSrs,
        setSavingSrs,
        toast,
        setToast,
        practiceAll,
        setPracticeAll,
        showToast,
        loadCards,
        handleTriggerManualCheck
    };
}

export const AppStateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const appState = useAppState();
    return <appStateContext.Provider value={appState}>{children}</appStateContext.Provider>;
}

export const useAppStateContext = () => {
    const context = useContext(appStateContext);
    if (!context) {
        throw new Error("useAppStateContext must be used within an AppStateProvider");
    }
    return context;
}