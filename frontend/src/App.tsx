import { useState, useEffect, useRef } from 'react';
import { 
  BookOpen, 
  Settings as SettingsIcon, 
  LogOut, 
  Clock, 
  Sparkles, 
  Check, 
  CheckCircle, 
  Volume2, 
  RotateCw, 
  ChevronRight, 
  User, 
  ExternalLink, 
  ShieldAlert, 
  LoaderCircle,
  X,
  Bell,
  RefreshCw,
  Eye,
  Cloud
} from 'lucide-react';
import { calculateNextSRS, SRSRating } from 'shared-learning-logic';
import { 
  GetConfig, 
  SaveInterval, 
  Login, 
  Logout, 
  GetFlashcards, 
  UpdateSRS, 
  TriggerPopupCheck, 
  HideWindow 
} from "../wailsjs/go/main/App";
import { EventsOn, EventsOff } from "../wailsjs/runtime";
import logoSvg from './assets/images/gemini-dutch-practice-logo.svg';

interface Word {
  id: string;
  dutch: string;
  english: string;
  context?: string;
  addedAt: number;
  creatorId: string;
  examples?: any[];
  srsLevel: number;
  nextReviewAt: number;
  wordAudioUrl?: string;
  wordTeacherAudioUrl?: string;
}

interface Config {
  intervalMinutes: number;
  idToken: string;
  uid: string;
  displayName: string;
  email: string;
  photoURL: string;
  useEmulator: boolean;
}

function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [flashcards, setFlashcards] = useState<Word[]>([]);
  const [activeTab, setActiveTab] = useState<'reviews' | 'settings'>('reviews');
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [savingSrs, setSavingSrs] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [practiceAll, setPracticeAll] = useState(false); // Practice all words if none are due

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

    // Register Wails Event Listeners
    EventsOn("auth_state_changed", handleAuthStateChanged);
    EventsOn("trigger_flashcard_review", handleTriggerFlashcardReview);

    // Global escape key handler to close/hide pop-up window
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        HideWindow();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      EventsOff("auth_state_changed");
      EventsOff("trigger_flashcard_review");
      window.removeEventListener("keydown", handleKeyDown);
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
    // Refresh flashcards list and activate review tab
    if (config) {
      loadCards(config);
    }
    setActiveTab("reviews");
    setPracticeAll(false);
    setCurrentCardIndex(0);
    setIsFlipped(false);
  };

  const loadCards = async (currentConfig: Config) => {
    setLoading(true);
    try {
      const cards = await GetFlashcards();
      setFlashcards(cards || []);
    } catch (err) {
      console.error("Failed to load flashcards:", err);
      showToast("Could not retrieve flashcards from Firestore REST.", "error");
    } finally {
      setLoading(false);
    }
  };

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 3000);
  };

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

  const handleSignOut = async () => {
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
  };

  const handleUpdateInterval = async (minutes: number) => {
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
  };

  const handleTriggerManualCheck = async () => {
    setLoading(true);
    try {
      const dueCount = await TriggerPopupCheck();
      showToast(`Review check done. Found ${dueCount} cards due.`, "success");
      if (config) {
        await loadCards(config);
      }
    } catch (err) {
      console.error("Error running review check:", err);
      showToast("Error performing manual review check.", "error");
    } finally {
      setLoading(false);
    }
  };

  const playTTS = (e: React.MouseEvent | null, text: string, audioUrl?: string) => {
    if (e) {
      e.stopPropagation(); // Stop flip trigger
    }
    if (audioUrl) {
      const audio = new Audio(audioUrl);
      audio.play().catch(err => {
        console.error("Failed to play cached cloud audio, falling back to browser speech:", err);
        playBrowserTTS(text);
      });
    } else {
      playBrowserTTS(text);
    }
  };

  const playBrowserTTS = (text: string) => {
    if ('speechSynthesis' in window) {
      const isCurrentlySpeaking = window.speechSynthesis.speaking;
      if (isCurrentlySpeaking) {
        window.speechSynthesis.cancel();
      }

      // Introducing a short delay prevents the Windows WebView2 / Chromium engine 
      // from clipping/truncating the first syllable (e.g. hearing "lossing" instead of "oplossing").
      const delay = isCurrentlySpeaking ? 150 : 50;
      setTimeout(() => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'nl-NL';
        const voices = window.speechSynthesis.getVoices();
        const dutchVoice = voices.find(v => v.lang.toLowerCase().includes('nl') || v.lang.toLowerCase().startsWith('nl'));
        if (dutchVoice) {
          utterance.voice = dutchVoice;
        }
        window.speechSynthesis.speak(utterance);
      }, delay);
    }
  };

  // Filter due cards or provide practice stack
  const nowMs = Date.now();
  const dueCards = flashcards.filter(c => c.nextReviewAt <= nowMs);
  const activeCards = practiceAll ? flashcards : dueCards;
  const activeCard = activeCards[currentCardIndex] || null;

  const handleGradeWord = async (rating: SRSRating) => {
    if (!activeCard || savingSrs) return;
    setSavingSrs(true);

    try {
      // 1. Calculate progress using standard shared-learning-logic mathematical models
      const result = calculateNextSRS(activeCard.srsLevel, rating);

      // 2. Surgical Firestore PATCH via Go Rest Client
      const success = await UpdateSRS(activeCard.id, result.srsLevel, result.nextReviewAt);

      if (success) {
        // Play subtle success feedback or speak next word if enabled
        setIsFlipped(false);
        setTimeout(() => {
          if (currentCardIndex + 1 >= activeCards.length) {
            // Stack empty
            showToast("Congratulations! Review session completed.", "success");
            // Auto hide app to tray after 3 seconds of showing success screen
            setTimeout(() => {
              HideWindow();
            }, 3000);
          }
          setCurrentCardIndex(prev => prev + 1);
          setSavingSrs(false);
        }, 200);
      } else {
        showToast("Failed to update word state.", "error");
        setSavingSrs(false);
      }
    } catch (err) {
      console.error("Error updating word progression:", err);
      showToast("Error updating card SRS.", "error");
      setSavingSrs(false);
    }
  };

  if (loading && flashcards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full bg-[#0b0f19] text-slate-100">
        <LoaderCircle className="w-10 h-10 text-sky-400 animate-spin mb-4" />
        <p className="text-slate-400 text-sm font-medium">Bootstrapping TaalGem...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-[#0b0f19] text-slate-100 overflow-hidden relative font-sans">
      {/* Dynamic Toast System */}
      {toast && (
        <div className={`absolute top-4 left-4 right-4 z-50 rounded-xl p-3 flex items-center justify-between shadow-2xl backdrop-blur-md border ${
          toast.type === 'error' 
            ? 'bg-red-500/10 border-red-500/20 text-red-200' 
            : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-200'
        } animate-slide-up-fade`}>
          <div className="flex items-center gap-2">
            {toast.type === 'error' ? <ShieldAlert className="w-4 h-4 text-red-400" /> : <Sparkles className="w-4 h-4 text-emerald-400" />}
            <span className="text-xs font-semibold">{toast.message}</span>
          </div>
          <button onClick={() => setToast(null)} className="p-1 hover:bg-white/5 rounded-lg transition-colors">
            <X className="w-3 h-3 opacity-60" />
          </button>
        </div>
      )}

      {/* Modern Custom Drag Bar Header */}
      <header className="h-14 flex items-center justify-between px-4 border-b border-slate-800/40 bg-slate-950/20 backdrop-blur-md" style={{ ['--wails-draggable' as any]: 'drag' }}>
        <div className="flex items-center gap-2">
          <img src={logoSvg} alt="TaalGem Logo" className="w-7 h-7 object-contain drop-shadow" />
          <span className="font-bold text-sm bg-gradient-to-r from-sky-400 to-indigo-300 bg-clip-text text-transparent">TaalGem Companion</span>
        </div>

        <button 
          onClick={() => HideWindow()} 
          className="p-1.5 hover:bg-slate-800/60 text-slate-400 hover:text-slate-100 rounded-lg transition-colors cursor-pointer"
          title="Close Pop-up"
          style={{ ['--wails-draggable' as any]: 'no-drag' }}
        >
          <X className="w-4 h-4" />
        </button>
      </header>

      {/* Navigation Router Body */}
      <main className="flex-1 overflow-y-auto px-4 py-4 flex flex-col justify-start">
        {!isLoggedIn ? (
          /* Sleek Glassmorphism Unauthenticated View */
          <div className="flex-1 flex flex-col justify-between py-2 animate-slide-up-fade">
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
              <div className="flex gap-3 items-start p-3 rounded-xl bg-slate-900/35 border border-slate-800/30">
                <div className="p-1.5 bg-sky-500/10 rounded-lg text-sky-400 mt-0.5">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-200">Periodic Popup Reviews</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">Sliding windows trigger above the system taskbar without interrupting full screen apps.</p>
                </div>
              </div>

              <div className="flex gap-3 items-start p-3 rounded-xl bg-slate-900/35 border border-slate-800/30">
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
                    <path fill="#4285F4" d="M17.64 9.2c0-.63-.06-1.25-.16-1.84H9v3.47h4.84c-.21 1.12-.84 2.07-1.79 2.7l2.77 2.15c1.62-1.5 2.82-3.7 2.82-5.48z"/>
                    <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.77-2.15c-.77.52-1.75.83-3.19.83-2.34 0-4.32-1.58-5.03-3.7L1.17 12.9C2.65 15.96 5.58 18 9 18z"/>
                    <path fill="#FBBC05" d="M3.97 10.8c-.18-.52-.28-1.07-.28-1.8s.1-1.28.28-1.8L1.17 5.1C.42 6.68 0 8.44 0 10.2s.42 3.52 1.17 5.1l2.8-2.3z"/>
                    <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.8 11.43 0 9 0 5.58 0 2.65 2.04 1.17 5.1l2.8 2.3c.71-2.12 2.69-3.7 5.03-3.7z"/>
                  </svg>
                )}
                Sign In with Google
              </button>
              <p className="text-[10px] text-slate-500 text-center mt-3">
                Authorizes securely via loopback port 18991 on your local browser.
              </p>
            </div>
          </div>
        ) : (
          /* Active Tabs Layout (Reviews vs Settings) */
          <div className="flex-1 flex flex-col justify-start">
            {activeTab === 'reviews' ? (
              /* Flashcard Review Center */
              <div className="flex-1 flex flex-col justify-between animate-slide-up-fade">
                {activeCards.length === 0 ? (
                  /* All caught up state */
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                    <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-5 text-emerald-400 shadow-lg shadow-emerald-500/5 animate-pulse">
                      <CheckCircle className="w-8 h-8" />
                    </div>
                    <h2 className="text-xl font-extrabold text-slate-100 tracking-tight">Helemaal bijgewerkt!</h2>
                    <p className="text-slate-400 text-xs mt-2 max-w-xs leading-relaxed">
                      You are completely caught up on your Dutch flashcards. Awesome job!
                    </p>

                    <div className="mt-8 flex flex-col gap-2 w-full max-w-[240px]">
                      {flashcards.length > 0 && (
                        <button 
                          onClick={() => {
                            setPracticeAll(true);
                            setCurrentCardIndex(0);
                            setIsFlipped(false);
                          }}
                          className="w-full py-2.5 px-4 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/50 text-slate-200 hover:text-white font-semibold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          Practice All Anyway ({flashcards.length})
                        </button>
                      )}
                      
                      <button 
                        onClick={handleTriggerManualCheck}
                        className="w-full py-2.5 px-4 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 font-semibold text-xs rounded-xl transition-all border border-sky-500/20 cursor-pointer flex items-center justify-center gap-2"
                      >
                        <Bell className="w-3.5 h-3.5 animate-bounce" />
                        Check For Due Cards
                      </button>
                    </div>
                  </div>
                ) : currentCardIndex >= activeCards.length ? (
                  /* Review stack finished screen */
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-yellow-400 to-amber-500 flex items-center justify-center mb-5 text-slate-950 shadow-lg shadow-yellow-500/10 animate-bounce">
                      <Sparkles className="w-8 h-8" />
                    </div>
                    <h2 className="text-xl font-extrabold text-slate-100 tracking-tight">Session Complete!</h2>
                    <p className="text-slate-400 text-xs mt-2 max-w-xs leading-relaxed">
                      You have reviewed all {activeCards.length} due cards in this batch. Excellent progress.
                    </p>

                    <div className="mt-8 flex flex-col gap-2 w-full max-w-[220px]">
                      <button 
                        onClick={() => {
                          setPracticeAll(false);
                          setCurrentCardIndex(0);
                          setIsFlipped(false);
                          loadCards(config!);
                        }}
                        className="w-full py-2.5 px-4 bg-sky-500 hover:bg-sky-600 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-xl hover:shadow-sky-500/10 cursor-pointer"
                      >
                        Return to Deck
                      </button>
                      <button 
                        onClick={() => HideWindow()}
                        className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl transition-all border border-slate-700/50 cursor-pointer"
                      >
                        Close Pop-up
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Interactive Flashcard */
                  <div className="flex-1 flex flex-col justify-between">
                    {/* Progress Indicator */}
                    <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 px-1 mb-2">
                      <span className="bg-slate-800/60 px-2 py-0.5 rounded-md border border-slate-700/30">
                        {practiceAll ? 'Practice stack' : 'Due stack'}
                      </span>
                      <span>
                        Card {currentCardIndex + 1} of {activeCards.length}
                      </span>
                    </div>

                    {/* Slick 3D perspective wrapper with key for mounting animations */}
                    <div 
                      key={activeCard.id} 
                      className="perspective w-full h-[220px] cursor-pointer mt-1" 
                      onClick={() => setIsFlipped(!isFlipped)}
                    >
                      <div className={`relative w-full h-full duration-500 transform-style-preserve-3d transition-transform ${isFlipped ? 'rotate-y-180' : ''}`}>
                        
                        {/* Front (Dutch word) */}
                        <div className="absolute w-full h-full backface-hidden glass-card rounded-2xl p-6 flex flex-col justify-between items-center text-center shadow-lg border border-slate-700/50">
                          {/* Mini info row */}
                          <div className="w-full flex justify-between items-center text-[10px] text-slate-500">
                            <span className="uppercase tracking-widest font-bold text-sky-400/80">Dutch</span>
                            <span className="flex items-center gap-1 font-medium bg-slate-900/40 px-1.5 py-0.5 rounded border border-slate-800/40">
                              Level {activeCard.srsLevel}
                            </span>
                          </div>

                          {/* Word Centerpiece */}
                          <div className="flex flex-col items-center gap-3">
                            <h2 className="text-3xl font-extrabold tracking-tight text-slate-100 select-text">
                              {activeCard.dutch}
                            </h2>
                            <div className="relative">
                              <button 
                                onClick={(e) => {
                                  playTTS(e, activeCard.dutch, activeCard.wordAudioUrl);
                                }}
                                className="p-3 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 hover:text-sky-300 rounded-full transition-all duration-150 cursor-pointer border border-sky-500/10 active:scale-95 shadow-lg shadow-sky-500/5 hover:shadow-sky-500/10"
                                title={activeCard.wordAudioUrl ? "Play Premium Cloud Pronunciation" : "Play Pronunciation"}
                              >
                                <Volume2 className="w-5 h-5" />
                              </button>
                              {activeCard.wordAudioUrl && (
                                <span 
                                  className="absolute -top-1 -right-1 flex h-4.5 w-4.5 pointer-events-none items-center justify-center bg-[#0b0f19] rounded-full border border-sky-500/30 text-sky-400 p-0.5 animate-pulse"
                                  title="Audio saved in the cloud"
                                >
                                  <Cloud className="w-2.5 h-2.5" />
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Flip Call-to-action */}
                          <div className="text-[10px] text-slate-500 flex items-center gap-1 opacity-70">
                            <Eye className="w-3.5 h-3.5" />
                            Click card or press space to reveal definition
                          </div>
                        </div>

                        {/* Back (English + Context) */}
                        <div className="absolute w-full h-full backface-hidden rotate-y-180 glass-card rounded-2xl p-5 flex flex-col justify-between items-center text-center shadow-lg border border-slate-700/50">
                          {/* Reference header */}
                          <div className="w-full flex justify-between items-center text-[10px] text-slate-500">
                            <span className="font-bold text-slate-400 select-text">{activeCard.dutch}</span>
                            <span className="uppercase tracking-widest font-bold text-indigo-400/80">English</span>
                          </div>

                          {/* Translations Center */}
                          <div className="flex flex-col items-center gap-2 max-w-full px-2">
                            <h2 className="text-2xl font-extrabold tracking-tight text-indigo-300 select-text leading-snug">
                              {activeCard.english}
                            </h2>
                            {activeCard.context && (
                              <div className="mt-1 bg-slate-900/45 px-3 py-2 rounded-xl border border-slate-850/50 max-h-[70px] overflow-y-auto w-full">
                                <p className="text-[11px] text-slate-400 italic select-text leading-normal">
                                  "{activeCard.context}"
                                </p>
                              </div>
                            )}
                          </div>

                          {/* Flipback hint */}
                          <div className="text-[9px] text-slate-500 opacity-60">
                            Click to flip back
                          </div>
                        </div>

                      </div>
                    </div>

                    {/* Grading / Answer Controls Footer */}
                    <div className="h-[90px] flex items-end justify-center">
                      {!isFlipped ? (
                        /* Large Reveal Button on Front */
                        <button 
                          onClick={() => setIsFlipped(true)}
                          className="w-full py-3 px-4 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-slate-950 hover:text-slate-950 font-bold text-sm rounded-xl shadow-lg shadow-sky-500/10 transition-all duration-150 active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2"
                        >
                          Show Definition
                          <ChevronRight className="w-4 h-4 text-slate-950" />
                        </button>
                      ) : (
                        /* Premium HSL-Themed SRS Grading Buttons */
                        <div className="w-full grid grid-cols-4 gap-2 animate-slide-up-fade">
                          <button 
                            disabled={savingSrs}
                            onClick={() => handleGradeWord('again')}
                            className="flex flex-col items-center gap-1 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 hover:text-rose-300 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                            title="Review again in 5 minutes"
                          >
                            <span className="text-[11px] font-bold">Again</span>
                            <span className="text-[9px] opacity-75">5m</span>
                          </button>
                          
                          <button 
                            disabled={savingSrs}
                            onClick={() => handleGradeWord('hard')}
                            className="flex flex-col items-center gap-1 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-400 hover:text-amber-300 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                            title="Same level, shorter review gap"
                          >
                            <span className="text-[11px] font-bold">Hard</span>
                            <span className="text-[9px] opacity-75">Shorter</span>
                          </button>
                          
                          <button 
                            disabled={savingSrs}
                            onClick={() => handleGradeWord('good')}
                            className="flex flex-col items-center gap-1 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 hover:text-emerald-300 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                            title="Advance 1 level, standard SRS gap"
                          >
                            <span className="text-[11px] font-bold">Good</span>
                            <span className="text-[9px] opacity-75">+1 Lvl</span>
                          </button>
                          
                          <button 
                            disabled={savingSrs}
                            onClick={() => handleGradeWord('easy')}
                            className="flex flex-col items-center gap-1 py-2 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 text-sky-400 hover:text-sky-300 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                            title="Advance 2 levels, long review gap"
                          >
                            <span className="text-[11px] font-bold">Easy</span>
                            <span className="text-[9px] opacity-75">+2 Lvl</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Settings & Preferences Control Center */
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
                            className={`py-2 rounded-lg font-bold text-xs border transition-all cursor-pointer ${
                              active
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
            )}
          </div>
        )}
      </main>

      {/* Global Tab Router Navigation */}
      {isLoggedIn && (
        <nav className="h-14 border-t border-slate-800/40 bg-slate-950/40 backdrop-blur-md flex items-center justify-around px-4">
          <button
            onClick={() => {
              setActiveTab('reviews');
              setPracticeAll(false);
              setCurrentCardIndex(0);
              setIsFlipped(false);
            }}
            className={`flex flex-col items-center gap-1 py-1 px-4 rounded-xl transition-all cursor-pointer relative ${
              activeTab === 'reviews' ? 'text-sky-400' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span className="text-[10px] font-bold">Reviews</span>
            
            {/* Due Reviews Notification dot */}
            {dueCards.length > 0 && (
              <span className="absolute top-1.5 right-4 w-2 h-2 bg-rose-500 rounded-full border border-[#0b0f19]" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`flex flex-col items-center gap-1 py-1 px-4 rounded-xl transition-all cursor-pointer ${
              activeTab === 'settings' ? 'text-sky-400' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <SettingsIcon className="w-4 h-4" />
            <span className="text-[10px] font-bold">Settings</span>
          </button>
        </nav>
      )}
    </div>
  );
}

export default App;
