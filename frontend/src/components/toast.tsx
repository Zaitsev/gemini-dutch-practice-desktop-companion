import { ShieldAlert, Sparkles, X as XIcon, } from "lucide-react";
import { useAppStateContext } from "../provider";

export const Toast: React.FC = () => {
    const { toast, setToast } = useAppStateContext();
    if (!toast) return null;
    const { message, type } = toast;
    return (
        <div className={`absolute top-16 left-4 right-4 z-50 rounded-xl p-3 flex items-center justify-between shadow-2xl backdrop-blur-md border ${toast.type === 'error'
            ? 'bg-red-500/10 border-red-500/20 text-red-200'
            : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-200'
            } animate-slide-up-fade`}>
            <div className="flex items-center gap-2">
                {toast.type === 'error'
                    ? <ShieldAlert className="w-4 h-4 text-red-400" />
                    : <Sparkles className="w-4 h-4 text-emerald-400" />
                }
                <span className="text-xs font-semibold">{toast.message}</span>
            </div>
            <button onClick={() => setToast(null)} className="p-1 hover:bg-white/5 rounded-lg transition-colors">
                <XIcon className="w-3 h-3 opacity-60" />
            </button>
        </div>
    );
}