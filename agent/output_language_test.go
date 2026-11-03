package agent

import (
	"strings"
	"testing"

	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/norma/harness"
)

func TestOutputLanguageRolePrompts(t *testing.T) {
	oldLanguage, oldPrompt := OutputLanguage, PromptOverride
	t.Cleanup(func() { OutputLanguage, PromptOverride = oldLanguage, oldPrompt })
	builders := map[string]func() string{
		"planner":   func() string { return plannerSystem("goal", "/data", "/work") },
		"mainagent": func() string { return mainAgentSystem("goal", "/data", "/work") },
		"worker":    func() string { return workerSystem("proxy", "ca", "/data", "/work") },
	}
	for _, key := range []string{"auto", "pentest", "reporter", "retester", "asset_mapper", "credential_processor", "custom"} {
		builders[key] = func() string { return chatSystem(key, "/data", "/work") }
	}
	for _, override := range []string{"", "CUSTOM {{.DataDir}}", "{{.UnknownVariable}}"} {
		PromptOverride = func(string) (string, bool) { return override, override != "" }
		for role, build := range builders {
			OutputLanguage = nil
			original := build()
			OutputLanguage = func() string { return "zh" }
			if got := build(); got != original {
				t.Fatalf("%s: Chinese default changed", role)
			}
			OutputLanguage = func() string { return "en" }
			if got := build(); got != original+"\n\n"+englishOutputDirective {
				t.Fatalf("%s: directive missing or body changed", role)
			}
		}
	}
	if got := withOutputLanguage(""); got != "" {
		t.Fatal("empty prompt gained a directive")
	}
}

func TestOutputLanguageStandaloneRequests(t *testing.T) {
	oldLanguage, oldPrompt := OutputLanguage, PromptOverride
	t.Cleanup(func() { OutputLanguage, PromptOverride = oldLanguage, oldPrompt })
	PromptOverride = func(string) (string, bool) { return "CUSTOM {{.DataDir}}", true }
	for _, language := range []string{"zh", "en"} {
		OutputLanguage = func() string { return language }
		p := &autoTitleProvider{reply: "Fixture title"}
		if _, err := GenerateAutoTitle(t.Context(), p, "Evidence 原文"); err != nil {
			t.Fatal(err)
		}
		check := func(path string) {
			t.Helper()
			if strings.HasSuffix(strings.Join(p.req.System, "\n"), englishOutputDirective) != (language == "en") {
				t.Fatalf("%s/%s: incorrect output policy", path, language)
			}
		}
		check("title")
		if !strings.Contains(p.req.Messages[0].Text(), "Evidence 原文") {
			t.Fatal("title input changed")
		}
		c := NewCompactor(p, "fixture")
		if _, err := c.compress(t.Context(), newColdGraph(nil, nil), block{}, map[int64]*db.Node{}); err != nil {
			t.Fatal(err)
		}
		check("compaction")
		p.reply = `{"accounts":[]}`
		if _, _, err := ExtractCredentials(t.Context(), p, "CUSTOM extraction", "Evidence 原文", 100); err != nil {
			t.Fatal(err)
		}
		check("credentials")
		if !strings.Contains(p.req.Messages[0].Text(), "Evidence 原文") {
			t.Fatal("credential input changed")
		}
		p.reply = "Done"
		DecomposeGoalsWithProvider(t.Context(), p, "/data", "goal", "description", nil, nil, 0, true, 100, nil)
		check("goals")
		if !strings.HasPrefix(p.req.System[0], "CUSTOM /data") {
			t.Fatal("goals override lost")
		}
	}
}

func TestOutputLanguageWrapupOverrides(t *testing.T) {
	oldLanguage, oldWrapup, oldTimeout := OutputLanguage, WrapupOverride, WrapupTaskTimeoutOverride
	t.Cleanup(func() { OutputLanguage, WrapupOverride, WrapupTaskTimeoutOverride = oldLanguage, oldWrapup, oldTimeout })
	for _, custom := range []bool{false, true} {
		WrapupOverride = func(string) (string, bool) { return "CUSTOM settle", custom }
		WrapupTaskTimeoutOverride = func(string) (string, bool) { return "CUSTOM timeout", custom }
		for _, language := range []string{"zh", "en"} {
			OutputLanguage = func() string { return language }
			for _, role := range []string{"worker", "planner", "mainagent", "custom"} {
				st := wrapupSettlementForTask(role, []string{"Bash"}, true)
				for _, prompt := range []string{wrapupSettlement(role, nil).Prompt, st.Prompt, st.PromptByReason[harness.ReasonTimeout], st.PromptByReason[harness.ReasonMaxTurns]} {
					if prompt != "" && strings.HasSuffix(prompt, englishOutputDirective) != (language == "en") {
						t.Fatalf("%s/%s: wrap-up policy missing", role, language)
					}
				}
				if len(st.DisabledTools) != 1 || st.DisabledTools[0] != "Bash" {
					t.Fatal("settlement guard changed")
				}
			}
		}
	}
}

func TestOutputLanguageSnapshotDoesNotMutateHistory(t *testing.T) {
	old := OutputLanguage
	t.Cleanup(func() { OutputLanguage = old })
	OutputLanguage = func() string { return "en" }
	snapshot := []string{withOutputLanguage("ROLE") + "\nCONTEXT", "READ ONLY"}
	english := OutputLanguageSystem(snapshot)
	if len(english) != 3 || english[2] != englishOutputDirective || english[0] != "ROLE\nCONTEXT" {
		t.Fatal("snapshot language policy was not refreshed")
	}
	OutputLanguage = func() string { return "zh" }
	chinese := OutputLanguageSystem(english)
	if len(chinese) != 2 || chinese[0] != "ROLE\nCONTEXT" || chinese[1] != "READ ONLY" {
		t.Fatal("snapshot retained previous English policy")
	}
	if snapshot[0] != "ROLE\n\n"+englishOutputDirective+"\nCONTEXT" {
		t.Fatal("historical snapshot mutated")
	}
}
