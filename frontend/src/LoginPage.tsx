import { BookOpen, Clock, LoaderCircle } from "lucide-react";
import React from "react";
import {
    Login
} from "../wailsjs/go/main/App";
import { useAppStateContext } from "./provider";
export const LoginPage: React.FC = React.memo(() => {
    const { setAuthLoading,authLoading, setConfig, setIsLoggedIn, showToast, loadCards } = useAppStateContext();
    const handleGoogleLogin = async () => {
        setAuthLoading(true);
        try {
            const updatedConfig = await Login();
            if (updatedConfig && updatedConfig.uid) {
                setConfig(updatedConfig);
                setIsLoggedIn(true);
                showToast("Signed in successfully!", "success");
                await loadCards(updatedConfig);
            }
        } catch (err) {
            console.error("Auth server login error:", err);
            showToast(err instanceof Error ? err.message : "Authentication failed.", "error");
        } finally {
            setAuthLoading(false);
        }
    };


    /* Sleek Glassmorphism Unauthenticated View */


    return (<div className="layout-page-stack py-2">
        <div className="text-center mt-4">
            <h1 className="text-2xl font-extrabold text-slate-100 tracking-tight leading-tight">
                Master Your Dutch Words
            </h1>
            <p className="text-slate-400 text-xs mt-2 max-w-xs mx-auto">
                Spaced repetition card pop-ups directly synced with your Firestore database profiles.
            </p>
        </div>

        {/* Custom Features Grid */}
        <div className="my-5 space-y-3 px-2">
            <div className="layout-feature-row">
                <div className="p-1.5 bg-sky-500/10 rounded-lg text-sky-400 mt-0.5">
                    <Clock className="w-4 h-4" />
                </div>
                <div>
                    <h3 className="text-xs font-bold text-slate-200">Periodic Popup Reviews</h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">Sliding windows trigger above the system taskbar without interrupting full screen apps.</p>
                </div>
            </div>

            <div className="layout-feature-row">
                <div className="p-1.5 bg-indigo-500/10 rounded-lg text-indigo-400 mt-0.5">
                    <BookOpen className="w-4 h-4" />
                </div>
                <div>
                    <h3 className="text-xs font-bold text-slate-200">Centralized SRS Formulas</h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">Soft-reset supermemo heuristics shared between desktop and PWA learning engines.</p>
                </div>
            </div>
        </div>

        {/* Google Authentication Action */}
        <div className="px-2 mb-2">
            <button
                onClick={handleGoogleLogin}
                disabled={authLoading}
                className="w-full flex items-center justify-center gap-3 bg-white text-slate-900 hover:bg-slate-100 font-bold text-sm py-3 px-4 rounded-xl shadow-xl hover:shadow-white/5 transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
                {authLoading ? (
                    <LoaderCircle className="w-4 h-4 text-slate-900 animate-spin" />
                ) : (
                    <svg width="18" height="18" viewBox="0 0 18 18">
                        <path fill="#4285F4" d="M17.64 9.2c0-.63-.06-1.25-.16-1.84H9v3.47h4.84c-.21 1.12-.84 2.07-1.79 2.7l2.77 2.15c1.62-1.5 2.82-3.7 2.82-5.48z" />
                        <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.77-2.15c-.77.52-1.75.83-3.19.83-2.34 0-4.32-1.58-5.03-3.7L1.17 12.9C2.65 15.96 5.58 18 9 18z" />
                        <path fill="#FBBC05" d="M3.97 10.8c-.18-.52-.28-1.07-.28-1.8s.1-1.28.28-1.8L1.17 5.1C.42 6.68 0 8.44 0 10.2s.42 3.52 1.17 5.1l2.8-2.3z" />
                        <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.8 11.43 0 9 0 5.58 0 2.65 2.04 1.17 5.1l2.8 2.3c.71-2.12 2.69-3.7 5.03-3.7z" />
                    </svg>
                )}
                Sign In with Google
            </button>
            <p className="text-[10px] text-slate-500 text-center mt-3">
                Authorizes securely via loopback port 18991 on your local browser.
            </p>
        </div>
    </div>)
})