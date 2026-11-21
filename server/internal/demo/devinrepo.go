package demo

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

// The bank's integration repository Devin works in. It is a public sandbox
// with synthetic data; each uncovered signal kind has an issue there.
func devinRepo() string {
	if r := os.Getenv("DEVIN_REPO"); r != "" {
		return r
	}
	return "iskander-kudashev-13/demo-bank-payments-api"
}

var kindIssue = map[string]int{"aani_proxy_scam": 1, "crypto_offramp_wallet": 2, "ato_device": 3}

// devinRepoPrompt is the task for covering one signal kind in the bank's repo.
func devinRepoPrompt(k KindInfo, issuers []string, n int, example string) string {
	issue := ""
	if num, ok := kindIssue[k.Kind]; ok {
		issue = fmt.Sprintf(" This is issue #%d in that repo; reference it in the PR.", num)
	}
	return fmt.Sprintf(`Repository: github.com/%s (a synthetic bank's payment screening API, Go).%s

Other banks on the Scam Weather network (%s) sent %d active %q signals (example %s). The bank stores them but cannot match them to payments, so these payments are only partly checked.

Add coverage for signal kind %q:
- Indicator %q = HMAC-SHA256(group key, %s).
- The bank's payments carry the identifier in %s.

1. Branch devin/cover-%s.
2. internal/signals: add the normaliser and an indicator function next to AccountIndicator, with table tests for normalisation.
3. internal/screening: make Supported and Screen match this indicator type; add %q to Policy with ActionReview for issuer_analyst_verified evidence.
4. Tests in internal/screening: a matching signal holds the payment, a different identifier is approved, a retracted or expired signal has no effect, the kind no longer appears in unchecked_kinds.
5. Update the coverage table in README.md.
6. Run go vet ./... and go test ./... and paste the output in the PR description. Open a draft PR titled "Cover %s signals (%s)".

Do not weaken existing tests. Use synthetic data only.`,
		devinRepo(), issue, strings.Join(issuers, ", "), n, k.Label, example, k.Kind, k.Indicator, k.Normalize, k.PayField,
		strings.ReplaceAll(k.Kind, "_", "-"), k.Kind, k.Kind, k.Indicator)
}

// PR is a pull request in the bank's repo, as shown on the fraud desk.
type PR struct {
	Number    int       `json:"number"`
	Title     string    `json:"title"`
	URL       string    `json:"url"`
	State     string    `json:"state"` // open | draft | merged | closed
	Author    string    `json:"author"`
	Branch    string    `json:"branch"`
	CI        string    `json:"ci"` // success | failure | pending | none
	UpdatedAt time.Time `json:"updated_at"`
}

var prCache struct {
	sync.Mutex
	at  time.Time
	out map[string]any
}

// handlePRs lists recent PRs in the bank's repo with their CI status.
// Cached for 3 minutes to stay within GitHub's unauthenticated rate limit.
func handlePRs(w http.ResponseWriter, r *http.Request) {
	prCache.Lock()
	defer prCache.Unlock()
	if prCache.out != nil && time.Since(prCache.at) < 3*time.Minute && r.URL.Query().Get("fresh") == "" {
		writeJSON(w, 200, prCache.out)
		return
	}
	repo := devinRepo()
	out := map[string]any{"repo": repo, "repo_url": "https://github.com/" + repo, "prs": []PR{}}
	var raw []struct {
		Number    int                    `json:"number"`
		Title     string                 `json:"title"`
		HTMLURL   string                 `json:"html_url"`
		State     string                 `json:"state"`
		Draft     bool                   `json:"draft"`
		MergedAt  *string                `json:"merged_at"`
		UpdatedAt time.Time              `json:"updated_at"`
		User      struct{ Login string } `json:"user"`
		Head      struct {
			Ref string `json:"ref"`
			SHA string `json:"sha"`
		} `json:"head"`
	}
	if err := ghGet("/repos/"+repo+"/pulls?state=all&per_page=8&sort=updated&direction=desc", &raw); err != nil {
		out["error"] = err.Error()
		writeJSON(w, 200, out)
		return
	}
	prs := []PR{}
	for i, p := range raw {
		pr := PR{Number: p.Number, Title: p.Title, URL: p.HTMLURL, State: p.State, Author: p.User.Login, Branch: p.Head.Ref, CI: "none", UpdatedAt: p.UpdatedAt}
		switch {
		case p.MergedAt != nil:
			pr.State = "merged"
		case p.State == "open" && p.Draft:
			pr.State = "draft"
		}
		if i < 4 {
			var runs struct {
				CheckRuns []struct {
					Status     string `json:"status"`
					Conclusion string `json:"conclusion"`
				} `json:"check_runs"`
			}
			if ghGet("/repos/"+repo+"/commits/"+p.Head.SHA+"/check-runs", &runs) == nil && len(runs.CheckRuns) > 0 {
				pr.CI = "success"
				for _, c := range runs.CheckRuns {
					if c.Status != "completed" {
						pr.CI = "pending"
					} else if c.Conclusion != "success" && c.Conclusion != "skipped" {
						pr.CI = "failure"
						break
					}
				}
			}
		}
		prs = append(prs, pr)
	}
	out["prs"] = prs
	prCache.at, prCache.out = time.Now(), out
	writeJSON(w, 200, out)
}

func ghGet(path string, v any) error {
	req, _ := http.NewRequest("GET", "https://api.github.com"+path, nil)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "scam-weather-demo")
	if t := os.Getenv("GITHUB_TOKEN"); t != "" {
		req.Header.Set("Authorization", "Bearer "+t)
	}
	resp, err := (&http.Client{Timeout: 8 * time.Second}).Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return fmt.Errorf("github %s: status %d", path, resp.StatusCode)
	}
	return json.NewDecoder(resp.Body).Decode(v)
}
