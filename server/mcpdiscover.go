package server

import (
	"context"
	"fmt"
	"log"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/artex/mcphttp"
	actool "github.com/Autumn-27/norma/tool"
)

// mcpClient is the shared surface of a connected MCP server (stdio, Streamable HTTP,
// or legacy SSE),
// so tools/list and cleanup are handled uniformly regardless of transport.
type mcpClient interface {
	Tools(context.Context) ([]actool.CoreTool, error)
	Close() error
}

var lookPath = exec.LookPath

// resolveStdioMCPCommand prefers a locally installed playwright-mcp binary
// when an MCP server is configured as `npx @playwright/mcp ...`. In Docker
// images where `@playwright/mcp` is globally installed, calling the binary
// directly avoids `npx` trying to hit the registry or prompting on stdin; when
// falling back to `npx`, inject `-y` so it never blocks waiting for consent.
func resolveStdioMCPCommand(command string, args []string) (string, []string) {
	out := append([]string(nil), args...)
	if filepath.Base(strings.TrimSpace(command)) != "npx" {
		return command, out
	}
	pkgIdx := -1
	hasYes := false
	for i, arg := range out {
		if arg == "-y" || arg == "--yes" {
			hasYes = true
			continue
		}
		if strings.HasPrefix(arg, "-") {
			continue
		}
		if arg == "@playwright/mcp" || strings.HasPrefix(arg, "@playwright/mcp@") {
			pkgIdx = i
		}
		break
	}
	if pkgIdx < 0 {
		return command, out
	}
	if bin, err := lookPath("playwright-mcp"); err == nil && strings.TrimSpace(bin) != "" {
		rest := make([]string, 0, len(out)-1)
		for i, arg := range out {
			if i == pkgIdx || (i < pkgIdx && (arg == "-y" || arg == "--yes")) {
				continue
			}
			rest = append(rest, arg)
		}
		return bin, rest
	}
	if !hasYes {
		out = append([]string{"-y"}, out...)
	}
	return command, out
}

// connectMCP dials one MCP server per its transport. Callers must Close the client.
// workDir sets the subprocess working directory for stdio MCP servers when non-empty.
func connectMCP(ctx context.Context, m *db.MCPServer, workDir string) (mcpClient, error) {
	switch m.Transport {
	case "stdio":
		if m.Command == "" {
			return nil, fmt.Errorf("stdio 传输缺少命令")
		}
		cmd, args := resolveStdioMCPCommand(m.Command, jsonStrSlice(m.Args))
		return newStdioMCPClient(ctx, m.Name, workDir, cmd, jsonStrMap(m.Env), args...)
	case "http":
		if m.URL == "" {
			return nil, fmt.Errorf("http 传输缺少 URL")
		}
		// env map doubles as HTTP headers (e.g. Authorization).
		return mcphttp.New(ctx, m.Name, m.URL, jsonStrMap(m.Env), m.Insecure)
	case "sse":
		if m.URL == "" {
			return nil, fmt.Errorf("sse 传输缺少 URL")
		}
		return mcphttp.NewSSE(ctx, m.Name, m.URL, jsonStrMap(m.Env), m.Insecure)
	default:
		return nil, fmt.Errorf("未知传输方式 %q", m.Transport)
	}
}

// discoverAndCacheMCP connects to one MCP, lists its tools, and persists the tool
// names to mcp_tools_cache so the UI shows them without a live connection.
func (s *Server) discoverAndCacheMCP(ctx context.Context, m *db.MCPServer) error {
	cl, err := connectMCP(ctx, m, s.m.dir)
	if err != nil {
		return err
	}
	defer cl.Close()
	ts, err := cl.Tools(ctx)
	if err != nil {
		return err
	}
	tools := make([]db.MCPTool, 0, len(ts))
	for _, t := range ts {
		tools = append(tools, db.MCPTool{Name: t.Name(), Description: t.Description()})
	}
	if err := s.m.pg.SaveMCPTools(m.ID, tools); err != nil {
		return err
	}
	log.Printf("[mcp] %s 发现 %d 个工具并已缓存", m.Name, len(tools))
	return nil
}

// discoverEmptyMCPsOnStartup fills the tool cache for any enabled MCP that has none
// yet (notably the seeded browser MCP on first run). Runs sequentially in one
// goroutine so we never spawn many stdio servers (npx) at once, and never blocks
// startup. Best-effort: a failure leaves the cache empty to retry next start.
func (s *Server) discoverEmptyMCPsOnStartup() {
	servers, err := s.m.pg.ListMCP()
	if err != nil {
		log.Printf("[mcp] 启动自动发现: 读取列表失败: %v", err)
		return
	}
	for _, m := range servers {
		if !m.Enabled || len(m.Tools) > 0 {
			continue
		}
		ctx, cancel := context.WithTimeout(s.ctx, 90*time.Second)
		if err := s.discoverAndCacheMCP(ctx, m); err != nil {
			log.Printf("[mcp] 启动自动发现 %s 失败: %v", m.Name, err)
		}
		cancel()
	}
}
