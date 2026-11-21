// Command scamweather runs the hub, two demo bank nodes, the console API and
// the built web console in one process.
//
//	PORT        listen port (default 8080)
//	WEB_DIR     built console (default ./web/dist, then ../web/dist)
//	HUB_URL     where nodes reach the hub (default http://127.0.0.1:$PORT)
//	DEVIN_API_KEY  optional: start real Devin sessions from the Onboarding page
package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/iskander-kudashev-13/cis-hack/server/internal/demo"
)

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func main() {
	port := env("PORT", "8080")
	hubURL := env("HUB_URL", "http://127.0.0.1:"+port)

	d, err := demo.New(hubURL)
	if err != nil {
		log.Fatal(err)
	}
	mux := http.NewServeMux()
	d.Hub.Routes(mux)
	d.Routes(mux)
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) { w.Write([]byte("ok")) })
	mux.Handle("/", spa(webDir()))

	stop := make(chan struct{})
	go func() {
		time.Sleep(500 * time.Millisecond)
		go d.A.Run(time.Second, stop)
		go d.B.Run(time.Second, stop)
		go d.Watch(stop)
	}()

	log.Printf("scam weather listening on :%s (hub %s)", port, hubURL)
	srv := &http.Server{Addr: ":" + port, Handler: cors(mux), ReadHeaderTimeout: 5 * time.Second}
	log.Fatal(srv.ListenAndServe())
}

func webDir() string {
	if v := os.Getenv("WEB_DIR"); v != "" {
		return v
	}
	for _, p := range []string{"web/dist", "../web/dist"} {
		if st, err := os.Stat(p); err == nil && st.IsDir() {
			return p
		}
	}
	return "web/dist"
}

// spa serves static files and falls back to index.html for client routes.
func spa(dir string) http.Handler {
	fs := http.FileServer(http.Dir(dir))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := filepath.Join(dir, filepath.Clean(r.URL.Path))
		if st, err := os.Stat(p); err != nil || st.IsDir() {
			if !strings.HasPrefix(r.URL.Path, "/api/") && !strings.HasPrefix(r.URL.Path, "/v1/") {
				http.ServeFile(w, r, filepath.Join(dir, "index.html"))
				return
			}
		}
		fs.ServeHTTP(w, r)
	})
}

func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
