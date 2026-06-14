import { Bell, Clock, IdCardIcon, LogOut, LucideCloudSync, LucideFileStack, LucideFolderSync, LucideWalletCards, RotateCw, User } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
    CreateDeck,
    DeleteDeck,
    Logout,
    RenameDeck,
    SaveInterval,
    SaveAutoHideOnAnswer,
} from "../wailsjs/go/main/App";
import { useAppStateContext } from './provider';
import { APP_VERSION, popUpIntervals } from './const';

const DEFAULT_DECK_ID = "default";
const DEFAULT_DECK_LABEL = "Default";


const getProfileInitials = (displayName?: string, email?: string) => {
    const source = displayName?.trim() || email?.trim() || '';
    if (!source) {
        return 'TG';
    }

    const words = source
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2);

    if (words.length === 0) {
        return 'TG';
    }

    return words
        .map((word) => word[0]?.toUpperCase() || '')
        .join('')
        .slice(0, 2);
};



export function SettingsPage() {
    const { config, setConfig, setFlashcards, setIsLoggedIn, showToast, handleTriggerManualCheck, decks, loadCards } = useAppStateContext();
    const [newDeckName, setNewDeckName] = useState("");
    const [deckNameDrafts, setDeckNameDrafts] = useState<Record<string, string>>({});

    useEffect(() => {
        setDeckNameDrafts((current) => {
            const nextDrafts: Record<string, string> = {};
            for (const deck of decks) {
                if (deck.id === DEFAULT_DECK_ID) {
                    continue;
                }
                nextDrafts[deck.id] = current[deck.id] ?? deck.name;
            }
            return nextDrafts;
        });
    }, [decks]);

    const handleSignOut = useCallback(async () => {
        try {
            const success = await Logout();
            if (success) {
                setIsLoggedIn(false);
                setConfig(null);
                setFlashcards([]);
                showToast("Signed out successfully.", "success");
            }
        } catch (err) {
            console.error("Logout error:", err);
            showToast("Error signing out.", "error");
        }
    }, [setIsLoggedIn, setConfig, setFlashcards, showToast]);
    const handleUpdateInterval = useCallback(async (minutes: number) => {
        try {
            const success = await SaveInterval(minutes);
            if (success) {
                setConfig(prev => prev ? { ...prev, intervalMinutes: minutes } : null);
                showToast(`Interval set to ${minutes} minutes.`, "success");
            } else {
                showToast("Failed to update timing interval.", "error");
            }
        } catch (err) {
            console.error("Error updating interval:", err);
            showToast("Error updating timing interval.", "error");
        }
    }, [setConfig, showToast]);

    const refreshDecksAndCards = useCallback(async () => {
        if (!config) {
            return;
        }
        await loadCards(config, true);
    }, [config, loadCards]);

    const handleCreateDeck = useCallback(async () => {
        const trimmedName = newDeckName.trim();
        if (!trimmedName) {
            showToast("Deck name cannot be empty.", "error");
            return;
        }

        try {
            const success = await CreateDeck(trimmedName);
            if (!success) {
                showToast("Failed to create deck.", "error");
                return;
            }
            setNewDeckName("");
            await refreshDecksAndCards();
            showToast(`Created deck ${trimmedName}.`, "success");
        } catch (error) {
            console.error("Error creating deck:", error);
            showToast(error instanceof Error ? error.message : "Error creating deck.", "error");
        }
    }, [newDeckName, refreshDecksAndCards, showToast]);

    const handleRenameDeck = useCallback(async (deckId: string) => {
        const nextName = deckNameDrafts[deckId]?.trim();
        if (!nextName) {
            showToast("Deck name cannot be empty.", "error");
            return;
        }

        try {
            const success = await RenameDeck(deckId, nextName);
            if (!success) {
                showToast("Failed to rename deck.", "error");
                return;
            }
            await refreshDecksAndCards();
            showToast(`Renamed deck to ${nextName}.`, "success");
        } catch (error) {
            console.error("Error renaming deck:", error);
            showToast(error instanceof Error ? error.message : "Error renaming deck.", "error");
        }
    }, [deckNameDrafts, refreshDecksAndCards, showToast]);

    const handleDeleteDeck = useCallback(async (deckId: string, deckName: string) => {
        if (!window.confirm(`Delete ${deckName}? Words in this deck will move back to default.`)) {
            return;
        }

        try {
            const success = await DeleteDeck(deckId);
            if (!success) {
                showToast("Failed to delete deck.", "error");
                return;
            }
            await refreshDecksAndCards();
            showToast(`Deleted ${deckName}.`, "success");
        } catch (error) {
            console.error("Error deleting deck:", error);
            showToast(error instanceof Error ? error.message : "Error deleting deck.", "error");
        }
    }, [refreshDecksAndCards, showToast]);

    const profileInitials = getProfileInitials(config?.displayName, config?.email);
    const customDecks = decks.filter((deck) => deck.id !== DEFAULT_DECK_ID);


    return (
        <div className="flex-1 flex flex-col justify-between animate-slide-up-fade">
            <div className="space-y-4">
                {/* Google Authenticated User profile badge */}
                {config && (
                    <div className="p-3 rounded-xl bg-slate-900/35 border border-slate-800/30 flex items-center gap-3">
                        {config.photoURL ? (
                            <img src={config.photoURL} alt="Profile" className="w-10 h-10 rounded-full border border-slate-700/50 shadow" />
                        ) : (
                            <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-200 border border-slate-700/50 shadow overflow-hidden">
                                {profileInitials ? (
                                    <span className="text-sm font-bold tracking-wide">{profileInitials}</span>
                                ) : (
                                    <User className="w-5 h-5 text-slate-400" />
                                )}
                            </div>
                        )}
                        <div className="min-w-0">
                            <h4 className="text-sm font-bold text-slate-100 truncate">{config.displayName || 'Learner Profile'}</h4>
                            <p className="text-xs text-slate-400 truncate mt-0.5">{config.email || 'Cloud user'}</p>
                        </div>
                    </div>
                )}
                <div className="p-4 rounded-xl bg-slate-900/35 border border-slate-800/30 space-y-3">
                    <div className="flex items-center gap-2 text-slate-200">
                        <LucideFileStack className="w-4 h-4 text-sky-400" />
                        <h3 className="text-sm font-bold">Decks</h3>
                    </div>

                    <p className="text-xs text-slate-400 leading-normal">
                        The default deck is protected. Create, rename, and delete custom decks here.
                    </p>

                    <div className="flex flex-col gap-2">
                        <div className="flex gap-2">
                            <input
                                value={newDeckName}
                                onChange={(event) => setNewDeckName(event.target.value)}
                                placeholder="New deck name"
                                className="flex-1 min-w-0 rounded-lg bg-slate-950/40 border border-slate-800/60 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 outline-none focus:border-sky-400/60"
                            />
                            <button
                                onClick={handleCreateDeck}
                                className="shrink-0 px-3 py-2 rounded-lg bg-sky-500/10 border border-sky-400/40 text-sky-300 text-xs font-bold hover:bg-sky-500/20 transition-colors cursor-pointer"
                            >
                                Create
                            </button>
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between rounded-lg border border-slate-800/50 bg-slate-950/35 px-3 py-2">
                                <div>
                                    <p className="text-base font-semibold text-slate-100">{DEFAULT_DECK_LABEL}</p>
                                    <p className="text-xs text-slate-500">Always available and cannot be removed.</p>
                                </div>
                                <span className="text-xs uppercase tracking-[0.2em] text-slate-500">Locked</span>
                            </div>

                            {customDecks.map((deck) => (
                                <div key={deck.id} className="rounded-lg border border-slate-800/50 bg-slate-950/35 px-3 py-2 space-y-2">
                                    <div className="flex items-center gap-2">
                                        <input
                                            value={deckNameDrafts[deck.id] ?? deck.name}
                                            onChange={(event) => setDeckNameDrafts((current) => ({ ...current, [deck.id]: event.target.value }))}
                                            className="flex-1 min-w-0 rounded-lg bg-slate-900/60 border border-slate-800/60 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 outline-none focus:border-sky-400/60"
                                        />
                                        <button
                                            onClick={() => handleRenameDeck(deck.id)}
                                            className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors cursor-pointer"
                                        >
                                            Rename
                                        </button>
                                        <button
                                            onClick={() => handleDeleteDeck(deck.id, deck.name)}
                                            className="px-3 py-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-bold transition-colors cursor-pointer"
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
                {/* Challenge Mode */}
                <div className="p-4 rounded-xl bg-slate-900/35 border border-slate-800/30 space-y-3">
                    <div className="flex items-center gap-2 text-slate-200">
                        <IdCardIcon className="w-4 h-4 text-sky-400" />
                        <h3 className="text-sm font-bold">Cards Mode</h3>
                    </div>
                    <p className="text-xs text-slate-400 leading-normal">
                        Cards mode: normal : Dutch &rarr;Translation, reverse : Translation &rarr; Dutch, mixed : Random variant for each card.
                    </p>
                    <div className="flex gap-2 justify-center w-full">
                        {["normal", "reverse", "mixed"].map(mode => {
                            const active = config?.challengeMode || 'normal';
                            return (

                                <button key={mode}
                                    onClick={() => {
                                        setConfig(prev => prev ? { ...prev, challengeMode: mode as any } : null);
                                    }}
                                    className={`py-2 px-4 rounded-lg font-bold text-xs border transition-all cursor-pointer ${active === mode
                                        ? 'bg-sky-500/10 border-sky-400 text-sky-400'
                                        : 'bg-slate-900/30 border-slate-800/40 text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
                                        }`}
                                >
                                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                                </button>
                            )
                        })}
                    </div>


                </div>
                {/* Timing presets dropdown section */}
                <div className="p-4 rounded-xl bg-slate-900/35 border border-slate-800/30 space-y-3">
                    <div className="flex items-center gap-2 text-slate-200">
                        <Clock className="w-4 h-4 text-sky-400" />
                        <h3 className="text-sm font-bold">Popup Timer Frequency</h3>
                    </div>

                    <p className="text-xs text-slate-400 leading-normal">
                        Customize how often the background system checks for reviews and slides open notifications.
                    </p>

                    <div className="grid grid-cols-4 gap-2 pt-1">
                        {popUpIntervals.map((mins) => {
                            const active = config?.intervalMinutes === mins;
                            return (
                                <button
                                    key={mins}
                                    onClick={() => handleUpdateInterval(mins)}
                                    className={`py-2 rounded-lg font-bold text-xs border transition-all cursor-pointer ${active
                                        ? 'bg-sky-500/10 border-sky-400 text-sky-400'
                                        : 'bg-slate-900/30 border-slate-800/40 text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
                                        }`}
                                >
                                    {mins >= 60 ? `${mins / 60}h` : `${mins}m`}
                                </button>
                            );
                        })}
                    </div>
                </div>
                <div className="p-4 rounded-xl bg-slate-900/35 border border-slate-800/30 space-y-3">
                    <div className="flex items-center gap-2 text-slate-200">
                        <h3 className="text-xs font-bold">Auto-Hide on Answer</h3>
                        <input type="checkbox" checked={config?.autoHideOnAnswer || false} onChange={async (e) => {
                            const newValue = e.target.checked;
                            try {
                                const success = await SaveAutoHideOnAnswer(newValue);
                                if (success) {
                                    setConfig(prev => prev ? { ...prev, autoHideOnAnswer: newValue } : null);
                                } else {
                                    showToast("Failed to update Auto-Hide setting.", "error");
                                }
                            } catch (err) {
                                console.error("Error updating Auto-Hide setting:", err);
                                showToast("Error updating Auto-Hide setting.", "error");
                            }
                        }} className="w-4 h-4 rounded border-slate-700/50 text-sky-400 focus:ring-sky-400/30" />


                    </div>
                    <p className="text-[10px] text-slate-400 leading-normal">
                        Automatically hide window on answer.
                    </p>



                </div>
                {/* Manual trigger checklist operations */}
                <div className="p-4 rounded-xl bg-slate-900/35 border border-slate-800/30 space-y-3">
                    <div className="flex items-center gap-2 text-slate-200">
                        <LucideCloudSync className="w-5 h-5 text-indigo-400" />
                        <h3 className="text-sm font-bold">Synchronization</h3>
                    </div>

                    <p className="text-xs text-slate-400 leading-normal">
                        Synchronize data with the main app database.
                    </p>

                    <button
                        onClick={handleTriggerManualCheck}
                        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-800 hover:bg-slate-700/80 border border-slate-700/50 text-slate-200 hover:text-white font-semibold text-xs rounded-lg transition-all cursor-pointer"
                    >
                        <LucideFolderSync className="w-4 h-4 text-indigo-400" />
                        Sync cards
                    </button>
                </div>
            </div>

            {/* Settings Actions Buttons (Footer side) */}
            <div className="space-y-2 mt-4 pt-4 border-t border-slate-800/80">


                <button
                    onClick={handleSignOut}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 hover:text-rose-300 font-bold text-xs rounded-xl transition-all cursor-pointer active:scale-[0.98]"
                >
                    <LogOut className="w-3.5 h-3.5" />
                    Sign Out and Clear Cache
                </button>
            </div>
            <div className="flex text-sm items-center justify-end text-slate-500 px-1 border-t border-slate-800/30 pt-3">
                {/* <span>Database: <strong className="text-slate-400">{config?.useEmulator ? 'Emulator (8080)' : 'Production Cloud'}</strong></span> */}
                <span>App Version: <strong className="text-slate-400">{APP_VERSION}</strong></span>
            </div>
        </div >
    );
}
