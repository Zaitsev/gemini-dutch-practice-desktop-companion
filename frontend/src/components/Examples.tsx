import type { Word } from "../provider";

export const Examples: React.FC<{ activeCard :Word }> = ({ activeCard }) => {

    return (<>
              {activeCard.examples && activeCard.examples.length > 0 && (
                        <div className="mt-1 flex flex-col text-left items-left bg-slate-900/45 px-3 py-2 rounded-xl  overflow-y-auto">
                            {activeCard.examples.map((ex, idx) => {
                                return (
                                    <p key={idx} className="text-2xs text-slate-300 mt-3  select-text leading-normal">
                                       &bull; {ex.mapValue?.fields?.dutch?.stringValue}
                                    </p>
                                );
                            })}

                        </div>
                    )}
    </>);
}