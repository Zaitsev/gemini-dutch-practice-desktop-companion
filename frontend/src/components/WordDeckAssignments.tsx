import { Check, Lock } from "lucide-react";
import { useCallback } from "react";
import { SetWordDeckIds } from "../../wailsjs/go/main/App";
import { useAppStateContext, type Deck, type Word } from "../provider";

const DEFAULT_DECK_ID = "default";
const DEFAULT_DECK_LABEL = "Default";

export const WordDeckAssignments: React.FC<{ activeCard: Word | null }> = ({ activeCard }) => {
    const { decks, setFlashcards, showToast } = useAppStateContext();

    const assignedDeckIds = activeCard?.deckIds?.length ? activeCard.deckIds : [DEFAULT_DECK_ID];
    const customDecks = decks.filter((deck) => deck.id !== DEFAULT_DECK_ID);
    const hasCustomDecks = customDecks.length > 0;

    const handleToggleDeck = useCallback(async (deck: Deck) => {
        if (!activeCard) {
            return;
        }

        const withoutDefault = assignedDeckIds.filter((deckId) => deckId !== DEFAULT_DECK_ID);
        const nextCustomDeckIds = withoutDefault.includes(deck.id)
            ? withoutDefault.filter((deckId) => deckId !== deck.id)
            : [...withoutDefault, deck.id];
        const nextDeckIds = [DEFAULT_DECK_ID, ...nextCustomDeckIds];

        try {
            const success = await SetWordDeckIds(activeCard.id, nextDeckIds);
            if (!success) {
                showToast("Failed to update deck assignment.", "error");
                return;
            }

            setFlashcards((previous) => previous.map((card) => {
                if (card.id !== activeCard.id) {
                    return card;
                }
                return {
                    ...card,
                    deckIds: nextDeckIds,
                };
            }));
            showToast(`Updated ${activeCard.dutch} deck assignment.`, "success");
        } catch (error) {
            console.error("Failed to update deck assignment:", error);
            const message = error instanceof Error ? error.message : String(error);
            showToast(`Failed to update deck assignment: ${message}`, "error");
        }
    }, [activeCard, assignedDeckIds, setFlashcards, showToast]);

    if (!activeCard) {
        return null;
    }

    return (
        <div className="w-full rounded-xl bg-slate-950/45 border border-slate-800/40 p-3 space-y-3 text-left">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500 font-bold">Decks</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Assign this word to one or more decks.</p>
                </div>
                <span className="text-[10px] text-slate-500">{customDecks.length} custom</span>
            </div>

            <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-slate-900/80 border border-slate-700/40 text-slate-300">
                    <Lock className="w-3 h-3 text-slate-500" />
                    {DEFAULT_DECK_LABEL}
                </span>

                {customDecks.map((deck) => {
                    const active = assignedDeckIds.includes(deck.id);
                    return (
                        <button
                            key={deck.id}
                            onClick={() => handleToggleDeck(deck)}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border transition-all cursor-pointer ${active
                                ? "bg-sky-500/10 border-sky-400 text-sky-300"
                                : "bg-slate-900/50 border-slate-800/60 text-slate-400 hover:text-slate-200 hover:border-slate-700/80"
                                }`}
                        >
                            {active ? <Check className="w-3 h-3" /> : null}
                            {deck.name}
                        </button>
                    );
                })}
            </div>

            {!hasCustomDecks && (
                <p className="text-[10px] text-slate-500 leading-normal">
                    Create additional decks in Settings to assign words here.
                </p>
            )}
        </div>
    );
};
