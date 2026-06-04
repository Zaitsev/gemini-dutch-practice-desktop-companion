import {
  Bell,
  BookOpen,
  ChevronDown,
  LoaderCircle,
  Settings as SettingsIcon,
  TimerOff,
  X
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ClearDnd,
  GetDndStatus,
  GetConfig,
  HideWindow,
  SetDndMinutes,
  SaveWindowState
} from "../wailsjs/go/main/App";
import { EventsOff, EventsOn } from "../wailsjs/runtime";
import logoSvg from './assets/images/gemini-dutch-practice-logo.svg';
import { Toast } from './components/toast';
import { LoginPage } from './LoginPage';
import { useAppStateContext } from './provider';
import { SettingsPage } from './settingsPage';
import { WordPage } from './WordPage';









type DndStatus = {
  active: boolean;
  endTimestamp: number;
  remainingMs: number;
  durationMinutes: number;
};

const EMPTY_DND_STATUS: DndStatus = {
  active: false,
  endTimestamp: 0,
  remainingMs: 0,
  durationMinutes: 0,
};

function App() {
  const { config, setConfig, isLoggedIn, setIsLoggedIn, loading, setLoading, showToast } = useAppStateContext();
  const { loadCards } = useAppStateContext();
  const { authLoading, setAuthLoading, flashcards, setFlashcards, activeTab, setActiveTab, currentCardIndex, setCurrentCardIndex, isFlipped, setIsFlipped, savingSrs, setSavingSrs } = useAppStateContext();
  const { practiceAll, setPracticeAll } = useAppStateContext(); // Practice all words if none are due
  const resizeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dndStatus, setDndStatus] = useState<DndStatus>(EMPTY_DND_STATUS);
  const [dndMenuOpen, setDndMenuOpen] = useState(false);
  const dndMenuRef = useRef<HTMLDivElement | null>(null);

  const refreshDndStatus = async () => {
    try {
      const status = await GetDndStatus();
      setDndStatus(status || EMPTY_DND_STATUS);
    } catch (err) {
      console.error("Failed to read DND status:", err);
    }
  };

  const formatDndRemaining = (remainingMs: number) => {
    if (remainingMs <= 0) {
      return "0m";
    }

    const totalMinutes = Math.ceil(remainingMs / (60 * 1000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours > 0 && minutes > 0) {
      return `${hours}h ${minutes}m`;
    }
    if (hours > 0) {
      return `${hours}h`;
    }
    return `${minutes}m`;
  };

  const dndRemainingLabel = useMemo(() => formatDndRemaining(dndStatus.remainingMs), [dndStatus.remainingMs]);

  const setDndForMinutes = async (minutes: number) => {
    try {
      const success = await SetDndMinutes(minutes);
      if (!success) {
        showToast("Failed to enable DND mode.", "error");
        return;
      }
      await refreshDndStatus();
      setDndMenuOpen(false);
      const hours = minutes / 60;
      const durationLabel = minutes >= 60 ? `${hours} ${hours === 1 ? "hour" : "hours"}` : `${minutes} minutes`;
      showToast(`DND enabled for ${durationLabel}.`, "success");
    } catch (err) {
      console.error("Failed to set DND mode:", err);
      showToast("Failed to enable DND mode.", "error");
    }
  };

  const cancelDnd = async () => {
    try {
      const success = await ClearDnd();
      if (!success) {
        showToast("Failed to disable DND mode.", "error");
        return;
      }
      await refreshDndStatus();
      setDndMenuOpen(false);
      showToast("DND disabled.", "success");
    } catch (err) {
      console.error("Failed to disable DND mode:", err);
      showToast("Failed to disable DND mode.", "error");
    }
  };

  // Load configuration and auto-login on startup
  useEffect(() => {
    async function initApp() {
      try {
        const currentConfig = await GetConfig();
        if (currentConfig && currentConfig.uid && currentConfig.idToken) {
          setConfig(currentConfig);
          setIsLoggedIn(true);
          await loadCards(currentConfig);
        } else {
          setConfig(currentConfig);
          setIsLoggedIn(false);
        }
      } catch (err) {
        console.error("Failed to load initial configuration:", err);
        showToast("Failed to load settings. Please log in again.", "error");
      } finally {
        setLoading(false);
      }
    }

    initApp();
  refreshDndStatus();

    // Register Wails Event Listeners
    EventsOn("auth_state_changed", handleAuthStateChanged);
    EventsOn("trigger_flashcard_review", handleTriggerFlashcardReview);
  EventsOn("dnd_state_changed", handleDndStateChanged);

    // Global escape key handler to close/hide pop-up window
    const handleEscapeKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        HideWindow();
      }
    };
    window.addEventListener("keydown", handleEscapeKeyDown);

    // Save window position+size after user resizes (debounced to avoid thrashing)
    const handleResize = () => {
      if (resizeTimer.current) clearTimeout(resizeTimer.current);
      resizeTimer.current = setTimeout(() => SaveWindowState(), 500);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      EventsOff("auth_state_changed");
      EventsOff("trigger_flashcard_review");
      EventsOff("dnd_state_changed");
      window.removeEventListener("keydown", handleEscapeKeyDown);
      window.removeEventListener("resize", handleResize);
      if (resizeTimer.current) clearTimeout(resizeTimer.current);
    };
  }, []);

  const handleAuthStateChanged = (newConfig: any) => {
    if (newConfig && newConfig.uid && newConfig.idToken) {
      setConfig(newConfig);
      setIsLoggedIn(true);
      loadCards(newConfig);
    } else {
      setConfig(newConfig || null);
      setIsLoggedIn(false);
      setFlashcards([]);
    }
  };

  const handleTriggerFlashcardReview = () => {
    console.log("Received trigger_flashcard_review event from backend");
    // Activate review tab

    // setActiveTab("reviews");
    // setPracticeAll(false);
    // setIsFlipped(false);
  };

  const handleDndStateChanged = (status: DndStatus) => {
    setDndStatus(status || EMPTY_DND_STATUS);
  };

  useEffect(() => {
    if (!dndStatus.active) {
      return;
    }

    const timer = setInterval(() => {
      setDndStatus((current) => {
        if (!current.active) {
          return current;
        }

        const remainingMs = Math.max(current.endTimestamp - Date.now(), 0);
        if (remainingMs === 0) {
          refreshDndStatus();
          return EMPTY_DND_STATUS;
        }

        return {
          ...current,
          remainingMs,
        };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [dndStatus.active]);

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!dndMenuRef.current) {
        return;
      }

      if (!dndMenuRef.current.contains(event.target as Node)) {
        setDndMenuOpen(false);
      }
    };

    if (dndMenuOpen) {
      document.addEventListener("mousedown", closeOnOutsideClick);
    }

    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
    };
  }, [dndMenuOpen]);

  // const loadCards = async (currentConfig: Config) => {
  //   setLoading(true);
  //   try {
  //     const cards = await GetFlashcards();
  //     setFlashcards(cards || []);
  //   } catch (err) {
  //     console.error("Failed to load flashcards:", err);
  //     const errMsg = err instanceof Error ? err.message : String(err);
  //     showToast(`Could not retrieve word list: ${errMsg}`, "error");
  //   } finally {
  //     setLoading(false);
  //   }
  // };

  // const showToast = (message: string, type: 'success' | 'error' = 'success') => {
  //   setToast({ message, type });
  //   setTimeout(() => {
  //     setToast(null);
  //   }, 3000);
  // };









  // Filter due cards or provide practice stack
  const nowMs = Date.now();
  const dueCards = flashcards.filter(c => c.nextReviewAt <= nowMs);
  const activeCards = practiceAll ? flashcards : dueCards;
  const activeCard = activeCards[currentCardIndex] || null;





  if (loading && flashcards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full bg-[#0b0f19] text-slate-100">
        <LoaderCircle className="w-10 h-10 text-sky-400 animate-spin mb-4" />
        <p className="text-slate-400 text-sm font-medium">Bootstrapping TaalGem...</p>
      </div>
    );
  }

  return (
    <div tabIndex={0} className="flex flex-col h-full w-full bg-[#0b0f19] text-slate-100 overflow-hidden relative font-sans">
      {/* Dynamic Toast System */}
      <Toast />

      {/* Modern Custom Drag Bar Header */}
      <header className="h-14 flex items-center justify-between px-4 border-b border-slate-800/40 bg-slate-950/20 backdrop-blur-md relative z-40" style={{ ['--wails-draggable' as any]: 'drag' }}>
        <div className="flex items-center gap-2">
          <img src={logoSvg} alt="TaalGem Logo" className="w-7 h-7 object-contain drop-shadow" />
          <span className="font-bold text-sm bg-gradient-to-r from-sky-400 to-indigo-300 bg-clip-text text-transparent">TaalGem Companion</span>
        </div>
        <div className="flex items-center gap-1" style={{ ['--wails-draggable' as any]: 'no-drag' }}>
          {activeTab === 'reviews' && (
            <button
              onClick={() => setActiveTab('settings')}
              className="flex flex-col items-center gap-1 py-1 px-4 rounded-xl transition-all cursor-pointer text-slate-400 hover:text-slate-200"
            >
              <SettingsIcon className="w-4 h-4" />
            </button>
          )}
          {activeTab === 'settings' && (<button
            onClick={() => {
              setActiveTab('reviews');
              setPracticeAll(false);
              setCurrentCardIndex(0);
              setIsFlipped(false);
            }}
            className="flex flex-col items-center gap-1 py-1 px-4 rounded-xl transition-all cursor-pointer relative text-slate-400 hover:text-slate-200"
          >
            <BookOpen className="w-4 h-4" />
            {/* Due Reviews Notification dot */}
            {dueCards.length > 0 && (
              <span className="absolute top-1.5 right-4 w-2 h-2 bg-rose-500 rounded-full border border-[#0b0f19]" />
            )}
          </button>)}

          <div className="relative" ref={dndMenuRef}>
            <button
              onClick={() => setDndMenuOpen((open) => !open)}
              className={`flex items-center gap-1.5 py-1.5 px-2.5 rounded-lg transition-all cursor-pointer ${dndStatus.active ? 'text-amber-300 bg-amber-500/10 border border-amber-500/30' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'}`}
              title="Do Not Disturb"
            >
              <Bell className="w-4 h-4" />
              <ChevronDown className="w-3.5 h-3.5" />
            </button>

            {dndMenuOpen && (
              <div
                className="absolute right-0 mt-2 w-44 rounded-xl border border-slate-700 bg-[#0b1220] shadow-2xl p-2 z-[200] pointer-events-auto"
                style={{ ['--wails-draggable' as any]: 'no-drag' }}
              >
                <p className="text-[10px] text-slate-400 px-2 pb-1">Pause auto wake-ups</p>
                <button onClick={() => setDndForMinutes(30)} className="w-full text-left px-2 py-1.5 text-xs rounded-md text-slate-200 hover:bg-slate-800" style={{ ['--wails-draggable' as any]: 'no-drag' }}>30 minutes</button>
                <button onClick={() => setDndForMinutes(60)} className="w-full text-left px-2 py-1.5 text-xs rounded-md text-slate-200 hover:bg-slate-800" style={{ ['--wails-draggable' as any]: 'no-drag' }}>1 hour</button>
                <button onClick={() => setDndForMinutes(180)} className="w-full text-left px-2 py-1.5 text-xs rounded-md text-slate-200 hover:bg-slate-800" style={{ ['--wails-draggable' as any]: 'no-drag' }}>3 hours</button>
                <div className="my-1 border-t border-slate-700/60" />
                <button onClick={cancelDnd} className="w-full text-left px-2 py-1.5 text-xs rounded-md text-rose-300 hover:bg-rose-500/10" style={{ ['--wails-draggable' as any]: 'no-drag' }}>Turn DND Off</button>
              </div>
            )}
          </div>

          {dndStatus.active && (
            <button
              onClick={cancelDnd}
              className="flex items-center gap-1 py-1.5 px-2 rounded-lg text-amber-200 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 transition-colors cursor-pointer"
              title="DND active. Click to stop."
            >
              <TimerOff className="w-3.5 h-3.5" />
              <span className="text-[11px] font-semibold">{dndRemainingLabel}</span>
            </button>
          )}

          <button
            onClick={() => HideWindow()}
            className="p-1.5 hover:bg-slate-800/60 text-slate-400 hover:text-slate-100 rounded-lg transition-colors cursor-pointer"
            title="Close Pop-up"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Navigation Router Body */}
      <main className="flex-1 overflow-y-auto px-4 py-4 flex flex-col justify-start">
        {!isLoggedIn ? (
          <LoginPage />
        ) : (
          /* Active Tabs Layout (Reviews vs Settings) */
          <div className="flex-1 flex flex-col justify-start">
            {activeTab === 'reviews' ? (
              /* Flashcard Review Center */
              <WordPage />
            ) : (
              <SettingsPage
              />
            )}
          </div>
        )}
      </main>

      {/* Global Tab Router Navigation */}

    </div>
  );
}

export default App;
