import { Bell, Clock, IdCardIcon, LogOut, LucideCloudSync, LucideEye, LucideFileStack, LucideFolderSync, LucideRocket, LucideWalletCards, RotateCw, User } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
    CreateDeck,
    DeleteDeck,
    GetLaunchAtLoginStatus,
    Logout,
    RenameDeck,
    SaveInterval,
    SaveAutoHideAfterCards,
    SaveIdleFlashMinutes,
    SetLaunchAtLogin,
    SetMChallengeMode,
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
    const [launchAtLoginEnabled, setLaunchAtLoginEnabled] = useState(false);
    const [launchAtLoginLoading, setLaunchAtLoginLoading] = useState(true);

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

    useEffect(() => {
        let active = true;

        // Implementation note: always read live OS startup artifact state, not config cache.
        GetLaunchAtLoginStatus()
            .then((enabled) => {
                if (!active) {
                    return;
                }
                setLaunchAtLoginEnabled(enabled);
            })
            .catch((error) => {
                if (!active) {
                    return;
                }
                console.error("Error loading launch-at-login status:", error);
                showToast("Unable to read launch-at-login status.", "error");
            })
            .finally(() => {
                if (!active) {
                    return;
                }
                setLaunchAtLoginLoading(false);
            });

        return () => {
            active = false;
        };
    }, [showToast]);

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

    const handleUpdateChallengeMode = useCallback(async (mode: string) => {
        try {
            const success = await SetMChallengeMode(mode);
            if (success) {
                setConfig(prev => prev ? { ...prev, challengeMode: mode } : null);
                showToast(`Cards mode updated to ${mode}.`, "success");
            } else {
                showToast("Failed to update cards mode.", "error");
            }
        } catch (err) {
            console.error("Error updating cards mode:", err);
            showToast("Error updating cards mode.", "error");
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

    const handleToggleLaunchAtLogin = useCallback(async (nextValue: boolean) => {
        setLaunchAtLoginLoading(true);
        try {
            const success = await SetLaunchAtLogin(nextValue);
            if (success) {
                setLaunchAtLoginEnabled(nextValue);
                showToast(nextValue ? "Launch at login enabled." : "Launch at login disabled.", "success");
                return;
            }
            showToast("Failed to update launch-at-login setting.", "error");
        } catch (error) {
            console.error("Error updating launch-at-login:", error);
            showToast("Error updating launch-at-login setting.", "error");
        } finally {
            setLaunchAtLoginLoading(false);
        }
    }, [showToast]);

    const handleUpdateAutoHideAfterCards = useCallback(async (autoHideAfterCards: number) => {
        try {
            const success = await SaveAutoHideAfterCards(autoHideAfterCards);
            if (success) {
                setConfig((prev) => prev ? { ...prev, autoHideAfterCards } : null);
                if (autoHideAfterCards === 0) {
                    showToast("Auto-hide disabled.", "success");
                } else {
                    showToast(`Auto-hide set to every ${autoHideAfterCards} reviewed card${autoHideAfterCards === 1 ? "" : "s"}.`, "success");
                }
                return;
            }
            showToast("Failed to update auto-hide setting.", "error");
        } catch (error) {
            console.error("Error updating auto-hide setting:", error);
            showToast("Error updating auto-hide setting.", "error");
        }
    }, [setConfig, showToast]);

    const handleUpdateIdleFlashMinutes = useCallback(async (minutes: number) => {
        try {
            const success = await SaveIdleFlashMinutes(minutes);
            if (success) {
                setConfig((prev) => prev ? { ...prev, idleFlashMinutes: minutes } : null);
                if (minutes === 0) {
                    showToast("Idle alert disabled.", "success");
                } else {
                    showToast(`Idle alert set to ${minutes} minute${minutes === 1 ? "" : "s"}.`, "success");
                }
                return;
            }
            showToast("Failed to update idle alert setting.", "error");
        } catch (error) {
            console.error("Error updating idle alert setting:", error);
            showToast("Error updating idle alert setting.", "error");
        }
    }, [setConfig, showToast]);

    const profileInitials = getProfileInitials(config?.displayName, config?.email);
    const customDecks = decks.filter((deck) => deck.id !== DEFAULT_DECK_ID);


    return (
        <div className="layout-page-stack">
            <div className="layout-settings-stack">
                {/* Google Authenticated User profile badge */}
                {config && (
                    <div className="layout-settings-section-compact flex items-center gap-3">
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
                <div className="layout-settings-section">
                    <div className="layout-settings-header">
                        <LucideFileStack className="layout-settings-icon text-sky-400" />
                        <h3 className="layout-settings-title">Decks</h3>
                    </div>

                    <p className="layout-settings-help">
                        The default deck is protected. Create, rename, and delete custom decks here.
                    </p>

                    <div className="layout-settings-content-stack">
                        <div className="layout-settings-content-row">
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
                            <div className="flex items-center justify-between rounded-lg border border-slate-800/50 bg-slate-950/35 px-6 py-2">
                                <div>
                                    <p className="text-xs font-semibold text-slate-100">{DEFAULT_DECK_LABEL}</p>
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
                <div className="layout-settings-section">
                    <div className="layout-settings-header">
                        <IdCardIcon className="layout-settings-icon text-sky-400" />
                        <h3 className="layout-settings-title">Cards Mode</h3>
                    </div>
                    <p className="layout-settings-help">
                        Cards mode: normal : Dutch &rarr;Translation, reverse : Translation &rarr; Dutch, mixed : Random variant for each card.
                    </p>
                    <div className="layout-settings-option-row">
                        {["normal", "reverse", "mixed"].map(mode => {
                            const active = config?.challengeMode || 'normal';
                            return (

                                <button key={mode}
                                    onClick={() => handleUpdateChallengeMode(mode)}
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
                <div className="layout-settings-section">
                    <div className="layout-settings-header">
                        <Clock className="layout-settings-icon text-sky-400" />
                        <h3 className="layout-settings-title">Popup Timer Frequency</h3>
                    </div>

                    <p className="layout-settings-help">
                        Customize how often the background system checks for reviews and slides open notifications.
                    </p>

                    <div className="layout-settings-option-grid">
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
                <div className="layout-settings-section">
                    <div className="layout-settings-header">
                        <LucideEye className="layout-settings-icon text-sky-400" />
                        <h3 className="layout-settings-title-compact"> Auto-Hide Threshold</h3>

                        <select
                            value={config?.autoHideAfterCards ?? 1}
                            onChange={(event) => {
                                const value = Number(event.target.value);
                                void handleUpdateAutoHideAfterCards(value);
                            }}
                            className="rounded-lg bg-slate-900/70 border border-slate-700/70 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-sky-400/60"
                            aria-label="Choose auto-hide threshold"
                        >
                            <option value={0}>Off</option>
                            {Array.from({ length: 10 }, (_, index) => index + 1).map((count) => (
                                <option key={count} value={count}>{count}</option>
                            ))}
                        </select>


                    </div>
                    <p className="layout-settings-help-compact">
                        Hide the app after every selected number of reviewed cards.
                    </p>



                </div>
                <div className="layout-settings-section">
                    <div className="layout-settings-header">
                        <Bell className="layout-settings-icon text-sky-400" />
                        <h3 className="layout-settings-title-compact">Idle Alert</h3>
                        <select
                            value={config?.idleFlashMinutes ?? 2}
                            onChange={(event) => {
                                const value = Number(event.target.value);
                                void handleUpdateIdleFlashMinutes(value);
                            }}
                            className="rounded-lg bg-slate-900/70 border border-slate-700/70 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-sky-400/60"
                            aria-label="Choose idle alert interval"
                        >
                            <option value={0}>Off</option>
                            {[0.17, 1, 2, 3, 5].map((mins) => (
                                <option key={mins} value={mins}>{mins < 1 ? '10s' : `${mins}m`}</option>
                            ))}
                        </select>
                    </div>
                    <p className="layout-settings-help-compact">
                        Flash the title bar when the app is idle to catch your attention.
                    </p>
                </div>
                <div className="layout-settings-section">
                    <div className="layout-settings-header">
                        <LucideRocket className="layout-settings-icon text-sky-400" />
                        <h3 className="layout-settings-title-compact">Launch at Login</h3>
                        <label className={`relative inline-flex items-center ${launchAtLoginLoading ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
                            <input
                                type="checkbox"
                                checked={launchAtLoginEnabled}
                                disabled={launchAtLoginLoading}
                                onChange={(event) => {
                                    void handleToggleLaunchAtLogin(event.target.checked);
                                }}
                                className="peer sr-only"
                                aria-label="Toggle launch at login"
                            />
                            <span className="relative h-6 w-11 rounded-full border border-slate-700/70 bg-slate-900/70 transition-colors duration-200 peer-checked:bg-sky-500/30 peer-checked:border-sky-400/60 peer-focus-visible:ring-2 peer-focus-visible:ring-sky-400/40 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-slate-950 after:absolute after:left-1 after:top-1 after:h-4 after:w-4 after:rounded-full after:bg-slate-200 after:shadow after:transition-transform after:duration-200 peer-checked:after:translate-x-5" />
                        </label>
                    </div>
                    <p className="layout-settings-help-compact">
                        Add or remove this app from OS auto-start on demand. If you disable it manually in OS settings, it stays disabled until you enable it here again.
                    </p>
                    <p className="layout-settings-help-muted">
                        Platform details: Windows uses the user Startup folder shortcut. macOS uses a LaunchAgent plist in ~/Library/LaunchAgents.
                    </p>
                </div>
                {/* Manual trigger checklist operations */}
                <div className="layout-settings-section">
                    <div className="layout-settings-header">
                        <LucideCloudSync className="layout-settings-icon-lg text-indigo-400" />
                        <h3 className="layout-settings-title">Synchronization</h3>
                    </div>

                    <p className="layout-settings-help">
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
