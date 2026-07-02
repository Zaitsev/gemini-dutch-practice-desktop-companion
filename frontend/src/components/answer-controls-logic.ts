export type SessionProgressInput = {
  practiceAll: boolean;
  currentCardIndex: number;
  totalCards: number;
};

export const isSessionComplete = ({ practiceAll, currentCardIndex, totalCards }: SessionProgressInput): boolean => {
  if (practiceAll) {
    return currentCardIndex + 1 >= totalCards;
  }
  return totalCards <= 1;
};

export const getNextCardIndex = ({ practiceAll, currentCardIndex }: Pick<SessionProgressInput, "practiceAll" | "currentCardIndex">): number => {
  return practiceAll ? currentCardIndex + 1 : 0;
};
