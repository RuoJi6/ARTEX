package intercept

import (
	"encoding/json"
	"regexp"
	"testing"

	"github.com/Autumn-27/artex/db"
)

// Patterns copied from the built-in rules seeded in db/db.go.
const (
	builtinRmRf  = `(?i)\brm\b.{0,80}(?:-[a-z]*r[a-z]*f[a-z]*|-[a-z]*f[a-z]*r[a-z]*|--recursive|--no-preserve-root)`
	builtinMkfs  = `\bmkfs\b`
	builtinDrop  = `(?i)\bDROP\s+(?:DATABASE|TABLE|SCHEMA|INDEX|VIEW|TABLESPACE|USER|ROLE)\b`
	builtinFlush = `(?i)\b(?:FLUSHALL|FLUSHDB)\b`
	builtinV2    = `(?i)\b(rm\s+-rf\s+/|mkfs|dd\s+if=|:\(\)\s*\{|shutdown|reboot|>\s*/dev/sd)`
)

func testRule(target, matchType, pattern string) compiledRule {
	r := compiledRule{InterceptRule: db.InterceptRule{
		ID: 1, Name: "test", Enabled: true, Action: "deny",
		MatchTarget: target, MatchType: matchType, Pattern: pattern,
	}}
	if matchType == "regex" {
		r.re = regexp.MustCompile(pattern)
	}
	return r
}

// interceptorWith returns an Interceptor whose rule cache is pre-filled, so
// Match runs without a database.
func interceptorWith(rules ...compiledRule) *Interceptor {
	return &Interceptor{cached: rules}
}

func toolInput(t *testing.T, v any) []byte {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func TestMatchToolInputSeesDecodedValues(t *testing.T) {
	cases := []struct {
		name    string
		pattern string
		tool    string
		input   any
	}{
		{"rm -rf on its own line", builtinRmRf, "Bash", map[string]string{"command": "cd /tmp\nrm -rf /var/www"}},
		{"rm -rf after a tab", builtinRmRf, "Bash", map[string]string{"command": "echo done\trm -rf /var/www"}},
		{"mkfs on its own line", builtinMkfs, "Bash", map[string]string{"command": "lsblk\nmkfs.ext4 /dev/sdb"}},
		{"DROP inside a heredoc", builtinDrop, "Bash", map[string]string{"command": "psql <<EOF\nDROP TABLE users;\nEOF"}},
		{"FLUSHALL inside a heredoc", builtinFlush, "Bash", map[string]string{"command": "redis-cli <<EOF\nFLUSHALL\nEOF"}},
		{"shutdown on its own line", builtinV2, "Bash", map[string]string{"command": "sync\nshutdown -h now"}},
		// encoding/json writes > as >, so this only matches the decoded value.
		{"redirect to a disk", `>\s*/dev/sd`, "Bash", map[string]string{"command": "cat img > /dev/sda"}},
		{"interactive shell text", builtinRmRf, "shell_send", map[string]string{"text": "ls\nrm -rf /srv/data\n"}},
		{"nested edit value", builtinDrop, "MultiEdit", map[string]any{
			"file_path": "/tmp/m.sql",
			"edits":     []map[string]string{{"old_string": "-- x", "new_string": "-- x\nDROP TABLE users;"}},
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			ic := interceptorWith(testRule("tool_input", "regex", tc.pattern))
			in := toolInput(t, tc.input)
			if _, ok := ic.Match(tc.tool, in); !ok {
				t.Fatalf("rule %q did not match input %s", tc.pattern, in)
			}
		})
	}
}

func TestMatchToolInputStringRuleSeesDecodedValues(t *testing.T) {
	// The raw JSON holds rm -rf \"/var/www\", so the quotes only line up once decoded.
	ic := interceptorWith(testRule("tool_input", "string", `rm -rf "/var/www"`))
	in := toolInput(t, map[string]string{"command": `rm -rf "/var/www"`})
	if _, ok := ic.Match("Bash", in); !ok {
		t.Fatalf("string rule did not match input %s", in)
	}
}

// Rules written against the raw JSON form must keep working.
func TestMatchToolInputStillMatchesRawJSON(t *testing.T) {
	ic := interceptorWith(testRule("tool_input", "regex", `"command":"rm `))
	in := toolInput(t, map[string]string{"command": "rm notes.txt"})
	if _, ok := ic.Match("Bash", in); !ok {
		t.Fatalf("raw JSON rule did not match input %s", in)
	}
}

func TestMatchToolInputInvalidJSONFallsBackToRaw(t *testing.T) {
	ic := interceptorWith(testRule("tool_input", "regex", builtinMkfs))
	if _, ok := ic.Match("Bash", []byte(`not json: mkfs /dev/sdb`)); !ok {
		t.Fatal("rule did not match non-JSON input")
	}
}

func TestMatchToolInputNoFalsePositives(t *testing.T) {
	ic := interceptorWith(
		testRule("tool_input", "regex", builtinRmRf),
		testRule("tool_input", "regex", builtinMkfs),
		testRule("tool_input", "regex", builtinDrop),
	)
	for _, cmd := range []string{
		"cd /tmp\nls -la",
		"nmap -sV 10.0.0.5\ncurl -s http://10.0.0.5/",
		"echo firm\nrmdir build", // "firm" and "rmdir" must not look like rm
	} {
		in := toolInput(t, map[string]string{"command": cmd})
		if dec, ok := ic.Match("Bash", in); ok {
			t.Fatalf("unexpected match %q for input %s", dec.RuleName, in)
		}
	}
}

// The match key ("command") must not be matched as a value.
func TestMatchToolInputIgnoresObjectKeys(t *testing.T) {
	ic := interceptorWith(testRule("tool_input", "regex", `^mkfs$`))
	in := toolInput(t, map[string]string{"mkfs": "ls"})
	if _, ok := ic.Match("Bash", in); ok {
		t.Fatalf("object key matched as a value for input %s", in)
	}
}

func TestMatchToolNameUnchanged(t *testing.T) {
	ic := interceptorWith(testRule("tool_name", "string", "WebFetch"))
	if _, ok := ic.Match("WebFetch", []byte(`{"url":"http://x"}`)); !ok {
		t.Fatal("tool_name rule did not match")
	}
	if _, ok := ic.Match("Bash", []byte(`{"command":"WebFetch"}`)); ok {
		t.Fatal("tool_name rule matched tool input")
	}
}
