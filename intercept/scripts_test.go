package intercept

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Autumn-27/mysterysecurityteam/db"
	_ "modernc.org/sqlite"
)

func TestInlineShellCaptureCombinations(t *testing.T) {
	dir := t.TempDir()
	for _, name := range []string{"check.py", "one.py", "two.py", "init.sh", "check.sh"} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte("echo fixture\n"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	cases := []struct{ name, command, status string }{
		{"escaped_quotes", `bash -c "echo \"ok\""`, "not_applicable"},
		{"escaped_backslash", `bash -c "printf '%s\\n' ok"`, "not_applicable"},
		{"escaped_parameter", `bash -c "echo \$p"`, "not_applicable"},
		{"quoted_wildcards", `bash -c "echo *.txt"`, "not_applicable"},
		{"ansi_quotes", `bash -c $'echo ok\necho done'`, "not_applicable"},
		{"quoted_loop", `for p in 80 443; do timeout 3 bash -c "echo > /dev/tcp/127.0.0.1/$p" 2>/dev/null && echo "$p OPEN" || echo "$p closed"; done; echo done | tail -30`, "not_applicable"},
		{"multiline_loop", "for p in 80 443; do\n timeout 4 bash -c \"echo > /dev/tcp/127.0.0.1/$p\" 2>/dev/null && echo \"OPEN: $p\"\ndone", "not_applicable"},
		{"braced_parameter", `for p in 80 443; do sh -c "echo ${p}"; done`, "not_applicable"},
		{"sequential_loops", `for p in 80 443; do bash -c "echo $p"; done; for p in 22; do echo "$p"; done`, "not_applicable"},
		{"unrelated_default_parameter", `for p in 80 443; do echo "${TOKEN:-unset}"; bash -c "echo $p"; done`, "not_applicable"},
		{"nested_loops", `for p in 80 443; do for q in one two; do bash -c "echo $p $q"; done; done`, "not_applicable"},
		{"repeated_parameter", `for p in one two; do bash -c "echo $p $p"; done`, "not_applicable"},
		{"finite_script_paths", `for p in one two; do bash -c "python3 ./$p.py"; done`, "complete"},
		{"finite_injected_code", `for p in 'ok; python3 ./check.py'; do bash -c "echo $p"; done`, "complete"},
		{"nested_inline_script", `bash -c "sh -c 'python3 ./check.py'"`, "complete"},
		{"literal_script", `bash -c 'python3 ./check.py'`, "complete"},
		{"missing_nested_script", `bash -c 'python3 ./absent.py'`, "incomplete"},
		{"unknown_outer_parameter", `bash -c "echo $UNKNOWN"`, "incomplete"},
		{"no_host_environment", `bash -c "$HOME"`, "incomplete"},
		{"unknown_script_parameter", `bash -c 'python3 "$SCRIPT"'`, "incomplete"},
		{"unexported_loop_variable", `for p in one two; do bash -c 'python3 "$p.py"'; done`, "incomplete"},
		{"dynamic_loop_items", `for p in $PORTS; do bash -c "echo $p"; done`, "incomplete"},
		{"glob_loop_items", `for p in *.py; do bash -c "python3 $p"; done`, "incomplete"},
		{"positional_loop", `for p; do bash -c "echo $p"; done`, "incomplete"},
		{"unquoted_parameter", `for p in one two; do bash -c $p; done`, "incomplete"},
		{"assignment", `for p in 80 443; do p=22; bash -c "echo $p"; done`, "incomplete"},
		{"read_builtin", `for p in 80 443; do read p; bash -c "echo $p"; done`, "incomplete"},
		{"wrapped_read", `for p in 80 443; do builtin read p; bash -c "echo $p"; done`, "incomplete"},
		{"printf_output", `for p in 80 443; do printf '%s\n' "$p"; bash -c "echo $p"; done`, "not_applicable"},
		{"printf_assignment", `for p in 80 443; do printf -v p '%s' 22; bash -c "echo $p"; done`, "incomplete"},
		{"eval_assignment", `for p in 80 443; do eval 'p=22'; bash -c "echo $p"; done`, "incomplete"},
		{"function_assignment", `change() { p=22; }; for p in 80 443; do change; bash -c "echo $p"; done`, "incomplete"},
		{"trap_assignment", `for p in 80 443; do trap 'p=22' DEBUG; bash -c "echo $p"; done`, "incomplete"},
		{"arithmetic_assignment", `for p in 80 443; do ((p++)); bash -c "echo $p"; done`, "incomplete"},
		{"parameter_assignment", `for p in 80 443; do echo ${p:=22}; bash -c "echo $p"; done`, "incomplete"},
		{"nested_same_variable", `for p in 80 443; do for p in 22; do echo done; done; bash -c "echo $p"; done`, "incomplete"},
		{"binding_does_not_escape_loop", `for p in 80 443; do echo done; done; bash -c "echo $p"`, "incomplete"},
		{"command_substitution", `bash -c "$(cat ./check.sh)"`, "incomplete"},
		{"script_in_substitution", `bash -c "echo \"$(python3 ./check.py)\""`, "incomplete"},
		{"bash_errexit_script", `bash -e ./check.sh`, "complete"},
		{"bash_long_option_script", `bash --norc ./check.sh`, "complete"},
		{"bash_option_value", `bash -o pipefail -c 'python3 ./check.py'`, "complete"},
		{"bash_combined_options", `bash -ec 'python3 ./check.py'`, "complete"},
		{"bash_init_file", `bash --rcfile ./init.sh -c 'python3 ./check.py'`, "complete"},
		{"missing_inline_body", `bash -c`, "incomplete"},
		{"option_terminator", `bash -- -c`, "incomplete"},
		{"env_split_string", `env -S 'bash ./check.sh'`, "incomplete"},
		{"unknown_wrapper_option", `timeout --unknown 3 bash ./check.sh`, "incomplete"},
		{"command_lookup", `command -v python3`, "not_applicable"},
		{"env_output", `env -i`, "not_applicable"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			args, _ := json.Marshal(map[string]string{"command": tc.command})
			in, err := BuildReviewInput(WithReviewWorkingDirectory(t.Context(), dir), "Bash", args)
			if err != nil || in.ScriptCaptureStatus != tc.status {
				t.Fatalf("status=%q want=%q error=%v scripts=%+v", in.ScriptCaptureStatus, tc.status, err, in.Scripts)
			}
			if tc.name == "finite_script_paths" && len(in.Scripts) != 2 {
				t.Fatalf("not all finite script paths were captured: %+v", in.Scripts)
			}
			if tc.name == "bash_init_file" && len(in.Scripts) != 2 {
				t.Fatalf("initialization file or inline script missing: %+v", in.Scripts)
			}
		})
	}

	wrappers := []string{"", "timeout 3 ", "timeout -s TERM -k 1 3 ", "timeout --signal=KILL --kill-after=1 3 ", "env MODE=test ", "env -u TOKEN ", "sudo -n -u root ", "nohup ", "exec -a review ", "command -p ", "builtin "}
	bodies := []string{`bash -c 'python3 ./check.py'`, `bash -ec "python3 ./check.py"`, `bash -e ./check.sh`, `bash --norc ./check.sh`}
	for wi, wrapper := range wrappers {
		for bi, body := range bodies {
			for ci, command := range []string{wrapper + body, "echo before && " + wrapper + body + " | tail -3", "if [ -n ok ]; then " + wrapper + body + "; fi"} {
				t.Run(fmt.Sprintf("wrapper_%d_body_%d_form_%d", wi, bi, ci), func(t *testing.T) {
					args, _ := json.Marshal(map[string]string{"command": command})
					in, err := BuildReviewInput(WithReviewWorkingDirectory(t.Context(), dir), "Bash", args)
					if err != nil || in.ScriptCaptureStatus != "complete" || len(in.Scripts) != 1 {
						t.Fatalf("command=%q status=%q error=%v scripts=%+v", command, in.ScriptCaptureStatus, err, in.Scripts)
					}
				})
			}
		}
	}
}

func TestInlineShellCaptureBounds(t *testing.T) {
	var items []string
	for i := range maxInlineVariants + 1 {
		items = append(items, fmt.Sprint(i))
	}
	commands := []string{
		"for p in " + strings.Join(items, " ") + `; do bash -c "echo $p"; done`,
		"for p in " + strings.Join(items[:9], " ") + "; do for q in " + strings.Join(items[:9], " ") + `; do bash -c "echo $p $q"; done; done`,
		strings.Repeat(`bash -c 'echo ok'; `, maxInlineParses+1),
	}
	for i, command := range commands {
		args, _ := json.Marshal(map[string]string{"command": command})
		in, err := BuildReviewInput(t.Context(), "Bash", args)
		if err != nil || in.ScriptCaptureStatus != "incomplete" {
			t.Errorf("case %d: unbounded inline capture: %+v %v", i, in, err)
		}
	}
}

func TestIncompleteScriptConfigDefaultsToModel(t *testing.T) {
	sqldb, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer sqldb.Close()
	if _, err := sqldb.Exec(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)`); err != nil {
		t.Fatal(err)
	}
	i := New(&db.DB{DB: sqldb})
	for _, value := range []string{"", "invalid", "ask", "model"} {
		if value != "" {
			if _, err := sqldb.Exec(`INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`, settingJudgeIncompleteScript, value); err != nil {
				t.Fatal(err)
			}
		}
		want := "model"
		if value == "ask" {
			want = "ask"
		}
		if cfg := i.GetJudgeConfig(); cfg.IncompleteScriptAction != want {
			t.Fatalf("setting=%q config=%+v", value, cfg)
		}
	}
}
func TestCommandGeneratedScriptSnapshots(t *testing.T) {
	dir := t.TempDir()
	oldPath := filepath.Join(dir, "existing.py")
	if err := os.WriteFile(oldPath, []byte("OLD CONTENT\n"), 0600); err != nil {
		t.Fatal(err)
	}
	const quotedBody = "print('$UNKNOWN \\\\n *.txt')\n"
	cases := []struct {
		name, command, status, content string
		count                          int
	}{
		{"mkdir_cd_and_create", "mkdir -p " + dir + " && cd " + dir + " && cat > chained.py <<'EOF'\nprint('chained')\nEOF\npython3 chained.py", "complete", "print('chained')\n", 1},
		{"mkdir_subdirectory_and_create", "cd " + dir + " && mkdir -p unused && cat > chained.py <<'EOF'\nprint('chained')\nEOF\npython3 chained.py", "complete", "print('chained')\n", 1},
		{"static_assignment_and_create", "B=literal && cat > chained.py <<'EOF'\nprint('$B')\nEOF\npython3 chained.py", "complete", "print('$B')\n", 1},
		{"cd_and_create", "cd " + dir + " && cat > chained.py <<'EOF'\nprint('chained')\nEOF\npython3 chained.py", "complete", "print('chained')\n", 1},
		{"cat_and_execute", "cat > chained.py <<'EOF' && python3 chained.py\nprint('chained')\nEOF", "complete", "print('chained')\n", 1},
		{"unknown_and_condition", "false && cat > existing.py <<'EOF'\nconditional\nEOF\npython3 existing.py", "incomplete", "", 1},
		{"or_condition", "false || cat > existing.py <<'EOF'\nconditional\nEOF\npython3 existing.py", "incomplete", "", 1},
		{"new_file", "cat > new.py <<'EOF'\nprint('new')\nEOF\npython3 new.py", "complete", "print('new')\n", 1},
		{"overwrite_existing", "cat > existing.py <<'EOF'\nprint('replacement')\nEOF\npython3 existing.py", "complete", "print('replacement')\n", 1},
		{"literal_quoted_body", "cat > quoted.py <<'EOF'\n" + quotedBody + "EOF\npython3 quoted.py", "complete", quotedBody, 1},
		{"double_quoted_delimiter", "cat > double.py <<\"EOF\"\nprint('$VALUE')\nEOF\npython3 double.py", "complete", "print('$VALUE')\n", 1},
		{"plain_literal_body", "cat > plain.py <<EOF\nprint('plain')\nEOF\npython3 plain.py", "complete", "print('plain')\n", 1},
		{"tab_stripping", "cat > tabs.py <<-'EOF'\n\tprint('tabs')\n\tEOF\npython3 tabs.py", "complete", "print('tabs')\n", 1},
		{"direct_shell_script", "cat > request.sh <<'EOF'\n#!/bin/bash\necho \"$1\"\nEOF\nchmod +x request.sh\n./request.sh GET | head -20", "complete", "#!/bin/bash\necho \"$1\"\n", 1},
		{"empty_body", "cat > empty.py <<'EOF'\nEOF\npython3 empty.py", "complete", "", 1},
		{"two_versions", "cat > version.py <<'EOF'\nfirst\nEOF\npython3 version.py\ncat > version.py <<'EOF'\nsecond\nEOF\npython3 version.py", "complete", "", 2},
		{"dynamic_heredoc", "cat > dynamic.py <<EOF\nprint('$UNKNOWN')\nEOF\npython3 dynamic.py", "incomplete", "", 1},
		{"command_substitution_body", "cat > dynamic.py <<EOF\n$(echo hidden)\nEOF\npython3 dynamic.py", "incomplete", "", 1},
		{"append_existing", "cat >> existing.py <<'EOF'\nadditional\nEOF\npython3 existing.py", "complete", "OLD CONTENT\nadditional\n", 1},
		{"conditional_creation", "if test yes; then cat > existing.py <<'EOF'\nconditional\nEOF\nfi\npython3 existing.py", "incomplete", "", 1},
		{"background_creation", "cat > existing.py <<'EOF' &\nbackground\nEOF\npython3 existing.py", "incomplete", "", 1},
		{"transformed_cat", "cat -n > existing.py <<'EOF'\nnumbered\nEOF\npython3 existing.py", "incomplete", "", 1},
		{"non_cat_write", "echo replacement > existing.py; python3 existing.py", "incomplete", "", 1},
		{"truncated_after_creation", "cat > existing.py <<'EOF'\noriginal\nEOF\n> existing.py\npython3 existing.py", "incomplete", "", 1},
		{"redirected_stdout", "cat > existing.py <<'EOF' >&2\nredirected\nEOF\npython3 existing.py", "incomplete", "", 1},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			args, _ := json.Marshal(map[string]string{"command": tc.command})
			in, err := BuildReviewInput(WithReviewWorkingDirectory(t.Context(), dir), "Bash", args)
			if err != nil || in.ScriptCaptureStatus != tc.status || len(in.Scripts) != tc.count {
				t.Fatalf("status=%q want=%q error=%v scripts=%+v", in.ScriptCaptureStatus, tc.status, err, in.Scripts)
			}
			if tc.status == "complete" && in.Scripts[0].Source != "command" {
				t.Fatal("generated content was mislabeled as an existing file")
			}
			if tc.status == "complete" && tc.count == 1 && in.Scripts[0].Content != tc.content {
				t.Fatalf("content=%q want=%q", in.Scripts[0].Content, tc.content)
			}
			if tc.name == "two_versions" && (in.Scripts[0].Content != "first\n" || in.Scripts[1].Content != "second\n" || in.Scripts[0].SHA256 == in.Scripts[1].SHA256) {
				t.Fatalf("script versions were collapsed: %+v", in.Scripts)
			}
		})
	}
	if content, err := os.ReadFile(oldPath); err != nil || string(content) != "OLD CONTENT\n" {
		t.Fatal("snapshot capture mutated the file")
	}
	if _, err := os.Stat(filepath.Join(dir, "new.py")); !os.IsNotExist(err) {
		t.Fatal("snapshot capture executed a file creation")
	}
}
