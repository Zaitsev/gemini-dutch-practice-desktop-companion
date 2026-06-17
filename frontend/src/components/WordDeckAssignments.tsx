import { Check, Lock, LucideChevronDown, LucideChevronUp, LucideEdit2 } from "lucide-react";
import { useCallback, useState } from "react";
import { SetWordDeckIds } from "../../wailsjs/go/main/App";
import { useAppStateContext, type Deck, type Word } from "../provider";

const DEFAULT_DECK_ID = "default";
const DEFAULT_DECK_LABEL = "Default";


export const WordDeckBadges: React.FC<{ activeCard: Word | null }> = ({ activeCard }) => {
    const { decks, setFlashcards, showToast } = useAppStateContext();
    const assignedDeckIds = activeCard?.deckIds?.length ? activeCard.deckIds : [DEFAULT_DECK_ID];
    const customDecks = decks.filter((deck) => deck.id !== DEFAULT_DECK_ID);
    const handleToggleDeck = useCallback(async (event: React.MouseEvent, deck: Deck) => {
        event.stopPropagation();
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
            // showToast(`Updated ${activeCard.dutch} deck assignment.`, "success");
        } catch (error) {
            console.error("Failed to update deck assignment:", error);
            const message = error instanceof Error ? error.message : String(error);
            showToast(`Failed to update deck assignment: ${message}`, "error");
        }
    }, [activeCard, assignedDeckIds, setFlashcards, showToast]);
    if (!activeCard) {
        return null;
    }
    const wordDecks = decks.filter((deck) => deck.id !== DEFAULT_DECK_ID && assignedDeckIds.includes(deck.id));
    return (
        <>
            <div className="flex items-center justify-between gap-3 cursor-pointer text-xs ">
                {assignedDeckIds.length === 1 && (
                    <span className="cursor-pointer inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full  border  border-sky-500/30 text-sky-500">
                         <Check className="w-3 h-3" />
                        {DEFAULT_DECK_LABEL}
                    </span>
                )}
                {customDecks.map((deck) => {
                    const active = assignedDeckIds.includes(deck.id);
                    const clss=active ? "bg-sky-500/10 border-sky-400 text-sky-300" : "bg-slate-900/50 border-slate-800/60 text-slate-400 hover:text-slate-200 hover:border-slate-700/80";
                    return (
                        <span
                            onClick={(e) => handleToggleDeck(e, deck)}
                            key={deck.id}
                            className={`cursor-pointer inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full  border  ${clss}`}
                        >
                            {active ? <Check className="w-3 h-3" /> : null}
                            {deck.name}
                        </span>
                    );
                })}


            </div>
        </>
    );

};