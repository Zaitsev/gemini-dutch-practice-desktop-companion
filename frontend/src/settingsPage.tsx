import { Bell, Clock, LogOut, RotateCw, User } from 'lucide-react';
import { useCallback } from 'react';
import {
    Logout,
    SaveInterval
} from "../wailsjs/go/main/App";
import { useAppStateContext } from './provider';



export function SettingsPage() {
    const { config, setConfig, setFlashcards, setIsLoggedIn, showToast, handleTriggerManualCheck } = useAppStateContext();
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


    return (
        <div className="flex-1 flex flex-col justify-between animate-slide-up-fade">
            <div className="space-y-4">
                {/* Google Authenticated User profile badge */}
                {config && (
                    <div className="p-3 rounded-xl bg-slate-900/35 border border-slate-800/30 flex items-center gap-3">
                        {config.photoURL ? (
                            <img src={config.photoURL} alt="Profile" className="w-10 h-10 rounded-full border border-slate-700/50 shadow" referrerPolicy="no-referrer" />
                        ) : (
                            <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 border border-slate-700/50">
                                <User className="w-5 h-5" />
                            </div>
                        )}
                        <div className="min-w-0">
                            <h4 className="text-xs font-bold text-slate-100 truncate">{config.displayName || 'Learner Profile'}</h4>
                            <p className="text-[10px] text-slate-400 truncate mt-0.5">{config.email || 'Cloud user'}</p>
                        </div>
                    </div>
                )}

                {/* Timing presets dropdown section */}
                <div className="p-4 rounded-xl bg-slate-900/35 border border-slate-800/30 space-y-3">
                    <div className="flex items-center gap-2 text-slate-200">
                        <Clock className="w-4 h-4 text-sky-400" />
                        <h3 className="text-xs font-bold">Popup Timer Frequency</h3>
                    </div>

                    <p className="text-[10px] text-slate-400 leading-normal">
                        Customize how often the background system checks for reviews and slides open notifications.
                    </p>

                    <div className="grid grid-cols-4 gap-2 pt-1">
                        {[15, 30, 60, 120].map((mins) => {
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

                {/* Manual trigger checklist operations */}
                <div className="p-4 rounded-xl bg-slate-900/35 border border-slate-800/30 space-y-3">
                    <div className="flex items-center gap-2 text-slate-200">
                        <Bell className="w-4 h-4 text-indigo-400" />
                        <h3 className="text-xs font-bold">Diagnostics & Testing</h3>
                    </div>

                    <p className="text-[10px] text-slate-400 leading-normal">
                        Manually query Firestore database REST nodes to force check cards.
                    </p>

                    <button
                        onClick={handleTriggerManualCheck}
                        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-800 hover:bg-slate-700/80 border border-slate-700/50 text-slate-200 hover:text-white font-semibold text-xs rounded-lg transition-all cursor-pointer"
                    >
                        <RotateCw className="w-3.5 h-3.5 text-indigo-400" />
                        Force Check Due Reviews
                    </button>
                </div>
            </div>

            {/* Settings Actions Buttons (Footer side) */}
            <div className="space-y-2 pt-4">
                <div className="flex items-center justify-between text-[10px] text-slate-500 px-1 border-t border-slate-800/30 pt-3">
                    <span>Database: <strong className="text-slate-400">{config?.useEmulator ? 'Emulator (8080)' : 'Production Cloud'}</strong></span>
                    <span>Version: <strong className="text-slate-400">v1.0.0</strong></span>
                </div>

                <button
                    onClick={handleSignOut}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 hover:text-rose-300 font-bold text-xs rounded-xl transition-all cursor-pointer active:scale-[0.98]"
                >
                    <LogOut className="w-3.5 h-3.5" />
                    Sign Out and Clear Cache
                </button>
            </div>
        </div>
    );
}
