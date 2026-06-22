import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
    ForseRefreshWords,
    GetWordsAndDecks,
    TriggerPopupCheck
} from "../wailsjs/go/main/App";
import type { ChallengeMode, Config } from "./const";
const appStateContext = createContext<AppState | null>(null);
const CURRENT_CARD_INDEX_STORAGE_KEY = "desktopCompanion.currentCardIndex";
const SELECTED_DECK_ID_STORAGE_KEY = "desktopCompanion.selectedDeckId";
export interface Deck {
    id: string;
    name: string;
}
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
    deckIds?: string[];
    wordAudioUrl?: string;
    wordTeacherAudioUrl?: string;
}


type AppState = ReturnType<typeof useAppState>;
const useAppState = () => {

    const [config, setConfig] = useState<Config | null>(null);
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [loading, setLoading] = useState(true);
    const [authLoading, setAuthLoading] = useState(false);
    const [flashcards, setFlashcards] = useState<Word[]>([]);
    const [decks, setDecks] = useState<Deck[]>([]);
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
    const [selectedDeckId, setSelectedDeckId_] = useState<string>(() => {
        try {
            return localStorage.getItem(SELECTED_DECK_ID_STORAGE_KEY) ?? "all";
        } catch {
            return "all";
        }
    });

    const setSelectedDeckId = (deckId: string) => {
        try {
            localStorage.setItem(SELECTED_DECK_ID_STORAGE_KEY, deckId);
            localStorage.setItem(CURRENT_CARD_INDEX_STORAGE_KEY, "0");
        } catch (e) {
            console.error("Failed to save selectedDeckId to localStorage:", e);
        }
        setSelectedDeckId_(deckId);
        setCurrentCardIndex_(0);
        setIsFlipped(false);
    };
    const [isFlipped, setIsFlipped] = useState(false);
    const [savingSrs, setSavingSrs] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [practiceAll, setPracticeAll] = useState(false); // Practice all words if none are due
    const [reviewedSinceLastAutoHide, setReviewedSinceLastAutoHide] = useState(0);



    const showToast = (message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type });
        setTimeout(() => {
            setToast(null);
        }, 3000);
    };


    const loadCards = useCallback(async (currentConfig: Config, forse = false) => {
        console.log("Loading cards ");
        if (!currentConfig) {
            setFlashcards([]);
            return;
        }
        if (!forse && flashcards.length > 0) {
            console.log("Cards already loaded, skipping fetch.");
            setLoading(false);
            if (flashcards.length < currentCardIndex) {
                setCurrentCardIndex(0);
            }
            return;
        }

        setLoading(true);
        try {
            const result = await GetWordsAndDecks();
            const cards = (result?.words || []).sort(() => Math.random() - 0.5);
            console.log(`Fetched ${cards.length} cards from backend.`);
            setFlashcards(cards);
            setDecks(result?.decks || []);
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
            await ForseRefreshWords(); // Ensure we have the latest data before triggering the check
            if (config) {
                await loadCards(config, true);
            }
            const dueCount = await TriggerPopupCheck();
            showToast(`Review check done. Found ${dueCount} cards due.`, "success");

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
        decks,
        setDecks,
        activeTab,
        setActiveTab,
        selectedDeckId,
        setSelectedDeckId,
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
        reviewedSinceLastAutoHide,
        setReviewedSinceLastAutoHide,
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