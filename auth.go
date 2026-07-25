package main

import (
	"context"
	"encoding/base64"
	"fmt"
	"html"
	"html/template"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/pkg/browser"
)

type AuthResult struct {
	IdToken      string `json:"idToken"`
	RefreshToken string `json:"refreshToken"`
	Uid          string `json:"uid"`
	DisplayName  string `json:"displayName"`
	Email        string `json:"email"`
	PhotoURL     string `json:"photoURL"`
	Error        string `json:"error"`
}

var (
	server     *http.Server
	serverMux  sync.Mutex
	authChan   chan AuthResult
	listening  bool
)

const LoopbackPort = 18991

// StartAuthServer starts the temporary loopback server and opens the browser
func StartAuthServer(useEmulator bool, emulatorHost string) (AuthResult, error) {
	serverMux.Lock()
	if listening {
		serverMux.Unlock()
		return AuthResult{}, fmt.Errorf("auth server is already running")
	}

	authChan = make(chan AuthResult, 1)
	listening = true
	serverMux.Unlock()

	mux := http.NewServeMux()

	// 1. Serve Login Landing Page
	mux.HandleFunc("/login", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		tmpl, err := template.New("login").Parse(loginHTMLTemplate)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		data := map[string]interface{}{
			"UseEmulator":  useEmulator,
			"EmulatorHost": emulatorHost,
		}
		tmpl.Execute(w, data)
	})

	// 2. Serve Callback Receiver
	mux.HandleFunc("/callback", func(w http.ResponseWriter, r *http.Request) {
		r.ParseForm()
		errStr := r.FormValue("error")
		if errStr != "" {
			authChan <- AuthResult{Error: errStr}
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.Write([]byte(`<html><body style="font-family: sans-serif; text-align: center; margin-top: 100px; background-color: #1a1a2e; color: #ff5555;"><h2>Authentication Failed</h2><p>` + html.EscapeString(errStr) + `</p></body></html>`))
			return
		}

		photoURL := r.FormValue("photoURL")
		// Download and cache profile image as base64 to avoid WebView2 tracking prevention
		if photoURL != "" {
			photoURL = downloadAndEncodeImage(photoURL)
		}

		res := AuthResult{
			IdToken:      r.FormValue("idToken"),
			RefreshToken: r.FormValue("refreshToken"),
			Uid:          r.FormValue("uid"),
			DisplayName:  r.FormValue("displayName"),
			Email:        r.FormValue("email"),
			PhotoURL:     photoURL,
		}

		if res.IdToken == "" || res.Uid == "" {
			authChan <- AuthResult{Error: "missing idToken or uid"}
			http.Error(w, "Bad Request: missing credentials", http.StatusBadRequest)
			return
		}

		authChan <- res

		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write([]byte(`
			<html>
			<body style="font-family: sans-serif; text-align: center; margin-top: 100px; background-color: #111827; color: #34D399; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 50vh;">
				<div style="background: rgba(31, 41, 55, 0.6); padding: 40px; border-radius: 16px; border: 1px solid rgba(52, 211, 153, 0.2); box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);">
					<h2 style="margin-bottom: 10px; font-weight: 700; color: #10B981;">Authentication Successful!</h2>
					<p style="color: #9CA3AF; font-size: 16px; margin-bottom: 20px;">You have successfully signed in to TaalGem.NL Companion.</p>
					<p style="color: #6B7280; font-size: 14px;">You can close this tab and return to the desktop application.</p>
				</div>
			</body>
			</html>
		`))
	})

	server = &http.Server{
		Addr:    fmt.Sprintf("127.0.0.1:%d", LoopbackPort),
		Handler: mux,
	}

	// Start server asynchronously
	go func() {
		if err := server.ListenAndServe(); err != http.ErrServerClosed {
			fmt.Printf("[Auth Server] Error: %v\n", err)
			authChan <- AuthResult{Error: err.Error()}
		}
	}()

	// Open user's browser to the login endpoint
	loginURL := fmt.Sprintf("http://localhost:%d/login", LoopbackPort)
	fmt.Printf("[Auth Server] Opening browser to: %s\n", loginURL)
	go browser.OpenURL(loginURL)

	// Wait for callback or timeout (3 minutes)
	var finalResult AuthResult
	select {
	case finalResult = <-authChan:
		// Received result
	case <-time.After(3 * time.Minute):
		finalResult = AuthResult{Error: "authentication request timed out"}
	}

	// Shutdown the server cleanly
	StopAuthServer()

	return finalResult, nil
}

// trustedPhotoHosts is the allowlist of domains from which profile photos may be fetched.
// Google OAuth profile photos are always served from googleusercontent.com or google.com.
var trustedPhotoHosts = []string{
	"googleusercontent.com",
	"google.com",
}

// isAllowedPhotoURL returns true when u is an https URL whose host is within trustedPhotoHosts.
func isAllowedPhotoURL(rawURL string) bool {
	u, err := url.Parse(rawURL)
	if err != nil {
		return false
	}
	if u.Scheme != "https" {
		return false
	}
	host := strings.ToLower(u.Hostname())
	for _, trusted := range trustedPhotoHosts {
		if host == trusted || strings.HasSuffix(host, "."+trusted) {
			return true
		}
	}
	return false
}

// downloadAndEncodeImage downloads a remote image and returns it as a base64 data URL
func downloadAndEncodeImage(photoURL string) string {
	if photoURL == "" {
		return ""
	}

	if !isAllowedPhotoURL(photoURL) {
		if u, err := url.Parse(photoURL); err == nil {
			fmt.Printf("[Auth] Refusing to fetch image from untrusted host: %s\n", u.Hostname())
		} else {
			fmt.Printf("[Auth] Refusing to fetch image from invalid URL\n")
		}
		return ""
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "GET", photoURL, nil)
	if err != nil {
		fmt.Printf("[Auth] Error creating image request: %v\n", err)
		return photoURL // Return original URL as fallback
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		fmt.Printf("[Auth] Error downloading image: %v\n", err)
		return photoURL // Return original URL as fallback
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		fmt.Printf("[Auth] Image download returned status %d\n", resp.StatusCode)
		return photoURL // Return original URL as fallback
	}

	imageData, err := io.ReadAll(resp.Body)
	if err != nil {
		fmt.Printf("[Auth] Error reading image: %v\n", err)
		return photoURL // Return original URL as fallback
	}

	// Determine image type from Content-Type header
	imageType := "image/jpeg"
	if ct := resp.Header.Get("Content-Type"); ct != "" {
		imageType = ct
	}

	// Encode to base64 and return as data URL
	b64 := base64.StdEncoding.EncodeToString(imageData)
	return fmt.Sprintf("data:%s;base64,%s", imageType, b64)
}

// StopAuthServer stops the listener
func StopAuthServer() {
	serverMux.Lock()
	defer serverMux.Unlock()

	if !listening {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	if server != nil {
		server.Shutdown(ctx)
		server = nil
	}

	listening = false
}

// self-contained Firebase login HTML with CDN
const loginHTMLTemplate = `<!DOCTYPE html>
<html>
<head>
    <title>Sign in to TaalGem.NL</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background-color: #0f172a;
            color: #f8fafc;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            padding: 20px;
            box-sizing: border-box;
        }
        .container {
            background: rgba(30, 41, 59, 0.7);
            border: 1px solid rgba(148, 163, 184, 0.1);
            backdrop-filter: blur(16px);
            padding: 40px;
            border-radius: 20px;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.4);
            max-width: 440px;
            width: 100%;
            text-align: center;
        }
        .logo {
            font-size: 28px;
            font-weight: 800;
            background: linear-gradient(135deg, #38bdf8 0%, #818cf8 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 8px;
        }
        .subtitle {
            color: #94a3b8;
            font-size: 15px;
            margin-bottom: 30px;
        }
        .btn-google {
            background-color: #ffffff;
            color: #1e293b;
            border: none;
            padding: 12px 24px;
            font-size: 16px;
            font-weight: 600;
            border-radius: 12px;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
            width: 100%;
            transition: all 0.2s;
            box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
        }
        .btn-google:hover {
            background-color: #f1f5f9;
            transform: translateY(-1px);
            box-shadow: 0 10px 15px -3px rgba(0,0,0,0.2);
        }
        .status {
            margin-top: 20px;
            font-size: 14px;
            color: #38bdf8;
            font-weight: 500;
            min-height: 20px;
        }
        .spinner {
            border: 3px solid rgba(56, 189, 248, 0.1);
            width: 24px;
            height: 24px;
            border-radius: 50%;
            border-left-color: #38bdf8;
            animation: spin 1s linear infinite;
            display: inline-block;
            vertical-align: middle;
            margin-right: 8px;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        .hidden {
            display: none !important;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">TaalGem.NL</div>
        <div class="subtitle">Desktop Companion Authorization</div>
        
        <button id="btn-login" class="btn-google" onclick="signIn()">
            <svg width="18" height="18" viewBox="0 0 18 18">
                <path fill="#4285F4" d="M17.64 9.2c0-.63-.06-1.25-.16-1.84H9v3.47h4.84c-.21 1.12-.84 2.07-1.79 2.7l2.77 2.15c1.62-1.5 2.82-3.7 2.82-5.48z"/>
                <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.77-2.15c-.77.52-1.75.83-3.19.83-2.34 0-4.32-1.58-5.03-3.7L1.17 12.9C2.65 15.96 5.58 18 9 18z"/>
                <path fill="#FBBC05" d="M3.97 10.8c-.18-.52-.28-1.07-.28-1.8s.1-1.28.28-1.8L1.17 5.1C.42 6.68 0 8.44 0 10.2s.42 3.52 1.17 5.1l2.8-2.3z"/>
                <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.8 11.43 0 9 0 5.58 0 2.65 2.04 1.17 5.1l2.8 2.3c.71-2.12 2.69-3.7 5.03-3.7z"/>
            </svg>
            Sign in with Google
        </button>

        <div id="status-container" class="hidden">
            <div class="spinner"></div>
            <span id="status-text">Authorizing...</span>
        </div>
    </div>

    <!-- Import Firebase v9 SDKs via CDN -->
    <script type="module">
        import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js';
        import { getAuth, signInWithPopup, GoogleAuthProvider, connectAuthEmulator } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js';

        const firebaseConfig = {
            apiKey: 'AIzaSyA2MKBe2T3kuaPtHSpze2Dsq3VRmbnfqTo',
            authDomain: 'auth.taalgem.nl',
            projectId: 'gemini-dutch-practice-latest',
            storageBucket: 'gemini-dutch-practice-latest.firebasestorage.app',
            messagingSenderId: '521940801019',
            appId: '1:521940801019:web:7d09091b5a5ad6c545e75e'
        };

        const app = initializeApp(firebaseConfig);
        const auth = getAuth(app);
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });

        const useEmulator = {{.UseEmulator}};
        if (useEmulator) {
            const host = "{{.EmulatorHost}}" || "127.0.0.1";
            connectAuthEmulator(auth, "http://" + host + ":9099");
            console.log("[Firebase Auth] Connected to local emulator.");
        }

        window.signIn = async function() {
            const btn = document.getElementById('btn-login');
            const status = document.getElementById('status-container');
            const statusText = document.getElementById('status-text');

            btn.classList.add('hidden');
            status.classList.remove('hidden');

            try {
                let user;
                if (useEmulator) {
                    statusText.innerText = "Signing in with emulator...";
                    // Use standard sign in popup in browser, firebase emulators prompt for email
                    const result = await signInWithPopup(auth, provider);
                    user = result.user;
                } else {
                    statusText.innerText = "Connecting to Google...";
                    const result = await signInWithPopup(auth, provider);
                    user = result.user;
                }

                statusText.innerText = "Syncing credentials with companion app...";
                const idToken = await user.getIdToken();
                
                // Redirect back to our callback endpoint
                const url = new URL('/callback', window.location.origin);
                url.searchParams.append('idToken', idToken);
                url.searchParams.append('refreshToken', user.refreshToken || user.stsTokenManager?.refreshToken || '');
                url.searchParams.append('uid', user.uid);
                url.searchParams.append('displayName', user.displayName || '');
                url.searchParams.append('email', user.email || '');
                url.searchParams.append('photoURL', user.photoURL || '');

                window.location.href = url.toString();
            } catch (err) {
                console.error(err);
                btn.classList.remove('hidden');
                status.classList.add('hidden');
                
                // Redirect with error
                const url = new URL('/callback', window.location.origin);
                url.searchParams.append('error', err.message || 'Unknown authentication error');
                window.location.href = url.toString();
            }
        };
    </script>
</body>
</html>`
