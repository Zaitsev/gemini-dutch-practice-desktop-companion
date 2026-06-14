import type { Word } from "../provider";

export const Examples: React.FC<{ activeCard :Word }> = ({ activeCard }) => {

    return (<>
              {activeCard.examples && activeCard.examples.length > 0 && (
                        <div className="p-2 flex flex-col text-left items-left bg-slate-900/45rounded-xl  overflow-y-auto">
                            {activeCard.examples.map((ex, idx) => {
                                return (
                                    <div key={idx} className="text-lg text-slate-300 mt-3  select-text py-1 border-t border-slate-700/50">
                                       {/* <span className="ml-[-1em]">&bull;</span> */}
                                      {ex.mapValue?.fields?.dutch?.stringValue}
                                       <div className="text-sm text-slate-400 mt-1  select-text">
                                       {ex.mapValue?.fields?.translation?.stringValue}
                                       </div>
                                    </div>
                                );
                            })}

                        </div>
                    )}
    </>);
}