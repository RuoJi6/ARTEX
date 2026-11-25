package server

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
	"sync"

	"github.com/Autumn-27/norma/llm"
	"github.com/Autumn-27/norma/mcp"
	"github.com/Autumn-27/norma/permission"
	actool "github.com/Autumn-27/norma/tool"
)

type stdioRPCRequest struct {
	JSONRPC string `json:"jsonrpc"`
	ID      int    `json:"id,omitempty"`
	Method  string `json:"method"`
	Params  any    `json:"params,omitempty"`
}

type stdioRPCResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      int             `json:"id"`
	Result  json.RawMessage `json:"result"`
	Error   *stdioRPCError  `json:"error"`
}

type stdioRPCError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

func (e *stdioRPCError) Error() string {
	return fmt.Sprintf("mcp rpc error %d: %s", e.Code, e.Message)
}

type stdioRemoteTool struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	InputSchema map[string]any `json:"inputSchema"`
}

// tailBuffer keeps the last limit bytes written to it so child-process stderr
// can surface actionable diagnostics without unbounded memory growth.
type tailBuffer struct {
	mu    sync.Mutex
	limit int
	buf   []byte
}

func newTailBuffer(limit int) *tailBuffer {
	return &tailBuffer{limit: limit}
}

func (t *tailBuffer) Write(p []byte) (int, error) {
	t.mu.Lock()
	defer t.mu.Unlock()
	if len(p) >= t.limit {
		t.buf = append(t.buf[:0], p[len(p)-t.limit:]...)
		return len(p), nil
	}
	if excess := len(t.buf) + len(p) - t.limit; excess > 0 {
		copy(t.buf, t.buf[excess:])
		t.buf = t.buf[:len(t.buf)-excess]
	}
	t.buf = append(t.buf, p...)
	return len(p), nil
}

func (t *tailBuffer) String() string {
	t.mu.Lock()
	defer t.mu.Unlock()
	return strings.TrimSpace(string(t.buf))
}

// stdioMCPClient speaks JSON-RPC 2.0 over newline-delimited stdio to a child
// MCP server spawned in an explicit working directory (so file-writing tools
// such as Playwright's browser_take_screenshot resolve relative paths inside
// the active agent session/workspace rather than the server binary's CWD).
type stdioMCPClient struct {
	server  string
	w       io.Writer
	mu      sync.Mutex
	nextID  int
	pending map[int]chan stdioRPCResponse
	closeCh chan struct{}
	once    sync.Once

	cmd       *exec.Cmd
	stdin     io.Closer
	stderr    *tailBuffer
	closeOnce sync.Once
}

func newStdioMCPClient(ctx context.Context, server, workDir, command string, env map[string]string, args ...string) (*stdioMCPClient, error) {
	cmd := exec.Command(command, args...)
	if strings.TrimSpace(workDir) != "" {
		cmd.Dir = workDir
	}
	if len(env) > 0 {
		cmd.Env = os.Environ()
		for k, v := range env {
			cmd.Env = append(cmd.Env, k+"="+v)
		}
	}
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	stderr := newTailBuffer(4096)
	cmd.Stderr = stderr
	if err := cmd.Start(); err != nil {
		return nil, err
	}
	c := &stdioMCPClient{
		server:  server,
		w:       stdin,
		pending: map[int]chan stdioRPCResponse{},
		closeCh: make(chan struct{}),
		cmd:     cmd,
		stdin:   stdin,
		stderr:  stderr,
	}
	go c.readLoop(stdout)
	if err := c.initialize(ctx); err != nil {
		_ = c.Close()
		return nil, err
	}
	return c, nil
}

func (c *stdioMCPClient) readLoop(r io.Reader) {
	br := bufio.NewReaderSize(r, 64*1024)
	for {
		line, err := br.ReadBytes('\n')
		line = bytes.TrimSpace(line)
		if len(line) > 0 {
			var resp stdioRPCResponse
			if json.Unmarshal(line, &resp) == nil && resp.ID != 0 {
				c.mu.Lock()
				ch := c.pending[resp.ID]
				delete(c.pending, resp.ID)
				c.mu.Unlock()
				if ch != nil {
					ch <- resp
				}
			}
		}
		if err != nil {
			if !errors.Is(err, io.EOF) {
				break
			}
			break
		}
	}
	c.once.Do(func() { close(c.closeCh) })
}

func (c *stdioMCPClient) writeLocked(v any) error {
	data, err := json.Marshal(v)
	if err != nil {
		return err
	}
	data = append(data, '\n')
	_, err = c.w.Write(data)
	return err
}

func (c *stdioMCPClient) notify(method string, params any) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.writeLocked(stdioRPCRequest{JSONRPC: "2.0", Method: method, Params: params})
}

func (c *stdioMCPClient) call(ctx context.Context, method string, params any) (json.RawMessage, error) {
	c.mu.Lock()
	c.nextID++
	id := c.nextID
	ch := make(chan stdioRPCResponse, 1)
	c.pending[id] = ch
	err := c.writeLocked(stdioRPCRequest{JSONRPC: "2.0", ID: id, Method: method, Params: params})
	c.mu.Unlock()
	if err != nil {
		return nil, err
	}
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-c.closeCh:
		if msg := c.stderr.String(); msg != "" {
			return nil, fmt.Errorf("mcp: connection closed (%s)", msg)
		}
		return nil, fmt.Errorf("mcp: connection closed")
	case resp := <-ch:
		if resp.Error != nil {
			return nil, resp.Error
		}
		return resp.Result, nil
	}
}

func (c *stdioMCPClient) initialize(ctx context.Context) error {
	_, err := c.call(ctx, "initialize", map[string]any{
		"protocolVersion": "2024-11-05",
		"capabilities":    map[string]any{},
		"clientInfo":      map[string]any{"name": "norma", "version": "0.2"},
	})
	if err != nil {
		return err
	}
	return c.notify("notifications/initialized", map[string]any{})
}

func (c *stdioMCPClient) Tools(ctx context.Context) ([]actool.CoreTool, error) {
	raw, err := c.call(ctx, "tools/list", map[string]any{})
	if err != nil {
		return nil, err
	}
	var res struct {
		Tools []stdioRemoteTool `json:"tools"`
	}
	if err := json.Unmarshal(raw, &res); err != nil {
		return nil, err
	}
	out := make([]actool.CoreTool, 0, len(res.Tools))
	for _, rt := range res.Tools {
		out = append(out, c.wrap(rt))
	}
	return out, nil
}

func (c *stdioMCPClient) wrap(rt stdioRemoteTool) actool.CoreTool {
	schema := rt.InputSchema
	if schema == nil {
		schema = map[string]any{"type": "object"}
	}
	full := mcp.ToolName(c.server, rt.Name)
	return actool.Build(actool.Spec{
		Name:        full,
		Description: rt.Description,
		Schema:      schema,
		Permissions: func(context.Context, json.RawMessage, permission.Context) permission.Decision {
			return permission.AskUser("call MCP tool " + full + "?")
		},
		Run: func(ctx context.Context, in json.RawMessage, tc *actool.ToolContext) (actool.Result, error) {
			var args any
			if len(in) > 0 {
				_ = json.Unmarshal(in, &args)
			}
			raw, err := c.call(ctx, "tools/call", map[string]any{"name": rt.Name, "arguments": args})
			if err != nil {
				return actool.Errorf("Error: " + err.Error()), nil
			}
			var res struct {
				Content []struct {
					Type string `json:"type"`
					Text string `json:"text"`
				} `json:"content"`
				IsError bool `json:"isError"`
			}
			if err := json.Unmarshal(raw, &res); err != nil {
				return actool.Errorf("Error: bad MCP response: " + err.Error()), nil
			}
			var text string
			for _, blk := range res.Content {
				text += blk.Text
			}
			return actool.Result{Content: []llm.ContentBlock{llm.TextBlock(actool.Capture(tc, text))}, IsError: res.IsError}, nil
		},
	})
}

func (c *stdioMCPClient) Close() error {
	c.closeOnce.Do(func() {
		if c.stdin != nil {
			_ = c.stdin.Close()
		}
		if c.cmd != nil && c.cmd.Process != nil {
			_ = c.cmd.Process.Kill()
			_ = c.cmd.Wait()
		}
	})
	return nil
}
